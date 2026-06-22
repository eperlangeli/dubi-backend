'use strict';

const cron = require('node-cron');
const crypto = require('crypto');

const createResearchPseudonym = (userId, salt) => (
  crypto.createHmac('sha256', salt).update(String(userId)).digest('hex')
);

async function cleanupRevokedResearchData(pool) {
  const salt = String(process.env.RESEARCH_SALT || '').trim();
  if (!salt) {
    console.error('[cron:research-cleanup] Cleanup skipped: RESEARCH_SALT is not configured.');
    return { users: 0, snapshots: 0, longitudinal: 0, skipped: true };
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const { rows } = await client.query(
      'SELECT user_id AS id FROM research_cleanup_candidates()'
    );

    if (rows.length === 0) {
      await client.query('COMMIT');
      return { users: 0, snapshots: 0, longitudinal: 0, skipped: false };
    }

    const pseudonyms = rows.map((row) => createResearchPseudonym(row.id, salt));
    const snapshots = await client.query(
      'DELETE FROM research_data_snapshots WHERE pseudonym = ANY($1::text[])',
      [pseudonyms]
    );
    const longitudinal = await client.query(
      'DELETE FROM research_longitudinal WHERE pseudonym = ANY($1::text[])',
      [pseudonyms]
    );

    await client.query('COMMIT');
    const result = {
      users: rows.length,
      snapshots: snapshots.rowCount || 0,
      longitudinal: longitudinal.rowCount || 0,
      skipped: false
    };
    console.log(
      `[cron:research-cleanup] Cleaned ${result.users} users, ` +
      `${result.snapshots} snapshots and ${result.longitudinal} longitudinal rows.`
    );
    return result;
  } catch (error) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch (rollbackError) {
        console.error('[cron:research-cleanup] Rollback failed:', rollbackError.message);
      }
    }
    console.error('[cron:research-cleanup] Cleanup failed:', error.message);
    return { users: 0, snapshots: 0, longitudinal: 0, skipped: false, error: true };
  } finally {
    if (client) client.release();
  }
}

module.exports = function registerResearchCleanupCron(pool) {
  let running = false;
  const task = cron.schedule('30 1 * * *', async () => {
    if (running) {
      console.warn('[cron:research-cleanup] Previous cleanup is still running; skipping overlap.');
      return;
    }

    running = true;
    try {
      await cleanupRevokedResearchData(pool);
    } finally {
      running = false;
    }
  }, { timezone: 'UTC' });

  console.log('[cron:research-cleanup] Scheduled daily at 01:30 UTC');
  return task;
};

module.exports.cleanupRevokedResearchData = cleanupRevokedResearchData;
