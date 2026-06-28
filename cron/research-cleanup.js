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

async function cleanupRevokedHealthData(pool) {
  const batchSize = 500;
  let client;

  try {
    client = await pool.connect();
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT id
       FROM users
       WHERE health_revoked_at IS NOT NULL
         AND health_revoked_at <= NOW() - INTERVAL '30 days'
       ORDER BY id`
    );

    if (rows.length === 0) {
      await client.query('COMMIT');
      return {
        users: 0,
        weightRows: 0,
        plans: 0,
        wearableRows: 0,
        skipped: false
      };
    }

    const totals = { weightRows: 0, plans: 0, wearableRows: 0 };

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize).map((r) => r.id);
      const [wearableData, openwearables, dailyPlans, mealPlans, weightHistory] = await Promise.all([
        client.query('DELETE FROM wearable_data WHERE user_id = ANY($1::int[])', [batch]),
        client.query('DELETE FROM openwearables_connections WHERE user_id = ANY($1::int[])', [batch]),
        client.query('DELETE FROM daily_plans WHERE user_id = ANY($1::int[])', [batch]),
        client.query('DELETE FROM meal_plans WHERE user_id = ANY($1::int[])', [batch]),
        client.query('DELETE FROM weight_history WHERE user_id = ANY($1::int[])', [batch])
      ]);
      totals.wearableRows += (wearableData.rowCount || 0) + (openwearables.rowCount || 0);
      totals.plans += (dailyPlans.rowCount || 0) + (mealPlans.rowCount || 0);
      totals.weightRows += weightHistory.rowCount || 0;
    }

    const userIds = rows.map((r) => r.id);
    await client.query(
      'UPDATE users SET health_revoked_at = NULL WHERE id = ANY($1::int[])',
      [userIds]
    );

    await client.query('COMMIT');
    console.log(
      `[cron:health-cleanup] Cleaned ${rows.length} users, ` +
      `${totals.weightRows} weight rows, ${totals.plans} plans, ${totals.wearableRows} wearable rows.`
    );
    return { users: rows.length, ...totals, skipped: false };
  } catch (error) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch (rollbackError) {
        console.error('[cron:health-cleanup] Rollback failed:', rollbackError.message);
      }
    }
    console.error('[cron:health-cleanup] Cleanup failed:', error.message);
    return { users: 0, weightRows: 0, plans: 0, wearableRows: 0, skipped: false, error: true };
  } finally {
    if (client) client.release();
  }
}

module.exports = function registerResearchCleanupCron(pool) {
  let researchRunning = false;
  let healthRunning = false;

  cron.schedule('30 1 * * *', async () => {
    if (researchRunning) {
      console.warn('[cron:research-cleanup] Previous cleanup is still running; skipping overlap.');
      return;
    }
    researchRunning = true;
    try {
      await cleanupRevokedResearchData(pool);
    } finally {
      researchRunning = false;
    }
  }, { timezone: 'UTC' });

  cron.schedule('0 2 * * *', async () => {
    if (healthRunning) {
      console.warn('[cron:health-cleanup] Previous cleanup is still running; skipping overlap.');
      return;
    }
    healthRunning = true;
    try {
      await cleanupRevokedHealthData(pool);
    } finally {
      healthRunning = false;
    }
  }, { timezone: 'UTC' });

  console.log('[cron:research-cleanup] Scheduled daily at 01:30 UTC');
  console.log('[cron:health-cleanup] Scheduled daily at 02:00 UTC');
};

module.exports.cleanupRevokedResearchData = cleanupRevokedResearchData;
module.exports.cleanupRevokedHealthData = cleanupRevokedHealthData;
