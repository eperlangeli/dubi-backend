const express = require('express');
const { WORKOUT_NUTRITION } = require('../config/workout-nutrition');

const WEEKDAY_ALIASES = new Map([
  ['monday', 1], ['mon', 1], ['lunedi', 1], ['lun', 1],
  ['tuesday', 2], ['tue', 2], ['martedi', 2], ['mar', 2],
  ['wednesday', 3], ['wed', 3], ['mercoledi', 3], ['mer', 3],
  ['thursday', 4], ['thu', 4], ['giovedi', 4], ['gio', 4],
  ['friday', 5], ['fri', 5], ['venerdi', 5], ['ven', 5],
  ['saturday', 6], ['sat', 6], ['sabato', 6], ['sab', 6],
  ['sunday', 7], ['sun', 7], ['domenica', 7], ['dom', 7]
]);

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TRAINING_STATUSES = new Set([
  'confirmed_yes',
  'confirmed_no',
  'detected_wearable',
  'unconfirmed'
]);

const toIsoDate = (date) => date.toISOString().slice(0, 10);

const parseIsoDate = (value) => {
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || toIsoDate(date) !== value ? null : date;
};

const normalizeTextKey = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase();

const addUtcDays = (date, days) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const getWeekStart = (value = new Date()) => {
  const date = value instanceof Date ? new Date(value) : parseIsoDate(value);
  if (!date || Number.isNaN(date.getTime())) return null;
  const normalized = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  ));
  const day = normalized.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  normalized.setUTCDate(normalized.getUTCDate() - daysSinceMonday);
  return toIsoDate(normalized);
};

const dateForWeekday = (weekStart, weekday) => {
  const start = parseIsoDate(weekStart);
  if (!start) return null;
  return toIsoDate(addUtcDays(start, weekday - 1));
};

const isDateInWeek = (dateValue, weekStart) => {
  const date = parseIsoDate(dateValue);
  const start = parseIsoDate(weekStart);
  if (!date || !start) return false;
  const end = addUtcDays(start, 7);
  return date >= start && date < end;
};

const normalizePlannedDay = (entry, weekStart) => {
  const raw = typeof entry === 'object' && entry !== null
    ? entry.date ?? entry.day ?? entry.weekday
    : entry;

  if (typeof raw === 'number' && Number.isInteger(raw)) {
    if (raw === 0) return dateForWeekday(weekStart, 7);
    if (raw >= 1 && raw <= 7) return dateForWeekday(weekStart, raw);
    return null;
  }

  const value = String(raw || '').trim();
  if (!value) return null;

  if (ISO_DATE_RE.test(value)) {
    return isDateInWeek(value, weekStart) ? value : null;
  }

  const weekday = WEEKDAY_ALIASES.get(normalizeTextKey(value));
  return weekday ? dateForWeekday(weekStart, weekday) : null;
};

const normalizePlannedDays = (plannedDays, weekStart) => {
  if (plannedDays === 'unknown') return { value: 'unknown' };
  if (!Array.isArray(plannedDays)) {
    return { error: 'planned_days_must_be_array_or_unknown' };
  }
  if (plannedDays.length > 7) return { error: 'too_many_planned_days' };

  const normalized = [];
  const seen = new Set();
  for (const entry of plannedDays) {
    const day = normalizePlannedDay(entry, weekStart);
    if (!day) return { error: 'invalid_planned_day' };
    if (!seen.has(day)) {
      seen.add(day);
      normalized.push(day);
    }
  }

  return { value: normalized.sort() };
};

const plannedForDay = (plannedDays, day) => {
  if (!plannedDays || plannedDays === 'unknown') return null;
  const list = Array.isArray(plannedDays) ? plannedDays : [];
  return list.some((entry) => normalizePlannedDay(entry, getWeekStart(day)) === day);
};

const statusForAnswer = (answer) => {
  const normalized = String(answer || '').trim().toLowerCase();
  if (normalized === 'yes') return 'confirmed_yes';
  if (normalized === 'no') return 'confirmed_no';
  if (normalized === 'unknown') return 'unconfirmed';
  return null;
};

