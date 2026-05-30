'use strict';

const { pool } = require('../db/pool');

function getRequestIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || (req.socket && req.socket.remoteAddress) || '';
}

function getTriadLimit() {
  const raw = process.env.MAX_GROUPS_OF_3;
  const max = Number.parseInt(raw, 10);
  return Number.isFinite(max) && max > 0 ? max : 0;
}

async function getTriadStatus(db) {
  const max = getTriadLimit();
  const result = await db.query(
    "SELECT COUNT(*) FROM grp_groups WHERE group_size = 3 AND status IN ('pending', 'confirmed')"
  );
  const used = Number(result.rows[0].count || 0);
  return {
    max,
    used,
    available: max > 0 && used < max,
  };
}

async function getSessionStudent(db, req, fingerprint) {
  const ip = getRequestIp(req);
  const result = await db.query(
    `SELECT s.student_id, st.full_name
     FROM grp_sessions s
     JOIN grp_students st ON st.id = s.student_id
     WHERE s.fingerprint = $1 AND s.ip = $2`,
    [fingerprint, ip]
  );
  return result.rows[0] || null;
}

async function isStudentWithSession(db, studentId) {
  const result = await db.query(
    'SELECT 1 FROM grp_sessions WHERE student_id = $1 LIMIT 1',
    [studentId]
  );
  return result.rows.length > 0;
}

async function isStudentUnavailableForGroup(db, studentId) {
  const result = await db.query(
    `SELECT 1 FROM (
      SELECT student_id AS id FROM grp_sessions
      UNION
      SELECT leader_student_id FROM grp_groups
      UNION
      SELECT second_student_id FROM grp_groups
      UNION
      SELECT third_student_id FROM grp_groups WHERE third_student_id IS NOT NULL
    ) u WHERE u.id = $1 LIMIT 1`,
    [studentId]
  );
  return result.rows.length > 0;
}

async function getAvailableForIdentification(db) {
  const result = await db.query(
    `SELECT id, full_name
     FROM grp_students
     WHERE id NOT IN (SELECT student_id FROM grp_sessions)
     ORDER BY full_name`
  );
  return result.rows;
}

async function getAvailableForGroup(db, excludedIds) {
  const params = [];
  let filter = '';
  if (excludedIds && excludedIds.length) {
    params.push(...excludedIds);
    const placeholders = excludedIds.map((_, i) => `$${i + 1}`).join(', ');
    filter = `AND s.id NOT IN (${placeholders})`;
  }

  const result = await db.query(
    `WITH unavailable AS (
       SELECT student_id AS id FROM grp_sessions
       UNION
       SELECT leader_student_id FROM grp_groups
       UNION
       SELECT second_student_id FROM grp_groups
       UNION
       SELECT third_student_id FROM grp_groups WHERE third_student_id IS NOT NULL
     )
     SELECT s.id, s.full_name
     FROM grp_students s
     LEFT JOIN unavailable u ON u.id = s.id
     WHERE u.id IS NULL ${filter}
     ORDER BY s.full_name`,
    params
  );

  return result.rows;
}

async function getGroupForStudent(db, studentId) {
  const result = await db.query(
    `SELECT g.*, 
        s1.full_name AS leader_name,
        s2.full_name AS second_name,
        s3.full_name AS third_name,
        subj.title AS subject_title,
        subj.css AS subject_css
     FROM grp_groups g
     JOIN grp_students s1 ON s1.id = g.leader_student_id
     JOIN grp_students s2 ON s2.id = g.second_student_id
     LEFT JOIN grp_students s3 ON s3.id = g.third_student_id
     LEFT JOIN grp_subjects subj ON subj.id = g.subject_id
     WHERE g.leader_student_id = $1
        OR g.second_student_id = $1
        OR g.third_student_id = $1
     ORDER BY g.created_at DESC
     LIMIT 1`,
    [studentId]
  );
  return result.rows[0] || null;
}

