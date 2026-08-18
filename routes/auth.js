const express = require('express');
const jwt = require('jsonwebtoken');
const bcryptjs = require('bcryptjs');
const crypto = require('crypto');
const { CONSENT_POLICY } = require('../config/legal-policy');

let createClient = null;
try {
  ({ createClient } = require('@supabase/supabase-js'));
} catch (error) {
  // Render installs it from package.json. Keep local syntax checks usable.
}

let Resend = null;
try {
  ({ Resend } = require('resend'));
} catch (error) {
  // Optional in local development. Render installs it from package.json.
}

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const PASSWORD_RESET_COOLDOWN_MS = 60 * 1000;
const PASSWORD_RESET_MESSAGE = 'If this email is registered, you will receive a reset link.';
const GENERIC_LOGIN_ERROR = 'Email o password non corretti';
const DELETION_OTP_TTL_MS = 15 * 60 * 1000;
const RESEND_FROM_EMAIL = 'onboarding@dubi.health';

const rateLimitBuckets = new Map();

const getClientIp = (req) => (
  String(req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
    .split(',')[0]
    .trim()
);

const createIpRateLimiter = ({ name, windowMs, max, message = 'Too many requests' }) => (req, res, next) => {
  const now = Date.now();
  const key = `${name}:${getClientIp(req)}`;
  const current = rateLimitBuckets.get(key);

  if (!current || now - current.startedAt >= windowMs) {
    rateLimitBuckets.set(key, { count: 1, startedAt: now });
    return next();
  }

  if (current.count >= max) {
    const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (now - current.startedAt)) / 1000));
    res.setHeader('Retry-After', String(retryAfterSeconds));
    return res.status(429).json({ error: message });
  }

  current.count += 1;
  return next();
};

const loginRateLimit = createIpRateLimiter({
  name: 'auth-login',
  windowMs: 15 * 60 * 1000,
  max: 5
});
const registerRateLimit = createIpRateLimiter({
  name: 'auth-register',
  windowMs: 60 * 60 * 1000,
  max: 3
});
const passwordResetRateLimit = createIpRateLimiter({
  name: 'auth-reset-password',
  windowMs: 60 * 60 * 1000,
  max: 3
});

const hashResetToken = (token) => (
  crypto.createHash('sha256').update(token).digest('hex')
);

const getFrontendBaseUrl = () => (
  process.env.FRONTEND_BASE_URL ||
  process.env.PASSWORD_RESET_BASE_URL ||
  'https://dubi-frontend.onrender.com'
).replace(/\/+$/, '');

const buildResetEmail = (resetUrl) => ({
  subject: 'Reset your DUBI password',
  html: `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#232323">
      <h2>Reset your DUBI password</h2>
      <p>We received a request to create a new password for your DUBI account.</p>
      <p>
        <a href="${resetUrl}" style="display:inline-block;background:#6B8A64;color:#fff;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:700">
          Create a new password
        </a>
      </p>
      <p>This link expires in 1 hour and can only be used once.</p>
      <p>If you did not request this change, you can safely ignore this email.</p>
    </div>
  `
});

const buildDeletionOtpEmail = (otp) => ({
  subject: 'Conferma cancellazione account DUBI',
  text: `Il tuo codice di conferma è: ${otp}. Valido 15 minuti. ` +
    'Se non hai richiesto la cancellazione, ignora questa email.'
});

const buildDeletionConfirmationEmail = () => ({
  subject: 'Il tuo account DUBI è stato cancellato',
  text: 'Il tuo account è stato cancellato. I tuoi dati saranno rimossi entro 24 mesi ' +
    'come da Informativa Privacy.'
});

