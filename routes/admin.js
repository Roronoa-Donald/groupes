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
      `SELECT g.id, g.group_size, g.status, g.created_at,
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

    app.log.info(
      { route: 'admin/overview', groups: groups.rows.length, ungrouped: ungrouped.rows.length },
      'route done'
    );
    return {
      groups: groups.rows,
      ungrouped: ungrouped.rows,
    };
  });
};
