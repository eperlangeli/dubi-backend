'use strict';

const cron = require('node-cron');
const crypto = require('crypto');

const toIntegerEstimate = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : null;

  const normalized = String(value).trim().toLowerCase();
  if (!normalized || normalized === 'unknown') return null;
  if (normalized === '<3000') return 2999;
  if (normalized === '10000+') return 10000;

  const range = normalized.match(/^(\d+)\s*-\s*(\d+)$/);
  if (range) return Math.round((Number(range[1]) + Number(range[2])) / 2);

  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? Math.round(numeric) : null;
};

const createResearchPseudonym = (userId, salt) => (
  crypto.createHmac('sha256', salt).update(String(userId)).digest('hex')
);

async function syncResearchLongitudinal(pool) {
  const salt = String(process.env.RESEARCH_SALT || '').trim();
  if (!salt) {
    console.error('[cron:longitudinal] Sync skipped: RESEARCH_SALT is not configured.');
    return { synced: 0, failed: 0, skipped: true };
  }

  console.log('[cron:longitudinal] Starting daily sync...');

  try {
    const { rows: users } = await pool.query(`
      SELECT
        u.id,
        COALESCE(uo.age, u.age) AS age,
        COALESCE(uo.height, u.height) AS height,
        COALESCE(uo.weight, u.weight) AS weight,
        COALESCE(uo.goal, u.goal) AS goal,
        to_jsonb(u)->>'lang' AS lang,
        uo.target_weight,
        uo.target_body_fat,
        uo.competition_sport,
        uo.competition_date,
        uo.occupation,
        uo.workout_days,
        uo.workout_duration,
        uo.workout_intensity,
        uo.daily_steps,
        uo.sedentary_days,
        uo.diet,
        uo.diet_intensity,
        uo.allergies,
        uo.sport,
        uo.training_time,
        uo.breakfast_pref,
        uo.day_start,
        uo.day_end
      FROM users u
      JOIN user_onboarding uo ON uo.user_id = u.id
      WHERE uo.research_consent = true
        AND (
          COALESCE(uo.age, u.age) IS NOT NULL
          OR COALESCE(uo.height, u.height) IS NOT NULL
          OR COALESCE(uo.weight, u.weight) IS NOT NULL
          OR COALESCE(uo.goal, u.goal) IS NOT NULL
          OR uo.diet IS NOT NULL
        )
    `);

    let synced = 0;
    let failed = 0;

    for (const research of users) {
      try {
        const pseudonym = createResearchPseudonym(research.id, salt);
        await pool.query(
          `INSERT INTO research_longitudinal (
            pseudonym, snapshot_date, lang,
            age, height, weight, goal,
            target_weight, target_body_fat,
            competition_sport, competition_date,
            occupation, workout_days, workout_duration, workout_intensity,
            daily_steps, sedentary_days,
            diet, diet_intensity, allergies, sport,
            training_time, breakfast_pref, day_start, day_end
          ) VALUES (
            $1, CURRENT_DATE, $2,
            $3,$4,$5,$6,
            $7,$8,
            $9,$10,
            $11,$12,$13,$14,
            $15,$16,
            $17,$18,$19,$20,
            $21,$22,$23,$24
          )
          ON CONFLICT (pseudonym, snapshot_date) DO UPDATE SET
            lang              = EXCLUDED.lang,
            age               = EXCLUDED.age,
            height            = EXCLUDED.height,
            weight            = EXCLUDED.weight,
            goal              = EXCLUDED.goal,
            target_weight     = EXCLUDED.target_weight,
            target_body_fat   = EXCLUDED.target_body_fat,
            competition_sport = EXCLUDED.competition_sport,
            competition_date  = EXCLUDED.competition_date,
            occupation        = EXCLUDED.occupation,
            workout_days      = EXCLUDED.workout_days,
            workout_duration  = EXCLUDED.workout_duration,
            workout_intensity = EXCLUDED.workout_intensity,
            daily_steps       = EXCLUDED.daily_steps,
            sedentary_days    = EXCLUDED.sedentary_days,
            diet              = EXCLUDED.diet,
            diet_intensity    = EXCLUDED.diet_intensity,
            allergies         = EXCLUDED.allergies,
            sport             = EXCLUDED.sport,
            training_time     = EXCLUDED.training_time,
            breakfast_pref    = EXCLUDED.breakfast_pref,
            day_start         = EXCLUDED.day_start,
            day_end           = EXCLUDED.day_end`,
          [
            pseudonym,
            research.lang ?? null,
            research.age ?? null,
            research.height ?? null,
            research.weight ?? null,
            research.goal ?? null,
            research.target_weight ?? null,
            research.target_body_fat ?? null,
            research.competition_sport ?? null,
            research.competition_date ?? null,
            research.occupation ?? null,
            toIntegerEstimate(research.workout_days),
            research.workout_duration ?? null,
            research.workout_intensity ?? null,
            toIntegerEstimate(research.daily_steps),
            toIntegerEstimate(research.sedentary_days),
            research.diet ?? null,
            research.diet_intensity ?? null,
            research.allergies ?? null,
            research.sport ?? null,
            research.training_time ?? null,
            research.breakfast_pref ?? null,
            research.day_start ?? null,
            research.day_end ?? null
          ]
        );
        synced += 1;
      } catch (err) {
        failed += 1;
        console.error('[cron:longitudinal] User sync failed:', err.message);
      }
    }

    console.log(`[cron:longitudinal] Synced ${synced} users; ${failed} failed.`);
    return { synced, failed, skipped: false };
  } catch (err) {
    console.error('[cron:longitudinal] Sync failed:', err.message);
    return { synced: 0, failed: 0, skipped: false };
  }
}

module.exports = function registerLongitudinalCron(pool) {
  let running = false;
  const task = cron.schedule('0 1 * * *', async () => {
    if (running) {
      console.warn('[cron:longitudinal] Previous sync is still running; skipping overlap.');
      return;
    }

    running = true;
    try {
      await syncResearchLongitudinal(pool);
    } finally {
      running = false;
    }
  }, { timezone: 'UTC' });

  console.log('[cron:longitudinal] Scheduled daily at 01:00 UTC');
  return task;
};

module.exports.syncResearchLongitudinal = syncResearchLongitudinal;