const sendDeletionEmail = async ({ to, subject, text }) => {
  if (!process.env.RESEND_API_KEY || !Resend) {
    throw new Error('Deletion email service is unavailable.');
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const result = await resend.emails.send({
    from: RESEND_FROM_EMAIL,
    to,
    subject,
    text
  });

  if (result?.error) throw new Error('Deletion email delivery failed.');
};

let supabaseAdmin = null;
const getSupabaseAdmin = () => {
  if (supabaseAdmin) return supabaseAdmin;
  const url = String(process.env.SUPABASE_URL || '').trim();
  const serviceKey = String(process.env.SUPABASE_SERVICE_KEY || '').trim();
  if (!createClient || !url || !serviceKey) return null;

  supabaseAdmin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return supabaseAdmin;
};

module.exports = (pool) => {
  const router = express.Router();

  const createResearchPseudonym = (userId) => {
    const salt = String(process.env.RESEARCH_SALT || '').trim();
    if (!salt) return null;
    return crypto.createHmac('sha256', salt).update(String(userId)).digest('hex');
  };

  const toResearchIntegerEstimate = (value) => {
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

  async function saveResearchAggregate(userId, reason) {
    const savepoint = 'research_aggregate_attempt';

    try {
      const pseudonym = createResearchPseudonym(userId);
      if (!pseudonym) {
        console.error('saveResearchAggregate skipped: RESEARCH_SALT is not configured.');
        return;
      }

      // A failed statement aborts a PostgreSQL transaction even when its error
      // is caught in JavaScript. The savepoint keeps this helper non-blocking.
      await pool.query(`SAVEPOINT ${savepoint}`);

      const { rows } = await pool.query(
        `SELECT
          COALESCE(uo.age, u.age) AS age,
          COALESCE(uo.height, u.height) AS height,
          COALESCE(uo.weight, u.weight) AS weight,
          COALESCE(uo.goal, u.goal) AS goal,
          uo.gender,
          uo.diet,
          uo.workout_days,
          uo.workout_intensity,
          uo.occupation,
          uo.daily_steps,
          to_jsonb(u)->>'lang' AS lang
         FROM users u
         JOIN user_onboarding uo ON uo.user_id = u.id
         WHERE u.id = $1
           AND uo.research_consent = true`,
        [userId]
      );

      if (!rows.length) {
        await pool.query(`RELEASE SAVEPOINT ${savepoint}`);
        console.error(`saveResearchAggregate skipped: no eligible consented research row for reason=${reason}.`);
        return;
      }

      const research = rows[0];
      const age = Number(research.age);
      const ageRange = !age || age < 18 ? null
        : age < 25 ? '18-24'
        : age < 35 ? '25-34'
        : age < 45 ? '35-44'
        : age < 55 ? '45-54'
        : '55+';

      const heightMetres = Number(research.height) / 100;
      const weightKg = Number(research.weight);
      let bmiRange = null;
      if (heightMetres > 0 && weightKg > 0) {
        const bmi = weightKg / (heightMetres * heightMetres);
        bmiRange = bmi < 18.5 ? 'underweight'
          : bmi < 25 ? 'normal'
          : bmi < 30 ? 'overweight'
          : 'obese';
      }

      const dailySteps = String(research.daily_steps || '').trim().toLowerCase();
      const numericSteps = Number(dailySteps);
      let stepsRange = 'unknown';
      if (dailySteps === '<3000' || dailySteps === '3000-6000') {
        stepsRange = 'low';
      } else if (dailySteps === '6000-8000' || dailySteps === '8000-10000') {
        stepsRange = 'moderate';
      } else if (dailySteps === '10000+') {
        stepsRange = 'high';
      } else if (Number.isFinite(numericSteps) && numericSteps > 0) {
        stepsRange = numericSteps < 5000 ? 'low'
          : numericSteps < 10000 ? 'moderate'
          : 'high';
      }

      await pool.query(
        `INSERT INTO research_aggregates
          (pseudonym, age_range, bmi_range, goal, diet_type, workout_days,
           workout_intensity, occupation_type, steps_range, reason, lang)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          pseudonym,
          ageRange,
          bmiRange,
          research.goal || null,
          research.diet || null,
          research.workout_days != null ? Number(research.workout_days) : null,
          research.workout_intensity || null,
          research.occupation || null,
          stepsRange,
          reason,
          research.lang || null
        ]
      );

      await pool.query(`RELEASE SAVEPOINT ${savepoint}`);
      console.info(`saveResearchAggregate wrote research_aggregates for reason=${reason}.`);
    } catch (err) {
      try {
        await pool.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await pool.query(`RELEASE SAVEPOINT ${savepoint}`);
      } catch (savepointError) {
        console.error('saveResearchAggregate savepoint recovery failed:', savepointError.message);
      }
      console.error(`saveResearchAggregate failed for reason=${reason}:`, err.message);
    }
  }

  async function saveResearchSnapshot(userId, reason) {
    const savepoint = 'research_snapshot_attempt';

    try {
      const pseudonym = createResearchPseudonym(userId);
      if (!pseudonym) {
        console.error('saveResearchSnapshot skipped: RESEARCH_SALT is not configured.');
        return;
      }

      await pool.query(`SAVEPOINT ${savepoint}`);

      const { rows } = await pool.query(
        `SELECT
          COALESCE(uo.age, u.age) AS age,
          COALESCE(uo.height, u.height) AS height,
          COALESCE(uo.weight, u.weight) AS weight,
          COALESCE(uo.goal, u.goal) AS goal,
          uo.gender,
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
         WHERE u.id = $1
           AND uo.research_consent = true`,
        [userId]
      );

      if (!rows.length) {
        await pool.query(`RELEASE SAVEPOINT ${savepoint}`);
        console.error(`saveResearchSnapshot skipped: no eligible consented research row for reason=${reason}.`);
        return;
      }

      const research = rows[0];
      const keyFieldsNull = ['age', 'height', 'weight', 'goal', 'diet']
        .every((field) => research[field] === null || research[field] === undefined || research[field] === '');

      if (keyFieldsNull) {
        const { rows: longitudinalRows } = await pool.query(
          'SELECT * FROM research_longitudinal WHERE pseudonym = $1 LIMIT 1',
          [pseudonym]
        );

        if (longitudinalRows.length) {
          const longitudinal = longitudinalRows[0];
          const fallbackFields = [
            'age', 'height', 'weight', 'gender', 'goal', 'lang',
            'target_weight', 'target_body_fat', 'competition_sport', 'competition_date',
            'occupation', 'workout_days', 'workout_duration', 'workout_intensity',
            'daily_steps', 'sedentary_days', 'diet', 'diet_intensity', 'allergies', 'sport',
            'training_time', 'breakfast_pref', 'day_start', 'day_end'
          ];
          for (const field of fallbackFields) {
            research[field] = research[field] ?? longitudinal[field] ?? null;
          }
          console.log('saveResearchSnapshot: used longitudinal fallback.');
        }
      }

      await pool.query(
        `INSERT INTO research_data_snapshots (
          captured_at, pseudonym,
          age, height, weight, gender, goal,
          target_weight, target_body_fat,
          occupation, workout_days, workout_duration, workout_intensity,
          daily_steps, sedentary_days,
          diet, diet_intensity, allergies, sport,
          training_time, breakfast_pref, day_start, day_end,
          competition_sport, competition_date, reason, lang
        ) VALUES (
          NOW(), $1,
          $2,$3,$4,$5,$6,
          $7,$8,
          $9,$10,$11,$12,
          $13,$14,
          $15,$16,$17,$18,
          $19,$20,$21,$22,
          $23,$24,$25,$26
        )`,
        [
          pseudonym,
          research.age ?? null,
          research.height ?? null,
          research.weight ?? null,
          research.gender ?? null,
          research.goal ?? null,
          research.target_weight ?? null,
          research.target_body_fat ?? null,
          research.occupation ?? null,
          research.workout_days ?? null,
          research.workout_duration ?? null,
          research.workout_intensity ?? null,
          research.daily_steps ?? null,
          research.sedentary_days ?? null,
          research.diet ?? null,
          research.diet_intensity ?? null,
          research.allergies ?? null,
          research.sport ?? null,
          research.training_time ?? null,
          research.breakfast_pref ?? null,
          research.day_start ?? null,
          research.day_end ?? null,
          research.competition_sport ?? null,
          research.competition_date ?? null,
          reason,
          research.lang ?? null
        ]
      );

      await pool.query(`RELEASE SAVEPOINT ${savepoint}`);
      console.info(`saveResearchSnapshot wrote research_data_snapshots for reason=${reason}.`);
    } catch (err) {
      try {
        await pool.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await pool.query(`RELEASE SAVEPOINT ${savepoint}`);
      } catch (savepointError) {
        console.error('saveResearchSnapshot savepoint recovery failed:', savepointError.message);
      }
      console.error(`saveResearchSnapshot failed for reason=${reason}:`, err.message);
    }
  }

  async function saveResearchLongitudinal(userId) {
    const savepoint = 'research_longitudinal_attempt';

    try {
      const pseudonym = createResearchPseudonym(userId);
      if (!pseudonym) {
        console.error('saveResearchLongitudinal skipped: RESEARCH_SALT is not configured.');
        return;
      }

      await pool.query(`SAVEPOINT ${savepoint}`);

      const { rows } = await pool.query(
        `SELECT
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
         WHERE u.id = $1
           AND uo.research_consent = true
           AND (
             COALESCE(uo.age, u.age) IS NOT NULL
             OR COALESCE(uo.height, u.height) IS NOT NULL
             OR COALESCE(uo.weight, u.weight) IS NOT NULL
             OR COALESCE(uo.goal, u.goal) IS NOT NULL
             OR uo.diet IS NOT NULL
           )`,
        [userId]
      );

      if (!rows.length) {
        await pool.query(`RELEASE SAVEPOINT ${savepoint}`);
        console.error('saveResearchLongitudinal skipped: no eligible consented research row.');
        return;
      }

      const research = rows[0];
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
          toResearchIntegerEstimate(research.workout_days),
          research.workout_duration ?? null,
          research.workout_intensity ?? null,
          research.daily_steps ?? null,
          toResearchIntegerEstimate(research.sedentary_days),
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

      await pool.query(`RELEASE SAVEPOINT ${savepoint}`);
      console.info('saveResearchLongitudinal wrote research_longitudinal.');
    } catch (err) {
      try {
        await pool.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await pool.query(`RELEASE SAVEPOINT ${savepoint}`);
      } catch (savepointError) {
        console.error('saveResearchLongitudinal savepoint recovery failed:', savepointError.message);
      }
      console.error('saveResearchLongitudinal failed:', err.message);
    }
  }

  const publicUserFields = `
    id,
    email,
    age,
    weight,
    height,
    goal,
    is_minor,
    guardian_email,
    parental_consent_status,
    parental_consent_verified_at
  `;

  const toPublicUser = (user = {}) => ({
    id: user.id,
    email: user.email,
    age: user.age,
    weight: user.weight,
    height: user.height,
    goal: user.goal,
    is_minor: Boolean(user.is_minor),
    guardian_email: user.guardian_email || null,
    parental_consent_status: user.parental_consent_status || 'not_required',
    parental_consent_verified_at: user.parental_consent_verified_at || null
  });

  const calculateAgeFromDate = (dateOfBirth) => {
    if (!dateOfBirth) return null;
    const dob = new Date(`${String(dateOfBirth).slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(dob.getTime())) return null;

    const today = new Date();
    let age = today.getUTCFullYear() - dob.getUTCFullYear();
    const monthDelta = today.getUTCMonth() - dob.getUTCMonth();
    if (monthDelta < 0 || (monthDelta === 0 && today.getUTCDate() < dob.getUTCDate())) {
      age -= 1;
    }
    return age;
  };

  const normalizeDateOfBirth = (dateOfBirth) => {
    if (!dateOfBirth) return null;
    const normalized = String(dateOfBirth).slice(0, 10);
    const dob = new Date(`${normalized}T00:00:00Z`);
    return Number.isNaN(dob.getTime()) ? null : normalized;
  };

  const normalizeAge = ({ age, dateOfBirth }) => {
    const calculated = calculateAgeFromDate(dateOfBirth);
    if (Number.isFinite(calculated)) return calculated;
    const numericAge = Number(age);
    return Number.isFinite(numericAge) ? Math.floor(numericAge) : null;
  };

  const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.userId = decoded.userId;
      next();
    } catch (error) {
      res.status(401).json({ error: 'Invalid token' });
    }
  };

  router.post('/register', registerRateLimit, async (req, res) => {
    let client;
    try {
      const { password, dateOfBirth, age, weight, height, goal } = req.body || {};
      const email = String(req.body?.email || '').trim().toLowerCase();

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
      }

      const resolvedAge = normalizeAge({ age, dateOfBirth });
      if (!Number.isFinite(resolvedAge)) {
        return res.status(400).json({ error: 'age_required', message: 'Age or date of birth is required.' });
      }

      if (resolvedAge < 13) {
        return res.status(403).json({ error: 'age_blocked', message: 'Users under 13 may not register.' });
      }

      const isMinor = resolvedAge < 18;
      const consentStatus = isMinor ? 'pending' : 'not_required';
      const normalizedDateOfBirth = normalizeDateOfBirth(dateOfBirth);
      const passwordHash = bcryptjs.hashSync(password, 10);

      client = await pool.connect();
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.allow_registration', 'true', true)");
      const result = await client.query(
        `
        INSERT INTO users (
          email,
          password_hash,
          date_of_birth,
          age,
          weight,
          height,
          goal,
          is_minor,
          parental_consent_status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING ${publicUserFields}
        `,
        [
          email,
          passwordHash,
          normalizedDateOfBirth,
          resolvedAge,
          weight ?? null,
          height ?? null,
          goal ?? null,
          isMinor,
          consentStatus
        ]
      );
      await client.query('COMMIT');

      const token = jwt.sign(
        { userId: result.rows[0].id },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.json({ token, user: toPublicUser(result.rows[0]) });
    } catch (error) {
      if (client) {
        try { await client.query('ROLLBACK'); } catch (rollbackError) {
          console.error('Registration rollback failed:', rollbackError.message);
        }
      }
      if (error.code === '23505') {
        res.status(400).json({ error: 'Unable to register with these details' });
      } else {
        console.error('Registration failed:', error.message);
        res.status(500).json({ error: 'registration_failed' });
      }
    } finally {
      if (client) client.release();
    }
  });

  router.post('/login', loginRateLimit, async (req, res) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || '');

      if (!email || !password) {
        return res.status(401).json({ error: GENERIC_LOGIN_ERROR });
      }

      const result = await pool.query(
        'SELECT * FROM users WHERE LOWER(email) = $1',
        [email]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: GENERIC_LOGIN_ERROR });
      }

      const user = result.rows[0];
      const isValid = bcryptjs.compareSync(password, user.password_hash);

      if (!isValid) {
        return res.status(401).json({ error: GENERIC_LOGIN_ERROR });
      }

      if (user.is_suspended) {
        return res.status(403).json({
          error: 'Account sospeso. Contatta support@dubi.health'
        });
      }

      const token = jwt.sign(
        { userId: user.id },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.json({ token, user: toPublicUser(user) });
    } catch (error) {
      console.error('Login failed:', error.message);
      res.status(500).json({ error: 'login_failed' });
    }
  });

  router.post('/forgot-password', passwordResetRateLimit, async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    let client;
    let resetToken = null;
    let resetTokenHash = null;
    let recipient = null;

    try {
      client = await pool.connect();
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.allow_password_reset', 'true', true)");

      const userResult = await client.query(
        'SELECT id, email FROM users WHERE LOWER(email) = $1 LIMIT 1',
        [email]
      );

      if (userResult.rows.length === 0) {
        await client.query('COMMIT');
        return res.status(200).json({ message: PASSWORD_RESET_MESSAGE });
      }

      const user = userResult.rows[0];
      const recentResult = await client.query(
        `
        SELECT created_at
        FROM password_reset_tokens
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [user.id]
      );

      const lastCreatedAt = recentResult.rows[0]?.created_at
        ? new Date(recentResult.rows[0].created_at).getTime()
        : 0;

      if (lastCreatedAt && Date.now() - lastCreatedAt < PASSWORD_RESET_COOLDOWN_MS) {
        await client.query('COMMIT');
        return res.status(200).json({ message: PASSWORD_RESET_MESSAGE });
      }

      resetToken = crypto.randomBytes(32).toString('hex');
      resetTokenHash = hashResetToken(resetToken);
      recipient = user.email;
      const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

      await client.query(
        'UPDATE password_reset_tokens SET used = true WHERE user_id = $1 AND used = false',
        [user.id]
      );
      await client.query(
        `
        INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
        VALUES ($1, $2, $3)
        `,
        [user.id, resetTokenHash, expiresAt]
      );
      await client.query('COMMIT');
    } catch (error) {
      if (client) {
        try { await client.query('ROLLBACK'); } catch (rollbackError) {
          console.error('Password reset request rollback failed.');
        }
      }
      console.error('Password reset request failed.');
      return res.status(200).json({ message: PASSWORD_RESET_MESSAGE });
    } finally {
      if (client) client.release();
    }

    setImmediate(async () => {
      try {
        if (!process.env.RESEND_API_KEY || !Resend) {
          throw new Error('Password reset email is not configured.');
        }

        const resetUrl = `${getFrontendBaseUrl()}/?reset_token=${encodeURIComponent(resetToken)}`;
        const copy = buildResetEmail(resetUrl);
        const resend = new Resend(process.env.RESEND_API_KEY);
        const result = await resend.emails.send({
          from: RESEND_FROM_EMAIL,
          to: recipient,
          subject: copy.subject,
          html: copy.html
        });

        if (result?.error) {
          throw new Error('Password reset email delivery failed.');
        }
      } catch (error) {
        console.error('Password reset email delivery failed.');

        let cleanupClient;
        try {
          cleanupClient = await pool.connect();
          await cleanupClient.query('BEGIN');
          await cleanupClient.query("SELECT set_config('app.allow_password_reset', 'true', true)");
          await cleanupClient.query(
            'UPDATE password_reset_tokens SET used = true WHERE token_hash = $1',
            [resetTokenHash]
          );
          await cleanupClient.query('COMMIT');
        } catch (cleanupError) {
          if (cleanupClient) {
            try { await cleanupClient.query('ROLLBACK'); } catch (rollbackError) {
              console.error('Password reset token cleanup rollback failed.');
            }
          }
          console.error('Password reset token cleanup failed.');
        } finally {
          if (cleanupClient) cleanupClient.release();
        }
      }
    });

    return res.status(200).json({ message: PASSWORD_RESET_MESSAGE });
  });

  router.post('/reset-password', passwordResetRateLimit, async (req, res) => {
    const token = String(req.body?.token || '').trim();
    const newPassword = String(req.body?.newPassword || '');

    if (!token) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    if (Buffer.byteLength(newPassword, 'utf8') > 72) {
      return res.status(400).json({ error: 'Password must be at most 72 UTF-8 bytes' });
    }

    const tokenHash = hashResetToken(token);
    let client;

    try {
      client = await pool.connect();
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.allow_password_reset', 'true', true)");

      const tokenResult = await client.query(
        `
        SELECT id, user_id
        FROM password_reset_tokens
        WHERE token_hash = $1
          AND used = false
          AND expires_at > NOW()
        FOR UPDATE
        `,
        [tokenHash]
      );

      if (tokenResult.rows.length === 0) {
        await client.query('COMMIT');
        return res.status(400).json({ error: 'Invalid or expired reset token' });
      }

      const resetRecord = tokenResult.rows[0];
      const passwordHash = await bcryptjs.hash(newPassword, 10);

      const userResult = await client.query(
        'UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id',
        [passwordHash, resetRecord.user_id]
      );

      if (userResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Invalid or expired reset token' });
      }

      await client.query(
        `
        UPDATE password_reset_tokens
        SET used = true, used_at = NOW()
        WHERE user_id = $1 AND used = false
        `,
        [resetRecord.user_id]
      );
      await client.query('COMMIT');

      return res.status(200).json({ message: 'Password updated successfully' });
    } catch (error) {
      if (client) {
        try { await client.query('ROLLBACK'); } catch (rollbackError) {
          console.error('Password update rollback failed.');
        }
      }
      console.error('Password update failed.');
      return res.status(500).json({ error: 'Unable to update password' });
    } finally {
      if (client) client.release();
    }
  });

  router.get('/me', verifyToken, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT ${publicUserFields} FROM users WHERE id = $1`,
        [req.userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json(toPublicUser(result.rows[0]));
    } catch (error) {
      console.error('Auth user fetch failed:', error.message);
      res.status(500).json({ error: 'user_fetch_failed' });
    }
  });

  router.patch('/profile', verifyToken, async (req, res) => {
    const allowed = ['health_data_consent', 'wearable_consent', 'research_consent'];
    const updates = {};

    for (const field of allowed) {
      if (!Object.prototype.hasOwnProperty.call(req.body || {}, field)) continue;
      if (typeof req.body[field] !== 'boolean') {
        return res.status(400).json({ error: 'invalid_consent_value' });
      }
      updates[field] = req.body[field];
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'no_profile_fields' });
    }

    const shouldCaptureResearchRevocation = updates.research_consent === false;
    const shouldCaptureResearchGrant = updates.research_consent === true;

    if (shouldCaptureResearchRevocation) {
      await saveResearchSnapshot(req.userId, 'consent_revoked');
      await saveResearchAggregate(req.userId, 'consent_revoked');
    }

    const values = [];
    const setClauses = [];
    const addValue = (value) => {
      values.push(value);
      return `$${values.length}`;
    };

    for (const field of Object.keys(updates)) {
      const placeholder = addValue(updates[field]);

      if (field === 'research_consent') {
        const policyPlaceholder = addValue(CONSENT_POLICY.researchPolicyVersion);
        setClauses.push(
          `research_consent = ${placeholder}`,
          `research_consent_revoked_at = CASE
            WHEN ${placeholder} = true THEN NULL
            WHEN research_consent = true AND ${placeholder} = false THEN NOW()
            ELSE research_consent_revoked_at
          END`,
          `research_consent_at = CASE
            WHEN ${placeholder} = true THEN NOW()
            ELSE research_consent_at
          END`,
          `research_policy_version = CASE
            WHEN ${placeholder} = true THEN ${policyPlaceholder}
            ELSE research_policy_version
          END`
        );
        continue;
      }

      setClauses.push(`${field} = ${placeholder}`);

      if (field === 'health_data_consent') {
        const privacyPlaceholder = addValue(CONSENT_POLICY.privacyPolicyVersion);
        const termsPlaceholder = addValue(CONSENT_POLICY.termsVersion);
        const disclaimerPlaceholder = addValue(CONSENT_POLICY.healthDisclaimerVersion);
        setClauses.push(
          `health_data_consent_at = CASE
            WHEN ${placeholder} = true THEN NOW()
            ELSE health_data_consent_at
          END`,
          `privacy_policy_version = CASE
            WHEN ${placeholder} = true THEN ${privacyPlaceholder}
            ELSE privacy_policy_version
          END`,
          `terms_version = CASE
            WHEN ${placeholder} = true THEN ${termsPlaceholder}
            ELSE terms_version
          END`,
          `health_disclaimer_version = CASE
            WHEN ${placeholder} = true THEN ${disclaimerPlaceholder}
            ELSE health_disclaimer_version
          END`
        );
      }

      if (field === 'wearable_consent') {
        const policyPlaceholder = addValue(CONSENT_POLICY.wearablePolicyVersion);
        setClauses.push(
          `wearable_consent_at = CASE
            WHEN ${placeholder} = true THEN NOW()
            ELSE wearable_consent_at
          END`,
          `wearable_policy_version = CASE
            WHEN ${placeholder} = true THEN ${policyPlaceholder}
            ELSE wearable_policy_version
          END`
        );
      }
    }

    values.push(req.userId);

    try {
      await pool.query(
        `UPDATE user_onboarding SET ${setClauses.join(', ')} WHERE user_id = $${values.length}`,
        values
      );

      if (shouldCaptureResearchGrant) {
        await saveResearchSnapshot(req.userId, 'consent_granted');
        await saveResearchLongitudinal(req.userId);
      }

      return res.json({ success: true });
    } catch (err) {
      console.error('Profile consent update failed:', err.message);
      return res.status(500).json({ error: 'profile_update_failed' });
    }
  });

  router.post('/anonymise-health-data', verifyToken, async (req, res) => {
    try {
      // The request-scoped pool runs both statements in the transaction opened
      // by withAuthenticatedDbContext, preserving the RLS user context.
      await pool.query(
        `UPDATE user_onboarding SET
          health_data_consent = false,
          age = NULL,
          height = NULL,
          weight = NULL,
          goal = NULL,
          target_weight = NULL,
          target_body_fat = NULL,
          competition_sport = NULL,
          competition_date = NULL,
          occupation = NULL,
          workout_days = NULL,
          workout_duration = NULL,
          workout_intensity = NULL,
          daily_steps = NULL,
          sedentary_days = NULL,
          diet = NULL,
          diet_intensity = NULL,
          allergies = NULL,
          sport = NULL,
          training_time = NULL,
          breakfast_pref = NULL,
          day_start = NULL,
          day_end = NULL
        WHERE user_id = $1`,
        [req.userId]
      );

      await pool.query(
        `UPDATE users SET
          age = NULL,
          height = NULL,
          weight = NULL,
          goal = NULL,
          health_revoked_at = COALESCE(health_revoked_at, NOW())
         WHERE id = $1`,
        [req.userId]
      );

      return res.json({ success: true });
    } catch (err) {
      console.error('Health data anonymisation failed:', err.message);
      return res.status(500).json({ error: 'anonymisation_failed' });
    }
  });

  router.get('/account/export', verifyToken, async (req, res) => {
    const selectUserOwnedRows = async (table, orderBy = 'id ASC') => {
      const { rows } = await pool.query(
        `SELECT *
         FROM ${table}
         WHERE user_id = $1
         ORDER BY ${orderBy}`,
        [req.userId]
      );
      return rows;
    };

    try {
      const userResult = await pool.query(
        `SELECT
           id, email, date_of_birth, age, weight, height, goal,
           is_minor, guardian_email, parental_consent_status,
           parental_consent_verified_at, created_at
         FROM users
         WHERE id = $1`,
        [req.userId]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const [
        onboarding,
        userPlans,
        dailyPlans,
        dailyConsumption,
        mealPlans,
        progress,
        weightHistory,
        adherenceRows,
        npsResponses,
        openwearablesConnections,
        wearableData,
        trainingWeekPlans,
        trainingConfirmations
      ] = await Promise.all([
        selectUserOwnedRows('user_onboarding', 'updated_at DESC NULLS LAST, id ASC'),
        selectUserOwnedRows('user_plans', 'created_at DESC NULLS LAST, id ASC'),
        selectUserOwnedRows('daily_plans', 'plan_date DESC NULLS LAST, id ASC'),
        selectUserOwnedRows('daily_consumption', 'date DESC NULLS LAST, logged_at DESC NULLS LAST, id ASC'),
        selectUserOwnedRows('meal_plans', 'created_at DESC NULLS LAST, id ASC'),
        selectUserOwnedRows('user_progress', 'created_at DESC NULLS LAST, id ASC'),
        selectUserOwnedRows('weight_history', 'logged_at DESC NULLS LAST, id ASC'),
        selectUserOwnedRows('adherence', 'date DESC NULLS LAST, id ASC'),
        selectUserOwnedRows('nps_responses', 'submitted_at DESC NULLS LAST, id ASC'),
        selectUserOwnedRows('openwearables_connections', 'updated_at DESC NULLS LAST, id ASC'),
        selectUserOwnedRows('wearable_data', 'data_date DESC NULLS LAST, synced_at DESC NULLS LAST, id ASC'),
        selectUserOwnedRows('training_week_plans', 'week_start DESC, id ASC'),
        selectUserOwnedRows('training_confirmations', 'day DESC, id ASC')
      ]);

      return res.json({
        generated_at: new Date().toISOString(),
        user: userResult.rows[0],
        data: {
          user_onboarding: onboarding,
          user_plans: userPlans,
          daily_plans: dailyPlans,
          daily_consumption: dailyConsumption,
          meal_plans: mealPlans,
          user_progress: progress,
          weight_history: weightHistory,
          adherence: adherenceRows,
          nps_responses: npsResponses,
          openwearables_connections: openwearablesConnections,
          wearable_data: wearableData,
          training_week_plans: trainingWeekPlans,
          training_confirmations: trainingConfirmations
        }
      });
    } catch (error) {
      console.error('Account data export failed:', error.message);
      return res.status(500).json({ error: 'data_export_failed' });
    }
  });

  router.get('/account/deletion-preview', verifyToken, async (req, res) => {
    try {
      const pseudonym = createResearchPseudonym(req.userId);
      if (!pseudonym) {
        return res.status(503).json({ error: 'research_cleanup_unavailable' });
      }

      const summary = await pool.query(
        `SELECT
          u.created_at AS account_created,
          (SELECT COUNT(*)::integer FROM adherence WHERE user_id = u.id) AS meals_logged,
          (SELECT COUNT(*)::integer FROM user_plans WHERE user_id = u.id) AS plans,
          (SELECT COUNT(*)::integer FROM openwearables_connections WHERE user_id = u.id) AS wearable_connections
         FROM users u
         WHERE u.id = $1`,
        [req.userId]
      );

      if (summary.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const research = await pool.query(
        `SELECT
          EXISTS (SELECT 1 FROM research_data_snapshots WHERE pseudonym = $1)
          OR EXISTS (SELECT 1 FROM research_longitudinal WHERE pseudonym = $1)
          AS has_research_data`,
        [pseudonym]
      );

      return res.json({
        meals_logged: summary.rows[0].meals_logged,
        plans: summary.rows[0].plans,
        wearable_connections: summary.rows[0].wearable_connections,
        has_research_data: Boolean(research.rows[0]?.has_research_data),
        account_created: summary.rows[0].account_created
      });
    } catch (error) {
      console.error('Account deletion preview failed:', error.message);
      return res.status(500).json({ error: 'deletion_preview_failed' });
    }
  });

  router.post('/account/deletion-request', verifyToken, async (req, res) => {
    const otp = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const expiresAt = new Date(Date.now() + DELETION_OTP_TTL_MS);

    try {
      const userResult = await pool.query(
        'SELECT email FROM users WHERE id = $1',
        [req.userId]
      );
      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const otpHash = await bcryptjs.hash(otp, 10);
      await pool.query('DELETE FROM deletion_requests WHERE user_id = $1', [req.userId]);
      await pool.query(
        `INSERT INTO deletion_requests (user_id, otp_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [req.userId, otpHash, expiresAt]
      );

      const copy = buildDeletionOtpEmail(otp);
      try {
        await sendDeletionEmail({ to: userResult.rows[0].email, ...copy });
      } catch (emailError) {
        await pool.query('DELETE FROM deletion_requests WHERE user_id = $1', [req.userId]);
        console.error('Account deletion OTP email failed.');
        return res.status(502).json({ error: 'deletion_email_failed' });
      }

      return res.json({ message: 'OTP inviato via email' });
    } catch (error) {
      console.error('Account deletion request failed:', error.message);
      return res.status(500).json({ error: 'deletion_request_failed' });
    }
  });

  router.delete('/account', verifyToken, async (req, res) => {
    const otp = String(req.body?.otp || '').trim();
    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({ error: 'invalid_or_expired_otp' });
    }

    const pseudonym = createResearchPseudonym(req.userId);
    if (!pseudonym) {
      return res.status(503).json({ error: 'research_cleanup_unavailable' });
    }

    let client;
    let deletedEmail = null;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_user_id', $1, true)", [String(req.userId)]);
      await client.query("SELECT set_config('app.allow_password_reset', 'true', true)");

      const requestResult = await client.query(
        `SELECT otp_hash, expires_at
         FROM deletion_requests
         WHERE user_id = $1
         FOR UPDATE`,
        [req.userId]
      );

      const request = requestResult.rows[0];
      const expired = !request || new Date(request.expires_at).getTime() <= Date.now();
      const valid = !expired && await bcryptjs.compare(otp, request.otp_hash);
      if (!valid) {
        if (expired && request) {
          await client.query('DELETE FROM deletion_requests WHERE user_id = $1', [req.userId]);
          await client.query('COMMIT');
        } else {
          await client.query('ROLLBACK');
        }
        return res.status(400).json({ error: 'invalid_or_expired_otp' });
      }

      const userResult = await client.query(
        'SELECT email FROM users WHERE id = $1 FOR UPDATE',
        [req.userId]
      );
      if (userResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'User not found' });
      }
      deletedEmail = userResult.rows[0].email;

      const deleteByPseudonymIfPresent = async (table) => {
        const column = await client.query(
          `SELECT 1
           FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = $1
             AND column_name = 'pseudonym'
           LIMIT 1`,
          [table]
        );
        if (column.rows.length > 0) {
          await client.query(`DELETE FROM ${table} WHERE pseudonym = $1`, [pseudonym]);
        }
      };

      const deleteByUserIdIfPresent = async (table) => {
        const column = await client.query(
          `SELECT 1
           FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = $1
             AND column_name = 'user_id'
           LIMIT 1`,
          [table]
        );
        if (column.rows.length > 0) {
          await client.query(`DELETE FROM ${table} WHERE user_id::text = $1`, [String(req.userId)]);
        }
      };

      await client.query('DELETE FROM research_data_snapshots WHERE pseudonym = $1', [pseudonym]);
      await client.query('DELETE FROM research_longitudinal WHERE pseudonym = $1', [pseudonym]);
      await deleteByPseudonymIfPresent('research_aggregates');
      await client.query('DELETE FROM waitlist WHERE LOWER(email) = LOWER($1)', [deletedEmail]);

      const userOwnedTables = [
        'adherence',
        'daily_consumption',
        'daily_plans',
        'nps_responses',
        'openwearables_connections',
        'password_reset_tokens',
        'user_anomaly_events',
        'user_ingredient_swaps',
        'user_onboarding',
        'user_plans',
        'user_progress',
        'training_confirmations',
        'training_week_plans',
        'wearable_data',
        'weight_history'
      ];
      for (const table of userOwnedTables) {
        await client.query(`DELETE FROM ${table} WHERE user_id = $1`, [req.userId]);
      }

      const optionalTables = ['meal_plans', 'plans', 'wearable_tokens'];
      for (const table of optionalTables) {
        const exists = await client.query('SELECT to_regclass($1) AS table_name', [`public.${table}`]);
        if (exists.rows[0]?.table_name) {
          await deleteByUserIdIfPresent(table);
        }
      }

      await client.query('DELETE FROM deletion_requests WHERE user_id = $1', [req.userId]);
      await client.query('DELETE FROM users WHERE id = $1', [req.userId]);
      await client.query('COMMIT');
    } catch (error) {
      if (client) {
        try { await client.query('ROLLBACK'); } catch (rollbackError) {
          console.error('Account deletion rollback failed.');
        }
      }
      console.error('Account deletion failed:', error.message);
      return res.status(500).json({ error: 'account_deletion_failed' });
    } finally {
      if (client) client.release();
    }

    try {
      const copy = buildDeletionConfirmationEmail();
      await sendDeletionEmail({ to: deletedEmail, ...copy });
    } catch (emailError) {
      console.error('Account deletion confirmation email failed.');
    }

    return res.status(200).json({ message: 'Account cancellato' });
  });

  router.delete('/me', verifyToken, (req, res) => (
    res.status(410).json({ error: 'account_deletion_otp_required' })
  ));

  router.verifyToken = verifyToken;
  router.saveResearchSnapshot = saveResearchSnapshot;
  router.saveResearchLongitudinal = saveResearchLongitudinal;
  router.saveResearchAggregate = saveResearchAggregate;
  return router;
};
