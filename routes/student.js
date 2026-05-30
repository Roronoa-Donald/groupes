'use strict';

const { pool } = require('../db/pool');

function maskValue(value) {
  if (value === null || value === undefined) {
    return value;
  }
  const str = String(value);
  if (str.length <= 8) {
    return str;
  }
  return `${str.slice(0, 4)}...${str.slice(-3)}`;
}

function summarizeParams(params) {
  if (!Array.isArray(params)) {
    return [];
  }
  return params.map((value) => {
    if (typeof value === 'string') {
      return maskValue(value);
    }
    return value;
  });
}

function makeDbQuery(log, db) {
  return async (label, text, params) => {
    const start = Date.now();
    try {
      const result = await db.query(text, params);
      log.info(
        {
          label,
          durationMs: Date.now() - start,
          rowCount: typeof result.rowCount === 'number' ? result.rowCount : result.rows.length,
          params: summarizeParams(params),
        },
        'db query'
      );
      return result;
    } catch (err) {
      log.error(
        {
          label,
          durationMs: Date.now() - start,
          params: summarizeParams(params),
          err: err.message,
        },
        'db query failed'
      );
      throw err;
    }
  };
}

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

async function getTriadStatus(dbQuery) {
  const max = getTriadLimit();
  const result = await dbQuery(
    'triad-status',
    "SELECT COUNT(*) FROM grp_groups WHERE group_size = 3 AND status IN ('pending', 'confirmed')"
  );
  const used = Number(result.rows[0].count || 0);
  return {
    max,
    used,
    available: max > 0 && used < max,
  };
}

async function getSessionStudent(dbQuery, req, fingerprint) {
  const ip = getRequestIp(req);
  const result = await dbQuery(
    'session-student',
    `SELECT s.student_id, st.full_name
     FROM grp_sessions s
     JOIN grp_students st ON st.id = s.student_id
     WHERE s.fingerprint = $1 AND s.ip = $2`,
    [fingerprint, ip]
  );
  return result.rows[0] || null;
}

async function isStudentWithSession(dbQuery, studentId) {
  const result = await dbQuery(
    'student-has-session',
    'SELECT 1 FROM grp_sessions WHERE student_id = $1 LIMIT 1',
    [studentId]
  );
  return result.rows.length > 0;
}