const safeTimeSlot = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const slot = normalizeTextKey(value).replace(/[\s-]+/g, '_');
  const normalized = WORKOUT_NUTRITION.timeSlotAliases[slot]
    || (WORKOUT_NUTRITION.allowedTimeSlots.includes(slot) ? slot : null);
  if (!normalized) return null;
  return normalized;
};

const safeTrainingSport = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const sport = String(value).trim();
  if (!sport || sport.length > 80) return null;
  if (!/^[\p{L}\p{N}\s._-]+$/u.test(sport)) return null;
  return sport;
};

const isMissingColumnError = (error) => error?.code === '42703'
  || /column .*training_sport.* does not exist/i.test(error?.message || '');

const insertTrainingConfirmation = async (pool, {
  userId,
  day,
  planned,
  status,
  timeSlot,
  trainingSport,
  answeredAtSql
}) => {
  if (trainingSport) {
    try {
      return await pool.query(
        `INSERT INTO training_confirmations (
           user_id, day, planned, status, training_time_slot, training_sport, answered_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, ${answeredAtSql})
         ON CONFLICT (user_id, day) DO UPDATE SET
           planned = EXCLUDED.planned,
           status = EXCLUDED.status,
           training_time_slot = EXCLUDED.training_time_slot,
           training_sport = EXCLUDED.training_sport,
           answered_at = EXCLUDED.answered_at
         RETURNING *`,
        [userId, day, planned, status, timeSlot, trainingSport]
      );
    } catch (error) {
      if (!isMissingColumnError(error)) throw error;
      console.warn('[training] training_sport column unavailable; saving confirmation without sport');
    }
  }

  return pool.query(
    `INSERT INTO training_confirmations (
       user_id, day, planned, status, training_time_slot, answered_at
     )
     VALUES ($1, $2, $3, $4, $5, ${answeredAtSql})
     ON CONFLICT (user_id, day) DO UPDATE SET
       planned = EXCLUDED.planned,
       status = EXCLUDED.status,
       training_time_slot = EXCLUDED.training_time_slot,
       answered_at = EXCLUDED.answered_at
     RETURNING *`,
    [userId, day, planned, status, timeSlot]
  );
};

const selectTrainingConfirmationSql = `
  SELECT training_confirmations.*,
         row_to_json(training_confirmations)->>'training_sport' AS training_sport
    FROM training_confirmations
   WHERE user_id = $1 AND day = $2
   LIMIT 1
`;

const toPlanPayload = (row) => row ? {
  id: row.id,
  user_id: row.user_id,
  week_start: row.week_start,
  planned_days: row.planned_days,
  source: row.source,
  created_at: row.created_at
} : null;

const toConfirmationPayload = (row) => row ? {
  id: row.id,
  user_id: row.user_id,
  day: row.day,
  planned: row.planned,
  status: row.status,
  training_time_slot: row.training_time_slot,
  training_sport: row.training_sport || null,
  answered_at: row.answered_at,
  detected_strain: row.detected_strain,
  detected_duration_min: row.detected_duration_min,
  detected_active_kcal: row.detected_active_kcal
} : null;

