const express = require('express');
const crypto = require('crypto');

module.exports = (pool) => {
  const router = express.Router();
  const authModule = require('./auth')(pool);
  const { verifyToken } = authModule;

  const getConfig = () => ({
    baseUrl: (process.env.OPENWEARABLES_BASE_URL || '').replace(/\/$/, ''),
    apiKey: process.env.OPENWEARABLES_API_KEY
  });

  const requireOpenWearablesConfig = () => {
    const config = getConfig();
    if (!config.baseUrl || !config.apiKey) {
      const error = new Error('OPENWEARABLES_API_KEY is not configured');
      error.statusCode = 503;
      throw error;
    }
    return config;
  };

  const openWearablesRequest = async (path, options = {}) => {
    const config = requireOpenWearablesConfig();
    const response = await fetch(`${config.baseUrl}/api/v1${path}`, {
      ...options,
      headers: {
        'X-Open-Wearables-API-Key': config.apiKey,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    const text = await response.text();
    const body = text ? JSON.parse(text) : {};

    if (!response.ok) {
      const error = new Error(body.detail || body.error || `OpenWearables request failed (${response.status})`);
      error.statusCode = response.status;
      error.payload = body;
      throw error;
    }

    return body;
  };

  const getOrCreateOpenWearablesUser = async (userId) => {
    const existing = await pool.query(
      'SELECT * FROM openwearables_connections WHERE user_id = $1 LIMIT 1',
      [userId]
    );
    if (existing.rows.length > 0) return existing.rows[0];

    const userResult = await pool.query('SELECT id, email FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    const user = userResult.rows[0];
    const created = await openWearablesRequest('/users', {
      method: 'POST',
      body: JSON.stringify({
        email: user.email,
        external_user_id: `dubi-${user.id}`
      })
    });

    const saved = await pool.query(
      `
      INSERT INTO openwearables_connections (user_id, openwearables_user_id, status)
      VALUES ($1, $2, 'created')
      RETURNING *
      `,
      [userId, created.id]
    );

    return saved.rows[0];
  };

  const toDateString = (value) => {
    if (!value) return null;
    return String(value).slice(0, 10);
  };

  const daysBetween = (startDate, endDate) => {
    if (!startDate || !endDate) return 90;
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 90;
    const diff = Math.ceil((end - start) / 86400000);
    return Math.min(Math.max(diff || 1, 1), 365);
  };

  const mapRecoverySummary = (entry) => ({
    dataDate: toDateString(entry.date),
    hrv: entry.avg_hrv_sdnn_ms ?? entry.hrv ?? null,
    heartRate: entry.resting_heart_rate_bpm ?? entry.resting_heart_rate ?? null,
    sleepDuration: entry.sleep_duration_seconds != null
      ? Math.round((Number(entry.sleep_duration_seconds) / 3600) * 100) / 100
      : null,
    sleepQuality: entry.sleep_efficiency_percent != null
      ? String(Math.round(Number(entry.sleep_efficiency_percent)))
      : null,
    recoveryScore: entry.recovery_score ?? null
  });

  const upsertWearableDay = async (userId, day) => {
    if (!day.dataDate) return null;

    const result = await pool.query(
      `
      INSERT INTO wearable_data (
        user_id,
        activity_kcal,
        steps,
        heart_rate,
        hrv,
        sleep_hours,
        sleep_duration,
        sleep_quality,
        recovery_score,
        data_date,
        synced_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CURRENT_TIMESTAMP)
      ON CONFLICT (user_id, data_date)
      DO UPDATE SET
        activity_kcal = COALESCE(EXCLUDED.activity_kcal, wearable_data.activity_kcal),
        steps = COALESCE(EXCLUDED.steps, wearable_data.steps),
        heart_rate = COALESCE(EXCLUDED.heart_rate, wearable_data.heart_rate),
        hrv = COALESCE(EXCLUDED.hrv, wearable_data.hrv),
        sleep_hours = COALESCE(EXCLUDED.sleep_hours, wearable_data.sleep_hours),
        sleep_duration = COALESCE(EXCLUDED.sleep_duration, wearable_data.sleep_duration),
        sleep_quality = COALESCE(EXCLUDED.sleep_quality, wearable_data.sleep_quality),
        recovery_score = COALESCE(EXCLUDED.recovery_score, wearable_data.recovery_score),
        synced_at = CURRENT_TIMESTAMP
      RETURNING *
      `,
      [
        userId,
        day.activityKcal,
        day.steps,
        day.heartRate,
        day.hrv,
        day.sleepDuration,
        day.sleepDuration,
        day.sleepQuality,
        day.recoveryScore,
        day.dataDate
      ]
    );

    return result.rows[0];
  };

  const buildDemoWearableDays = (scenario = 'balanced') => {
    const today = new Date();
    return Array.from({ length: 14 }, (_, index) => {
      const date = new Date(today.getTime() - index * 86400000);
      const isRecent = index < 3;
      const lowRecovery = scenario === 'low_recovery' && isRecent;
      const hrv = lowRecovery ? 36 - index : 52 + ((index % 5) - 2);
      const sleepDuration = lowRecovery ? 5.3 + index * 0.15 : 7.1 + ((index % 4) * 0.18);
      const recoveryScore = lowRecovery ? 42 - index * 2 : 74 + ((index % 6) - 3);

      return {
        dataDate: date.toISOString().slice(0, 10),
        steps: 7600 + ((index % 6) * 420),
        activityKcal: 390 + ((index % 5) * 32),
        heartRate: lowRecovery ? 67 + index : 58 + (index % 4),
        hrv,
        sleepDuration: Math.round(sleepDuration * 100) / 100,
        sleepQuality: String(Math.max(Math.min(Math.round(sleepDuration * 11), 94), 55)),
        recoveryScore: Math.max(Math.min(recoveryScore, 92), 30)
      };
    }).reverse();
  };

  router.get('/providers', verifyToken, async (req, res) => {
    try {
      const providers = await openWearablesRequest('/oauth/providers?enabled_only=true&cloud_only=true');
      res.json({ providers });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message, detail: error.payload });
    }
  });

  router.post('/openwearables/user', verifyToken, async (req, res) => {
    try {
      const connection = await getOrCreateOpenWearablesUser(req.userId);
      res.json({ success: true, connection });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message, detail: error.payload });
    }
  });

  router.post('/openwearables/authorize', verifyToken, async (req, res) => {
    try {
      const { provider, redirect_uri } = req.body || {};
      if (!provider) return res.status(400).json({ error: 'provider is required' });

      const connection = await getOrCreateOpenWearablesUser(req.userId);
      const redirectUri = redirect_uri || process.env.OPENWEARABLES_REDIRECT_URI || process.env.FRONTEND_URL;
      const query = new URLSearchParams({
        user_id: connection.openwearables_user_id,
        ...(redirectUri ? { redirect_uri: redirectUri } : {})
      });
      const auth = await openWearablesRequest(`/oauth/${provider}/authorize?${query.toString()}`);

      await pool.query(
        `
        UPDATE openwearables_connections
        SET provider = $1, status = 'authorizing', updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $2
        `,
        [provider, req.userId]
      );

      res.json({ success: true, provider, authorization_url: auth.authorization_url, state: auth.state });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message, detail: error.payload });
    }
  });

  router.post('/openwearables/sync', verifyToken, async (req, res) => {
    try {
      const { provider, data_type = 'all', start_date, end_date, historical = true } = req.body || {};
      if (!provider) return res.status(400).json({ error: 'provider is required' });

      const connection = await getOrCreateOpenWearablesUser(req.userId);
      let sync;

      if (historical) {
        const query = new URLSearchParams({ days: String(daysBetween(start_date, end_date)) });
        sync = await openWearablesRequest(
          `/providers/${provider}/users/${connection.openwearables_user_id}/sync/historical?${query.toString()}`,
          { method: 'POST' }
        );
      } else {
        const query = new URLSearchParams({ data_type });
        if (start_date) query.set('summary_start_time', new Date(start_date).toISOString());
        if (end_date) query.set('summary_end_time', new Date(end_date).toISOString());

        sync = await openWearablesRequest(
          `/providers/${provider}/users/${connection.openwearables_user_id}/sync?${query.toString()}`,
          { method: 'POST' }
        );
      }

      await pool.query(
        `
        UPDATE openwearables_connections
        SET provider = $1, status = 'sync_requested', last_synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $2
        `,
        [provider, req.userId]
      );

      res.json({ success: true, sync });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message, detail: error.payload });
    }
  });

  router.post('/openwearables/import-recovery', verifyToken, async (req, res) => {
    try {
      const { start_date, end_date } = req.body || {};
      const connection = await getOrCreateOpenWearablesUser(req.userId);
      const end = end_date || new Date().toISOString().slice(0, 10);
      const start = start_date || new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const query = new URLSearchParams({ start_date: start, end_date: end, limit: '100' });

      const summary = await openWearablesRequest(
        `/users/${connection.openwearables_user_id}/summaries/recovery?${query.toString()}`
      );
      const imported = [];

      for (const entry of summary.data || []) {
        const saved = await upsertWearableDay(req.userId, mapRecoverySummary(entry));
        if (saved) imported.push(saved);
      }

      await pool.query(
        `
        UPDATE openwearables_connections
        SET status = 'imported_recovery', last_synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1
        `,
        [req.userId]
      );

      res.json({ success: true, importedCount: imported.length, imported });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message, detail: error.payload });
    }
  });

  router.post('/demo/seed', verifyToken, async (req, res) => {
    try {
      const { scenario = 'balanced' } = req.body || {};
      const allowedScenarios = ['balanced', 'low_recovery'];
      const selectedScenario = allowedScenarios.includes(scenario) ? scenario : 'balanced';
      const days = buildDemoWearableDays(selectedScenario);
      const imported = [];

      for (const day of days) {
        const saved = await upsertWearableDay(req.userId, day);
        if (saved) imported.push(saved);
      }

      await pool.query(
        `
        INSERT INTO openwearables_connections (user_id, openwearables_user_id, provider, status, last_synced_at, updated_at)
        VALUES ($1, $2, 'demo', 'demo_seeded', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id)
        DO UPDATE SET
          provider = CASE
            WHEN openwearables_connections.provider IS NULL OR openwearables_connections.provider = 'demo'
            THEN 'demo'
            ELSE openwearables_connections.provider
          END,
          status = CASE
            WHEN openwearables_connections.provider IS NULL OR openwearables_connections.provider = 'demo'
            THEN 'demo_seeded'
            ELSE openwearables_connections.status
          END,
          last_synced_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
        `,
        [req.userId, crypto.randomUUID()]
      );

      res.json({
        success: true,
        scenario: selectedScenario,
        importedCount: imported.length,
        imported,
        note: selectedScenario === 'low_recovery'
          ? 'Demo data seeded with low recent recovery to test DUBI recovery overrides.'
          : 'Demo data seeded with balanced recovery to test normal planning.'
      });
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message, detail: error.payload });
    }
  });

  router.get('/openwearables/status', verifyToken, async (req, res) => {
    try {
      const connection = await pool.query(
        'SELECT * FROM openwearables_connections WHERE user_id = $1 LIMIT 1',
        [req.userId]
      );
      res.json({ connection: connection.rows[0] || null });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