function mapGroupResponse(row, studentId) {
  const leaderId = Number(row.leader_student_id);
  const secondId = Number(row.second_student_id);
  const thirdId = row.third_student_id ? Number(row.third_student_id) : null;
  const groupSize = Number(row.group_size);
  const status = row.status;
  const acceptedSecond = Boolean(row.accepted_second);
  const acceptedThird = Boolean(row.accepted_third);

  const canRespond =
    status === 'pending' &&
    ((studentId === secondId && !acceptedSecond) ||
      (studentId === thirdId && !acceptedThird));

  return {
    id: Number(row.id),
    groupSize,
    status,
    leaderId,
    secondId,
    thirdId,
    subjectId: row.subject_id ? Number(row.subject_id) : null,
    subjectTitle: row.subject_title || null,
    subjectCss: row.subject_css || null,
    leaderName: row.leader_name,
    secondName: row.second_name,
    thirdName: row.third_name || null,
    acceptedSecond,
    acceptedThird,
    needsThird: groupSize === 3 && !thirdId,
    needsSubject: !row.subject_id,
    canRespond,
    createdAt: row.created_at,
  };
}

module.exports = async function studentRoutes(app) {
  const db = app.db || pool;

  app.get('/available-initial', async () => {
    const students = await getAvailableForIdentification(db);
    return { students };
  });

  app.get('/triad-status', async () => {
    const status = await getTriadStatus(db);
    return status;
  });

  app.post('/register', async (req, reply) => {
    const { studentId, fingerprint } = req.body || {};
    if (!studentId || !fingerprint) {
      return reply.code(400).send({ error: 'studentId and fingerprint are required' });
    }

    const ip = getRequestIp(req);
    const existing = await db.query(
      'SELECT student_id FROM grp_sessions WHERE fingerprint = $1 AND ip = $2',
      [fingerprint, ip]
    );

    if (existing.rows[0]) {
      return { ok: true, studentId: Number(existing.rows[0].student_id) };
    }

    const hasSession = await isStudentWithSession(db, studentId);
    if (hasSession) {
      return reply.code(409).send({ error: 'Student already locked' });
    }

    await db.query(
      'INSERT INTO grp_sessions (student_id, fingerprint, ip) VALUES ($1, $2, $3)',
      [studentId, fingerprint, ip]
    );

    return { ok: true, studentId: Number(studentId) };
  });

  app.post('/me', async (req) => {
    const { fingerprint } = req.body || {};
    if (!fingerprint) {
      return { found: false };
    }

    const session = await getSessionStudent(db, req, fingerprint);
    if (!session) {
      return { found: false };
    }

    const student = {
      id: Number(session.student_id),
      fullName: session.full_name,
    };

    const groupRow = await getGroupForStudent(db, student.id);
    const group = groupRow ? mapGroupResponse(groupRow, student.id) : null;

    return { found: true, student, group };
  });

  app.get('/available-partners', async (req, reply) => {
    const fingerprint = req.query && req.query.fingerprint;
    if (!fingerprint) {
      return reply.code(400).send({ error: 'fingerprint is required' });
    }

    const session = await getSessionStudent(db, req, fingerprint);
    if (!session) {
      return reply.code(401).send({ error: 'Session not found' });
    }

    const leaderId = Number(session.student_id);
    const existingGroup = await getGroupForStudent(db, leaderId);
    if (existingGroup) {
      return reply.code(409).send({ error: 'Student already in a group' });
    }

    const students = await getAvailableForGroup(db, [leaderId]);
    return { students };
  });

  app.get('/available-third', async (req, reply) => {
    const fingerprint = req.query && req.query.fingerprint;
    const groupId = req.query && Number(req.query.groupId || 0);
    if (!fingerprint || !groupId) {
      return reply.code(400).send({ error: 'fingerprint and groupId are required' });
    }

    const session = await getSessionStudent(db, req, fingerprint);
    if (!session) {
      return reply.code(401).send({ error: 'Session not found' });
    }

    const leaderId = Number(session.student_id);
    const groupResult = await db.query(
      'SELECT * FROM grp_groups WHERE id = $1',
      [groupId]
    );
    const group = groupResult.rows[0];
    if (!group || Number(group.leader_student_id) !== leaderId) {
      return reply.code(403).send({ error: 'Not allowed' });
    }

    if (Number(group.group_size) !== 3) {
      return reply.code(409).send({ error: 'Group is not a triad' });
    }

    if (group.third_student_id) {
      return reply.code(409).send({ error: 'Third student already set' });
    }

    const students = await getAvailableForGroup(db, [leaderId, Number(group.second_student_id)]);
    return { students };
  });

  app.post('/group/create', async (req, reply) => {
    const { fingerprint, partnerId, groupSize } = req.body || {};
    if (!fingerprint || !partnerId || !groupSize) {
      return reply.code(400).send({ error: 'fingerprint, partnerId, groupSize are required' });
    }

    const session = await getSessionStudent(db, req, fingerprint);
    if (!session) {
      return reply.code(401).send({ error: 'Session not found' });
    }

    const leaderId = Number(session.student_id);
    const size = Number(groupSize);
    if (![2, 3].includes(size)) {
      return reply.code(400).send({ error: 'groupSize must be 2 or 3' });
    }

    if (leaderId === Number(partnerId)) {
      return reply.code(409).send({ error: 'Partner cannot be the same student' });
    }

    const existingGroup = await getGroupForStudent(db, leaderId);
    if (existingGroup) {
      return reply.code(409).send({ error: 'Student already in a group' });
    }

    if (size === 3) {
      const triadStatus = await getTriadStatus(db);
      if (!triadStatus.available) {
        return reply.code(409).send({ error: 'Triad limit reached' });
      }
    }

    const partnerUnavailable = await isStudentUnavailableForGroup(db, partnerId);
    if (partnerUnavailable) {
      return reply.code(409).send({ error: 'Partner not available' });
    }

    const insert = await db.query(
      `INSERT INTO grp_groups
       (leader_student_id, second_student_id, group_size, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING id`,
      [leaderId, partnerId, size]
    );

    return { ok: true, groupId: Number(insert.rows[0].id) };
  });

  app.post('/group/third', async (req, reply) => {
    const { fingerprint, groupId, thirdStudentId } = req.body || {};
    if (!fingerprint || !groupId || !thirdStudentId) {
      return reply.code(400).send({ error: 'fingerprint, groupId, thirdStudentId are required' });
    }

    const session = await getSessionStudent(db, req, fingerprint);
    if (!session) {
      return reply.code(401).send({ error: 'Session not found' });
    }

    const leaderId = Number(session.student_id);
    const groupResult = await db.query('SELECT * FROM grp_groups WHERE id = $1', [groupId]);
    const group = groupResult.rows[0];
    if (!group || Number(group.leader_student_id) !== leaderId) {
      return reply.code(403).send({ error: 'Not allowed' });
    }

    if (Number(group.group_size) !== 3) {
      return reply.code(409).send({ error: 'Group is not a triad' });
    }

    if (group.third_student_id) {
      return reply.code(409).send({ error: 'Third student already set' });
    }

    if (leaderId === Number(thirdStudentId) || Number(group.second_student_id) === Number(thirdStudentId)) {
      return reply.code(409).send({ error: 'Third student must be different' });
    }

    const thirdUnavailable = await isStudentUnavailableForGroup(db, thirdStudentId);
    if (thirdUnavailable) {
      return reply.code(409).send({ error: 'Third student not available' });
    }

    await db.query(
      'UPDATE grp_groups SET third_student_id = $1 WHERE id = $2',
      [thirdStudentId, groupId]
    );

    return { ok: true };
  });

  app.post('/group/subject', async (req, reply) => {
    const { fingerprint, groupId, subjectId } = req.body || {};
    if (!fingerprint || !groupId || !subjectId) {
      return reply.code(400).send({ error: 'fingerprint, groupId, subjectId are required' });
    }

    const session = await getSessionStudent(db, req, fingerprint);
    if (!session) {
      return reply.code(401).send({ error: 'Session not found' });
    }

    const leaderId = Number(session.student_id);
    const groupResult = await db.query('SELECT * FROM grp_groups WHERE id = $1', [groupId]);
    const group = groupResult.rows[0];
    if (!group || Number(group.leader_student_id) !== leaderId) {
      return reply.code(403).send({ error: 'Not allowed' });
    }

    if (Number(group.group_size) === 3 && !group.third_student_id) {
      return reply.code(409).send({ error: 'Third student not set yet' });
    }

    if (group.subject_id) {
      return reply.code(409).send({ error: 'Subject already set' });
    }

    const subject = await db.query('SELECT id FROM grp_subjects WHERE id = $1', [subjectId]);
    if (!subject.rows[0]) {
      return reply.code(404).send({ error: 'Subject not found' });
    }

    await db.query('UPDATE grp_groups SET subject_id = $1 WHERE id = $2', [subjectId, groupId]);
    return { ok: true };
  });

  app.get('/subjects', async () => {
    const result = await db.query(
      `SELECT id, title, description, css
       FROM grp_subjects
       WHERE id NOT IN (
         SELECT subject_id FROM grp_groups
         WHERE status = 'confirmed' AND subject_id IS NOT NULL
       )
       ORDER BY id`
    );
    return { subjects: result.rows };
  });

  app.post('/group/respond', async (req, reply) => {
    const { fingerprint, groupId, decision } = req.body || {};
    if (!fingerprint || !groupId || !decision) {
      return reply.code(400).send({ error: 'fingerprint, groupId, decision are required' });
    }

    const session = await getSessionStudent(db, req, fingerprint);
    if (!session) {
      return reply.code(401).send({ error: 'Session not found' });
    }

    const studentId = Number(session.student_id);
    const groupResult = await db.query('SELECT * FROM grp_groups WHERE id = $1', [groupId]);
    const group = groupResult.rows[0];
    if (!group) {
      return reply.code(404).send({ error: 'Group not found' });
    }

    if (group.status !== 'pending') {
      return reply.code(409).send({ error: 'Group already closed' });
    }

    const secondId = Number(group.second_student_id);
    const thirdId = group.third_student_id ? Number(group.third_student_id) : null;
    const isSecond = studentId === secondId;
    const isThird = studentId === thirdId;

    if (!isSecond && !isThird) {
      return reply.code(403).send({ error: 'Not allowed' });
    }

    if (decision === 'refuse') {
      const memberIds = [
        Number(group.leader_student_id),
        secondId,
        thirdId,
      ].filter(Boolean);

      try {
        await db.query('BEGIN');
        await db.query('DELETE FROM grp_groups WHERE id = $1', [groupId]);
        await db.query(
          'DELETE FROM grp_sessions WHERE student_id = ANY($1::int[])',
          [memberIds]
        );
        await db.query('COMMIT');
      } catch (err) {
        await db.query('ROLLBACK');
        throw err;
      }

      return { ok: true, status: 'refused' };
    }

    if (decision !== 'accept') {
      return reply.code(400).send({ error: 'decision must be accept or refuse' });
    }

    if (isSecond && !group.accepted_second) {
      await db.query('UPDATE grp_groups SET accepted_second = true WHERE id = $1', [groupId]);
    }
    if (isThird && !group.accepted_third) {
      await db.query('UPDATE grp_groups SET accepted_third = true WHERE id = $1', [groupId]);
    }

    const updated = await db.query(
      'SELECT group_size, accepted_second, accepted_third FROM grp_groups WHERE id = $1',
      [groupId]
    );
    const updatedRow = updated.rows[0];
    const shouldConfirm =
      Number(updatedRow.group_size) === 2
        ? updatedRow.accepted_second
        : updatedRow.accepted_second && updatedRow.accepted_third;

    if (shouldConfirm) {
      await db.query('UPDATE grp_groups SET status = \'confirmed\' WHERE id = $1', [groupId]);
      return { ok: true, status: 'confirmed' };
    }

    return { ok: true, status: 'pending' };
  });
};
