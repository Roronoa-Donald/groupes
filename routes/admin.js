'use strict';

const { pool } = require('../db/pool');

function isAdmin(req) {
  const header = req.headers['x-admin-password'];
  const body = req.body && req.body.password;
  const pass = header || body || '';
  return pass && pass === process.env.ADMIN_PASSWORD;
}

module.exports = async function adminRoutes(app) {
  const db = app.db || pool;

  app.post('/login', async (req, reply) => {
    if (!isAdmin(req)) {
      return reply.code(401).send({ ok: false });
    }
    return { ok: true };
  });

  app.get('/overview', async (req, reply) => {
    if (!isAdmin(req)) {
      return reply.code(401).send({ ok: false });
    }

    const groups = await db.query(
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

    const ungrouped = await db.query(
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

    return {
      groups: groups.rows,
      ungrouped: ungrouped.rows,
    };
  });
};