async function isStudentUnavailableForGroup(dbQuery, studentId) {
  const result = await dbQuery(
    'student-unavailable',
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

async function getAvailableForIdentification(dbQuery) {
  const result = await dbQuery(
    'available-identification',
    `SELECT id, full_name
     FROM grp_students
     WHERE id NOT IN (SELECT student_id FROM grp_sessions)
     ORDER BY full_name`
  );
  return result.rows;
}

async function getAvailableForGroup(dbQuery, excludedIds) {
  const params = [];
  let filter = '';
  if (excludedIds && excludedIds.length) {
    params.push(...excludedIds);
    const placeholders = excludedIds.map((_, i) => `$${i + 1}`).join(', ');
    filter = `AND s.id NOT IN (${placeholders})`;
  }

  const result = await dbQuery(
    'available-for-group',
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

async function getGroupForStudent(dbQuery, studentId) {
  const result = await dbQuery(
    'group-for-student',
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
  const dbQuery = makeDbQuery(app.log, db);

  app.get('/available-initial', async () => {
    app.log.info({ route: 'student/available-initial' }, 'route start');
    const students = await getAvailableForIdentification(dbQuery);
    app.log.info({ route: 'student/available-initial', count: students.length }, 'route done');
    return { students };
  });

  app.get('/triad-status', async () => {
    app.log.info({ route: 'student/triad-status' }, 'route start');
    const status = await getTriadStatus(dbQuery);
    app.log.info({ route: 'student/triad-status', status }, 'route done');
    return status;
  });

  app.post('/register', async (req, reply) => {
    app.log.info({ route: 'student/register' }, 'route start');
    const { studentId, fingerprint } = req.body || {};
    if (!studentId || !fingerprint) {
      app.log.warn({ route: 'student/register' }, 'missing fields');
      return reply.code(400).send({ error: 'studentId and fingerprint are required' });
    }

    const ip = getRequestIp(req);
    const existing = await dbQuery(
      'register-existing',
      'SELECT student_id FROM grp_sessions WHERE fingerprint = $1 AND ip = $2',
      [fingerprint, ip]
    );

    if (existing.rows[0]) {
      app.log.info(
        { route: 'student/register', studentId: existing.rows[0].student_id },
        'session exists'
      );
      return { ok: true, studentId: Number(existing.rows[0].student_id) };
    }

    const hasSession = await isStudentWithSession(dbQuery, studentId);
    if (hasSession) {
      app.log.warn({ route: 'student/register', studentId }, 'student locked');
      return reply.code(409).send({ error: 'Student already locked' });
    }

    await dbQuery(
      'register-insert',
      'INSERT INTO grp_sessions (student_id, fingerprint, ip) VALUES ($1, $2, $3)',
      [studentId, fingerprint, ip]
    );

    app.log.info({ route: 'student/register', studentId }, 'route done');
    return { ok: true, studentId: Number(studentId) };
  });

  app.post('/me', async (req) => {
    app.log.info({ route: 'student/me' }, 'route start');
    const { fingerprint } = req.body || {};
    if (!fingerprint) {
      app.log.warn({ route: 'student/me' }, 'missing fingerprint');
      return { found: false };
    }

    const session = await getSessionStudent(dbQuery, req, fingerprint);
    if (!session) {
      app.log.info({ route: 'student/me' }, 'session not found');
      return { found: false };
    }

    const student = {
      id: Number(session.student_id),
      fullName: session.full_name,
    };

    const groupRow = await getGroupForStudent(dbQuery, student.id);
    const group = groupRow ? mapGroupResponse(groupRow, student.id) : null;

    app.log.info({ route: 'student/me', studentId: student.id }, 'route done');
    return { found: true, student, group };
  });

  app.get('/available-partners', async (req, reply) => {
    app.log.info({ route: 'student/available-partners' }, 'route start');
    const fingerprint = req.query && req.query.fingerprint;
    if (!fingerprint) {
      app.log.warn({ route: 'student/available-partners' }, 'missing fingerprint');
      return reply.code(400).send({ error: 'fingerprint is required' });
    }

    const session = await getSessionStudent(dbQuery, req, fingerprint);
    if (!session) {
      app.log.warn({ route: 'student/available-partners' }, 'session not found');
      return reply.code(401).send({ error: 'Session not found' });
    }

    const leaderId = Number(session.student_id);
    const existingGroup = await getGroupForStudent(dbQuery, leaderId);
    if (existingGroup) {
      app.log.warn({ route: 'student/available-partners', leaderId }, 'already in group');
      return reply.code(409).send({ error: 'Student already in a group' });
    }

    const students = await getAvailableForGroup(dbQuery, [leaderId]);
    app.log.info(
      { route: 'student/available-partners', count: students.length },
      'route done'
    );
    return { students };
  });

  app.get('/available-third', async (req, reply) => {
    app.log.info({ route: 'student/available-third' }, 'route start');
    const fingerprint = req.query && req.query.fingerprint;
    const groupId = req.query && Number(req.query.groupId || 0);
    if (!fingerprint || !groupId) {
      app.log.warn({ route: 'student/available-third' }, 'missing params');
      return reply.code(400).send({ error: 'fingerprint and groupId are required' });
    }

    const session = await getSessionStudent(dbQuery, req, fingerprint);
    if (!session) {
      app.log.warn({ route: 'student/available-third' }, 'session not found');
      return reply.code(401).send({ error: 'Session not found' });
    }

    const leaderId = Number(session.student_id);
    const groupResult = await dbQuery(
      'available-third-group',
      'SELECT * FROM grp_groups WHERE id = $1',
      [groupId]
    );
    const group = groupResult.rows[0];
    if (!group || Number(group.leader_student_id) !== leaderId) {
      app.log.warn({ route: 'student/available-third', leaderId }, 'not allowed');
      return reply.code(403).send({ error: 'Not allowed' });
    }

    if (Number(group.group_size) !== 3) {
      app.log.warn({ route: 'student/available-third', groupId }, 'not triad');
      return reply.code(409).send({ error: 'Group is not a triad' });
    }

    if (group.third_student_id) {
      app.log.warn({ route: 'student/available-third', groupId }, 'third already set');
      return reply.code(409).send({ error: 'Third student already set' });
    }

    const students = await getAvailableForGroup(dbQuery, [leaderId, Number(group.second_student_id)]);
    app.log.info({ route: 'student/available-third', count: students.length }, 'route done');
    return { students };
  });

  app.post('/group/create', async (req, reply) => {
    app.log.info({ route: 'student/group/create' }, 'route start');
    const { fingerprint, partnerId, groupSize } = req.body || {};
    if (!fingerprint || !partnerId || !groupSize) {
      app.log.warn({ route: 'student/group/create' }, 'missing fields');
      return reply.code(400).send({ error: 'fingerprint, partnerId, groupSize are required' });
    }

    const session = await getSessionStudent(dbQuery, req, fingerprint);
    if (!session) {
      app.log.warn({ route: 'student/group/create' }, 'session not found');
      return reply.code(401).send({ error: 'Session not found' });
    }

    const leaderId = Number(session.student_id);
    const size = Number(groupSize);
    if (![2, 3].includes(size)) {
      app.log.warn({ route: 'student/group/create', size }, 'invalid size');
      return reply.code(400).send({ error: 'groupSize must be 2 or 3' });
    }

    if (leaderId === Number(partnerId)) {
      app.log.warn({ route: 'student/group/create', leaderId }, 'same partner');
      return reply.code(409).send({ error: 'Partner cannot be the same student' });
    }

    const existingGroup = await getGroupForStudent(dbQuery, leaderId);
    if (existingGroup) {
      app.log.warn({ route: 'student/group/create', leaderId }, 'already in group');
      return reply.code(409).send({ error: 'Student already in a group' });
    }

    if (size === 3) {
      const triadStatus = await getTriadStatus(dbQuery);
      if (!triadStatus.available) {
        app.log.warn({ route: 'student/group/create' }, 'triad limit reached');
        return reply.code(409).send({ error: 'Triad limit reached' });
      }
    }

    const partnerUnavailable = await isStudentUnavailableForGroup(dbQuery, partnerId);
    if (partnerUnavailable) {
      app.log.warn({ route: 'student/group/create', partnerId }, 'partner unavailable');
      return reply.code(409).send({ error: 'Partner not available' });
    }

    const insert = await dbQuery(
      'group-create',
      `INSERT INTO grp_groups
       (leader_student_id, second_student_id, group_size, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING id`,
      [leaderId, partnerId, size]
    );

    app.log.info({ route: 'student/group/create', groupId: insert.rows[0].id }, 'route done');
    return { ok: true, groupId: Number(insert.rows[0].id) };
  });

  app.post('/group/third', async (req, reply) => {
    app.log.info({ route: 'student/group/third' }, 'route start');
    const { fingerprint, groupId, thirdStudentId } = req.body || {};
    if (!fingerprint || !groupId || !thirdStudentId) {
      app.log.warn({ route: 'student/group/third' }, 'missing fields');
      return reply.code(400).send({ error: 'fingerprint, groupId, thirdStudentId are required' });
    }

    const session = await getSessionStudent(dbQuery, req, fingerprint);
    if (!session) {
      app.log.warn({ route: 'student/group/third' }, 'session not found');
      return reply.code(401).send({ error: 'Session not found' });
    }

    const leaderId = Number(session.student_id);
    const groupResult = await dbQuery(
      'group-third-fetch',
      'SELECT * FROM grp_groups WHERE id = $1',
      [groupId]
    );
    const group = groupResult.rows[0];
    if (!group || Number(group.leader_student_id) !== leaderId) {
      app.log.warn({ route: 'student/group/third', leaderId }, 'not allowed');
      return reply.code(403).send({ error: 'Not allowed' });
    }

    if (Number(group.group_size) !== 3) {
      app.log.warn({ route: 'student/group/third', groupId }, 'not triad');
      return reply.code(409).send({ error: 'Group is not a triad' });
    }

    if (group.third_student_id) {
      app.log.warn({ route: 'student/group/third', groupId }, 'third already set');
      return reply.code(409).send({ error: 'Third student already set' });
    }

    if (leaderId === Number(thirdStudentId) || Number(group.second_student_id) === Number(thirdStudentId)) {
      app.log.warn({ route: 'student/group/third', thirdStudentId }, 'third must differ');
      return reply.code(409).send({ error: 'Third student must be different' });
    }

    const thirdUnavailable = await isStudentUnavailableForGroup(dbQuery, thirdStudentId);
    if (thirdUnavailable) {
      app.log.warn({ route: 'student/group/third', thirdStudentId }, 'third unavailable');
      return reply.code(409).send({ error: 'Third student not available' });
    }

    await dbQuery(
      'group-third-update',
      'UPDATE grp_groups SET third_student_id = $1 WHERE id = $2',
      [thirdStudentId, groupId]
    );

    app.log.info({ route: 'student/group/third', groupId }, 'route done');
    return { ok: true };
  });

  app.post('/group/subject', async (req, reply) => {
    app.log.info({ route: 'student/group/subject' }, 'route start');
    const { fingerprint, groupId, subjectId } = req.body || {};
    if (!fingerprint || !groupId || !subjectId) {
      app.log.warn({ route: 'student/group/subject' }, 'missing fields');
      return reply.code(400).send({ error: 'fingerprint, groupId, subjectId are required' });
    }

    const session = await getSessionStudent(dbQuery, req, fingerprint);
    if (!session) {
      app.log.warn({ route: 'student/group/subject' }, 'session not found');
      return reply.code(401).send({ error: 'Session not found' });
    }

    const leaderId = Number(session.student_id);
    const groupResult = await dbQuery(
      'group-subject-fetch',
      'SELECT * FROM grp_groups WHERE id = $1',
      [groupId]
    );
    const group = groupResult.rows[0];
    if (!group || Number(group.leader_student_id) !== leaderId) {
      app.log.warn({ route: 'student/group/subject', leaderId }, 'not allowed');
      return reply.code(403).send({ error: 'Not allowed' });
    }

    if (Number(group.group_size) === 3 && !group.third_student_id) {
      app.log.warn({ route: 'student/group/subject', groupId }, 'third not set');
      return reply.code(409).send({ error: 'Third student not set yet' });
    }

    if (group.subject_id) {
      app.log.warn({ route: 'student/group/subject', groupId }, 'subject already set');
      return reply.code(409).send({ error: 'Subject already set' });
    }

    const subject = await dbQuery(
      'group-subject-check',
      'SELECT id FROM grp_subjects WHERE id = $1',
      [subjectId]
    );
    if (!subject.rows[0]) {
      app.log.warn({ route: 'student/group/subject', subjectId }, 'subject not found');
      return reply.code(404).send({ error: 'Subject not found' });
    }

    await dbQuery(
      'group-subject-update',
      'UPDATE grp_groups SET subject_id = $1 WHERE id = $2',
      [subjectId, groupId]
    );
    app.log.info({ route: 'student/group/subject', groupId }, 'route done');
    return { ok: true };
  });

  app.get('/subjects', async () => {
    app.log.info({ route: 'student/subjects' }, 'route start');
    const result = await dbQuery(
      'subjects-available',
      `SELECT id, title, description, css
       FROM grp_subjects
       WHERE id NOT IN (
         SELECT subject_id FROM grp_groups
         WHERE status = 'confirmed' AND subject_id IS NOT NULL
       )
       ORDER BY id`
    );
    app.log.info({ route: 'student/subjects', count: result.rows.length }, 'route done');
    return { subjects: result.rows };
  });

  app.post('/group/respond', async (req, reply) => {
    app.log.info({ route: 'student/group/respond' }, 'route start');
    const { fingerprint, groupId, decision } = req.body || {};
    if (!fingerprint || !groupId || !decision) {
      app.log.warn({ route: 'student/group/respond' }, 'missing fields');
      return reply.code(400).send({ error: 'fingerprint, groupId, decision are required' });
    }

    const session = await getSessionStudent(dbQuery, req, fingerprint);
    if (!session) {
      app.log.warn({ route: 'student/group/respond' }, 'session not found');
      return reply.code(401).send({ error: 'Session not found' });
    }

    const studentId = Number(session.student_id);
    const groupResult = await dbQuery(
      'group-respond-fetch',
      'SELECT * FROM grp_groups WHERE id = $1',
      [groupId]
    );
    const group = groupResult.rows[0];
    if (!group) {
      app.log.warn({ route: 'student/group/respond', groupId }, 'group not found');
      return reply.code(404).send({ error: 'Group not found' });
    }

    if (group.status !== 'pending') {
      app.log.warn({ route: 'student/group/respond', groupId }, 'group closed');
      return reply.code(409).send({ error: 'Group already closed' });
    }

    const secondId = Number(group.second_student_id);
    const thirdId = group.third_student_id ? Number(group.third_student_id) : null;
    const isSecond = studentId === secondId;
    const isThird = studentId === thirdId;

    if (!isSecond && !isThird) {
      app.log.warn({ route: 'student/group/respond', studentId }, 'not allowed');
      return reply.code(403).send({ error: 'Not allowed' });
    }

    if (decision === 'refuse') {
      const memberIds = [
        Number(group.leader_student_id),
        secondId,
        thirdId,
      ].filter(Boolean);

      try {
        await dbQuery('group-respond-begin', 'BEGIN');
        await dbQuery('group-respond-delete', 'DELETE FROM grp_groups WHERE id = $1', [groupId]);
        await dbQuery(
          'group-respond-delete-sessions',
          'DELETE FROM grp_sessions WHERE student_id = ANY($1::int[])',
          [memberIds]
        );
        await dbQuery('group-respond-commit', 'COMMIT');
      } catch (err) {
        await dbQuery('group-respond-rollback', 'ROLLBACK');
        throw err;
      }

      app.log.info({ route: 'student/group/respond', groupId }, 'refused');
      return { ok: true, status: 'refused' };
    }

    if (decision !== 'accept') {
      app.log.warn({ route: 'student/group/respond', decision }, 'invalid decision');
      return reply.code(400).send({ error: 'decision must be accept or refuse' });
    }

    if (isSecond && !group.accepted_second) {
      await dbQuery(
        'group-respond-accept-second',
        'UPDATE grp_groups SET accepted_second = true WHERE id = $1',
        [groupId]
      );
    }
    if (isThird && !group.accepted_third) {
      await dbQuery(
        'group-respond-accept-third',
        'UPDATE grp_groups SET accepted_third = true WHERE id = $1',
        [groupId]
      );
    }

    const updated = await dbQuery(
      'group-respond-updated',
      'SELECT group_size, accepted_second, accepted_third FROM grp_groups WHERE id = $1',
      [groupId]
    );
    const updatedRow = updated.rows[0];
    const shouldConfirm =
      Number(updatedRow.group_size) === 2
        ? updatedRow.accepted_second
        : updatedRow.accepted_second && updatedRow.accepted_third;

    if (shouldConfirm) {
      await dbQuery(
        'group-respond-confirm',
        'UPDATE grp_groups SET status = \'confirmed\' WHERE id = $1',
        [groupId]
      );
      app.log.info({ route: 'student/group/respond', groupId }, 'confirmed');
      return { ok: true, status: 'confirmed' };
    }

    app.log.info({ route: 'student/group/respond', groupId }, 'pending');
    return { ok: true, status: 'pending' };
  });
};
