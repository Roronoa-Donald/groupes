'use strict';

require('dotenv').config();
const { pool } = require('./pool');

async function resetDb() {
  try {
    console.log('Début de la réinitialisation...');

    // On supprime toutes les sessions (déconnexion de tout le monde)
    const sessionsRes = await pool.query('DELETE FROM grp_sessions');
    console.log(`✅ Sessions supprimées : ${sessionsRes.rowCount}`);

    // On supprime tous les groupes (annule tous les binômes et triades)
    const groupsRes = await pool.query('DELETE FROM grp_groups');
    console.log(`✅ Groupes supprimés : ${groupsRes.rowCount}`);

    console.log('🎉 Réinitialisation terminée. Tout le monde peut recommencer à choisir un binôme.');
  } catch (err) {
    console.error('❌ Erreur lors de la réinitialisation :', err);
  } finally {
    await pool.end();
  }
}

resetDb();