module.exports = (pool) => {
  const router = express.Router();
  const authModule = require('./auth')(pool);
  const { verifyToken } = authModule;

  const getWeekPlan = async (userId, weekStart) => {
    const { rows } = await pool.query(
      `SELECT *
       FROM training_week_plans
       WHERE user_id = $1 AND week_start = $2
       LIMIT 1`,
      [userId, weekStart]
    );
    return rows[0] || null;
  };

  router.get('/week', verifyToken, async (req, res) => {
    const weekStart = getWeekStart();

    try {
      const plan = await getWeekPlan(req.userId, weekStart);
      return res.json({
        week_start: weekStart,
        ask_weekly: !plan,
        plan: toPlanPayload(plan)
      });
    } catch (error) {
      console.error('Training week fetch failed:', error.message);
      return res.status(500).json({ error: 'training_week_fetch_failed' });
    }
  });

  router.post('/week', verifyToken, async (req, res) => {
    const weekStart = getWeekStart();
    const normalized = normalizePlannedDays(req.body?.planned_days, weekStart);
    if (normalized.error) {
      return res.status(400).json({ error: normalized.error });
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO training_week_plans (user_id, week_start, planned_days, source)
         VALUES ($1, $2, $3::jsonb, 'user')
         ON CONFLICT (user_id, week_start) DO UPDATE SET
           planned_days = EXCLUDED.planned_days,
           source = EXCLUDED.source
         RETURNING *`,
        [req.userId, weekStart, JSON.stringify(normalized.value)]
      );

      return res.json({
        week_start: weekStart,
        ask_weekly: false,
        plan: toPlanPayload(rows[0])
      });
    } catch (error) {
      console.error('Training week save failed:', error.message);
      return res.status(500).json({ error: 'training_week_save_failed' });
    }
  });

  router.post('/day/confirm', verifyToken, async (req, res) => {
    const day = String(req.body?.day || '').trim();
    if (!parseIsoDate(day)) return res.status(400).json({ error: 'invalid_day' });

    const status = statusForAnswer(req.body?.answer);
    if (!status || !TRAINING_STATUSES.has(status)) {
      return res.status(400).json({ error: 'invalid_answer' });
    }

    const weekStart = getWeekStart(day);
    const rawTimeSlot = req.body?.time_slot;
    const timeSlot = safeTimeSlot(rawTimeSlot);
    if (rawTimeSlot !== undefined && rawTimeSlot !== null && rawTimeSlot !== '' && timeSlot === null) {
      return res.status(400).json({ error: 'invalid_time_slot' });
    }
    const rawSport = req.body?.sport;
    const trainingSport = safeTrainingSport(rawSport);
    if (rawSport !== undefined && rawSport !== null && rawSport !== '' && trainingSport === null) {
      return res.status(400).json({ error: 'invalid_sport' });
    }

    try {
      const plan = await getWeekPlan(req.userId, weekStart);
      const planned = plannedForDay(plan?.planned_days, day);
      const answeredAtSql = status === 'unconfirmed' ? 'NULL' : 'NOW()';

      const { rows } = await insertTrainingConfirmation(pool, {
        userId: req.userId,
        day,
        planned,
        status,
        timeSlot,
        trainingSport,
        answeredAtSql
      });

      pool.query(
        'DELETE FROM daily_plans WHERE user_id = $1 AND plan_date = $2',
        [req.userId, day]
      ).catch((error) => {
        console.warn('Training day plan invalidation failed:', error.message);
      });

      return res.json({
        day,
        week_start: weekStart,
        confirmation: toConfirmationPayload(rows[0])
      });
    } catch (error) {
      console.error('Training day confirmation failed:', error.message);
      return res.status(500).json({ error: 'training_day_confirm_failed' });
    }
  });

  router.get('/day/today', verifyToken, async (req, res) => {
    const today = toIsoDate(new Date());
    const weekStart = getWeekStart(today);

    try {
      const plan = await getWeekPlan(req.userId, weekStart);
      const planned = plannedForDay(plan?.planned_days, today);
      const confirmationResult = await pool.query(
        selectTrainingConfirmationSql,
        [req.userId, today]
      );
      const confirmation = confirmationResult.rows[0] || null;

      return res.json({
        day: today,
        week_start: weekStart,
        ask_weekly: !plan,
        planned,
        status: confirmation?.status || 'unconfirmed',
        training_time_slot: confirmation?.training_time_slot || null,
        training_sport: confirmation?.training_sport || null,
        confirmation: toConfirmationPayload(confirmation)
      });
    } catch (error) {
      console.error('Training today fetch failed:', error.message);
      return res.status(500).json({ error: 'training_today_fetch_failed' });
    }
  });

  return router;
};

module.exports._test = {
  getWeekStart,
  normalizePlannedDays,
  plannedForDay,
  statusForAnswer,
  safeTimeSlot
};
