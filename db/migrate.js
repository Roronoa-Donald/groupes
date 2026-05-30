'use strict';

async function runMigrations(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS grp_students (
      id SERIAL PRIMARY KEY,
      full_name TEXT NOT NULL UNIQUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS grp_subjects (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      css TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS grp_groups (
      id SERIAL PRIMARY KEY,
      leader_student_id INTEGER NOT NULL REFERENCES grp_students(id) ON DELETE CASCADE,
      second_student_id INTEGER NOT NULL REFERENCES grp_students(id) ON DELETE CASCADE,
      third_student_id INTEGER REFERENCES grp_students(id) ON DELETE CASCADE,
      subject_id INTEGER REFERENCES grp_subjects(id) ON DELETE SET NULL,
      group_size INTEGER NOT NULL CHECK (group_size IN (2, 3)),
      status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed')),
      accepted_second BOOLEAN NOT NULL DEFAULT FALSE,
      accepted_third BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS grp_sessions (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL UNIQUE REFERENCES grp_students(id) ON DELETE CASCADE,
      fingerprint TEXT NOT NULL,
      ip TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (fingerprint, ip)
    );
  `);
}

module.exports = { runMigrations };
