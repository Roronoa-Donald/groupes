'use strict';

const { pool } = require('../db/pool');

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
        },
        'db query'
      );
      return result;
    } catch (err) {
      log.error(
        {
          label,
          durationMs: Date.now() - start,
          err: err.message,
        },
        'db query failed'
      );
      throw err;
    }
  };
}

function isAdmin(req) {
  const header = req.headers['x-admin-password'];
  const body = req.body && req.body.password;
  const pass = header || body || '';
  return pass && pass === process.env.ADMIN_PASSWORD;
}

function getTriadLimit() {
  const raw = process.env.MAX_GROUPS_OF_3;
  const max = Number.parseInt(raw, 10);
  return Number.isFinite(max) && max > 0 ? max : 0;
}

async function getTriadStatus(dbQuery) {
  const max = getTriadLimit();
  const result = await dbQuery(
    'admin-triad-status',
    "SELECT COUNT(*) FROM grp_groups WHERE group_size = 3 AND status IN ('pending', 'confirmed')"
  );
  const used = Number(result.rows[0].count || 0);
  return {
    max,
    used,
    available: max > 0 && used < max,
  };
}

async function isStudentUnavailableForGroup(dbQuery, studentId) {
  const result = await dbQuery(
    'admin-student-unavailable',
    `SELECT 1 FROM (
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

module.exports = async function adminRoutes(app) {
  const db = app.db || pool;
  const dbQuery = makeDbQuery(app.log, db);

  app.post('/login', async (req, reply) => {
    app.log.info({ route: 'admin/login' }, 'route start');
    if (!isAdmin(req)) {
      app.log.warn({ route: 'admin/login' }, 'invalid password');
      return reply.code(401).send({ ok: false });
    }
    app.log.info({ route: 'admin/login' }, 'route done');
    return { ok: true };
  });

  app.get('/overview', async (req, reply) => {
    app.log.info({ route: 'admin/overview' }, 'route start');
    if (!isAdmin(req)) {
      app.log.warn({ route: 'admin/overview' }, 'unauthorized');
      return reply.code(401).send({ ok: false });
    }

    const groups = await dbQuery(
      'admin-overview-groups',
      `SELECT g.id, g.group_size, g.status, g.created_at, g.subject_id,
         s1.full_name AS leader_name,
         s2.full_name AS second_name,
         s3.full_name AS third_name,
         subj.title AS subject_title
       FROM grp_groups g
       JOIN grp_students s1 ON s1.id = g.leader_student_id
       JOIN grp_students s2 ON s2.id = g.second_student_id
       LEFT JOIN grp_students s3 ON s3.id = g.third_student_id
       LEFT JOIN grp_subjects subj ON subj.id = g.subject_id
       ORDER BY g.created_at DESC`
    );

    const ungrouped = await dbQuery(
      'admin-overview-ungrouped',
      `SELECT s.id, s.full_name
       FROM grp_students s
       WHERE s.id NOT IN (
         SELECT leader_student_id FROM grp_groups
         UNION
         SELECT second_student_id FROM grp_groups
         UNION
         SELECT third_student_id FROM grp_groups WHERE third_student_id IS NOT NULL
       )
       ORDER BY s.full_name`
    );

    const subjects = await dbQuery(
      'admin-overview-subjects',
      'SELECT id, title FROM grp_subjects ORDER BY id'
    );

    const sessions = await dbQuery(
      'admin-overview-sessions',
      `SELECT s.id, s.student_id, s.fingerprint, s.ip, s.created_at,
         st.full_name
       FROM grp_sessions s
       JOIN grp_students st ON st.id = s.student_id
       ORDER BY st.full_name`
    );

    app.log.info(
      { route: 'admin/overview', groups: groups.rows.length, ungrouped: ungrouped.rows.length },
      'route done'
    );
    return {
      groups: groups.rows,
      ungrouped: ungrouped.rows,
      subjects: subjects.rows,
      sessions: sessions.rows,
    };
  });

  app.post('/update-subject', async (req, reply) => {
    app.log.info({ route: 'admin/update-subject' }, 'route start');
    if (!isAdmin(req)) {
      return reply.code(401).send({ ok: false });
    }
    const { groupId, subjectId } = req.body || {};
    if (!groupId) {
      return reply.code(400).send({ error: 'groupId required' });
    }
    await dbQuery(
      'admin-update-subject',
      'UPDATE grp_groups SET subject_id = $1 WHERE id = $2',
      [subjectId || null, groupId]
    );
    app.log.info({ route: 'admin/update-subject', groupId, subjectId }, 'route done');
    return { ok: true };
  });

  app.post('/groups', async (req, reply) => {
    app.log.info({ route: 'admin/groups' }, 'route start');
    if (!isAdmin(req)) {
      return reply.code(401).send({ ok: false });
    }

    const { leaderId, secondId, thirdId, groupSize, subjectId } = req.body || {};
    if (!leaderId || !secondId || !groupSize) {
      return reply.code(400).send({ error: 'leaderId, secondId, groupSize are required' });
    }

    const leader = Number(leaderId);
    const second = Number(secondId);
    const size = Number(groupSize);
    const third = thirdId ? Number(thirdId) : null;
    const subject = subjectId ? Number(subjectId) : null;

    if (![2, 3].includes(size)) {
      return reply.code(400).send({ error: 'groupSize must be 2 or 3' });
    }
    if (!leader || !second) {
      return reply.code(400).send({ error: 'leaderId and secondId must be valid' });
    }
    if (leader === second) {
      return reply.code(409).send({ error: 'Members must be different' });
    }
    if (size === 3 && !third) {
      return reply.code(400).send({ error: 'thirdId required for groupSize 3' });
    }
    if (third && (third === leader || third === second)) {
      return reply.code(409).send({ error: 'Members must be different' });
    }

    if (size === 3) {
      const triadStatus = await getTriadStatus(dbQuery);
      if (!triadStatus.available) {
        return reply.code(409).send({ error: 'Triad limit reached' });
      }
    }

    const memberIds = [leader, second, third].filter(Boolean);
    for (const memberId of memberIds) {
      const unavailable = await isStudentUnavailableForGroup(dbQuery, memberId);
      if (unavailable) {
        return reply.code(409).send({ error: 'Student not available' });
      }
    }

    if (subject) {
      const exists = await dbQuery(
        'admin-subject-check',
        'SELECT id FROM grp_subjects WHERE id = $1',
        [subject]
      );
      if (!exists.rows[0]) {
        return reply.code(404).send({ error: 'Subject not found' });
      }
    }

    const insert = await dbQuery(
      'admin-group-create',
      `INSERT INTO grp_groups
       (leader_student_id, second_student_id, third_student_id, subject_id, group_size, status, accepted_second, accepted_third)
       VALUES ($1, $2, $3, $4, $5, 'confirmed', $6, $7)
       RETURNING id`,
      [leader, second, third, subject, size, true, size === 3]
    );

    app.log.info({ route: 'admin/groups', groupId: insert.rows[0].id }, 'route done');
    return { ok: true, groupId: Number(insert.rows[0].id) };
  });

  app.post('/sessions/reset', async (req, reply) => {
    app.log.info({ route: 'admin/sessions/reset' }, 'route start');
    if (!isAdmin(req)) {
      return reply.code(401).send({ ok: false });
    }

    const { sessionId } = req.body || {};
    if (!sessionId) {
      return reply.code(400).send({ error: 'sessionId required' });
    }

    const result = await dbQuery(
      'admin-session-reset',
      'DELETE FROM grp_sessions WHERE id = $1',
      [Number(sessionId)]
    );

    if (!result.rowCount) {
      return reply.code(404).send({ error: 'Session not found' });
    }

    app.log.info({ route: 'admin/sessions/reset', sessionId }, 'route done');
    return { ok: true };
  });
};
