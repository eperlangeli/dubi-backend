const express = require('express');
const jwt = require('jsonwebtoken');
const bcryptjs = require('bcryptjs');
const crypto = require('crypto');

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
      // A failed statement aborts a PostgreSQL transaction even when its error
      // is caught in JavaScript. The savepoint keeps this helper non-blocking.
      await pool.query(`SAVEPOINT ${savepoint}`);

      const { rows } = await pool.query(
        `SELECT
          COALESCE(uo.age, u.age) AS age,
          COALESCE(uo.height, u.height) AS height,
          COALESCE(uo.weight, u.weight) AS weight,
          COALESCE(uo.goal, u.goal) AS goal,
          uo.diet,
          uo.workout_days,
          uo.workout_intensity,
          uo.occupation,
          uo.daily_steps,
          to_jsonb(u)->>'lang' AS lang
         FROM users u
         LEFT JOIN user_onboarding uo ON uo.user_id = u.id
         WHERE u.id = $1`,
        [userId]
      );

      if (!rows.length) {
        await pool.query(`RELEASE SAVEPOINT ${savepoint}`);
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
          (age_range, bmi_range, goal, diet_type, workout_days,
           workout_intensity, occupation_type, steps_range, reason, lang)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
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
    } catch (err) {
      try {
        await pool.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await pool.query(`RELEASE SAVEPOINT ${savepoint}`);
      } catch (savepointError) {
        console.error('saveResearchAggregate savepoint recovery failed:', savepointError.message);
      }
      console.error('saveResearchAggregate failed (non-blocking):', err.message);
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
         LEFT JOIN user_onboarding uo ON uo.user_id = u.id
         WHERE u.id = $1`,
        [userId]
      );

      if (!rows.length) {
        await pool.query(`RELEASE SAVEPOINT ${savepoint}`);
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
            'age', 'height', 'weight', 'goal', 'lang',
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
          pseudonym, reason, lang,
          age, height, weight, goal,
          target_weight, target_body_fat,
          competition_sport, competition_date,
          occupation, workout_days, workout_duration, workout_intensity,
          daily_steps, sedentary_days,
          diet, diet_intensity, allergies, sport,
          training_time, breakfast_pref, day_start, day_end
        ) VALUES (
          $1,$2,$3,
          $4,$5,$6,$7,
          $8,$9,
          $10,$11,
          $12,$13,$14,$15,
          $16,$17,
          $18,$19,$20,$21,
          $22,$23,$24,$25
        )`,
        [
          pseudonym,
          reason,
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
          research.day_end ?? null
        ]
      );

      await pool.query(`RELEASE SAVEPOINT ${savepoint}`);
    } catch (err) {
      try {
        await pool.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await pool.query(`RELEASE SAVEPOINT ${savepoint}`);
      } catch (savepointError) {
        console.error('saveResearchSnapshot savepoint recovery failed:', savepointError.message);
      }
      console.error('saveResearchSnapshot failed (non-blocking):', err.message);
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
          toResearchIntegerEstimate(research.daily_steps),
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
    } catch (err) {
      try {
        await pool.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await pool.query(`RELEASE SAVEPOINT ${savepoint}`);
      } catch (savepointError) {
        console.error('saveResearchLongitudinal savepoint recovery failed:', savepointError.message);
      }
      console.error('saveResearchLongitudinal failed (non-blocking):', err.message);
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

  router.post('/register', async (req, res) => {
    let client;
    try {
      const { email, password, dateOfBirth, age, weight, height, goal } = req.body;

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
      const passwordHash = bcryptjs.hashSync(password, 10);

      client = await pool.connect();
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.allow_registration', 'true', true)");
      const result = await client.query(
        `
        INSERT INTO users (
          email,
          password_hash,
          age,
          weight,
          height,
          goal,
          is_minor,
          parental_consent_status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING ${publicUserFields}
        `,
        [
          email,
          passwordHash,
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
        res.status(400).json({ error: 'Email already exists' });
      } else {
        res.status(500).json({ error: error.message });
      }
    } finally {
      if (client) client.release();
    }
  });

  router.post('/login', async (req, res) => {
    try {
      const { email, password } = req.body;

      const result = await pool.query(
        'SELECT * FROM users WHERE email = $1',
        [email]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const user = result.rows[0];
      const isValid = bcryptjs.compareSync(password, user.password_hash);

      if (!isValid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const token = jwt.sign(
        { userId: user.id },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.json({ token, user: toPublicUser(user) });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/forgot-password', async (req, res) => {
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
          from: process.env.EMAIL_FROM || process.env.RESEND_FROM_EMAIL || 'DUBI <support@dubi.health>',
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

  router.post('/reset-password', async (req, res) => {
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
      res.status(500).json({ error: error.message });
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

    const setClauses = Object.keys(updates)
      .map((field, index) => `${field} = $${index + 1}`)
      .join(', ');
    const values = [...Object.values(updates), req.userId];

    try {
      await pool.query(
        `UPDATE user_onboarding SET ${setClauses} WHERE user_id = $${values.length}`,
        values
      );

      if (updates.research_consent === true) {
        await saveResearchLongitudinal(req.userId);
      }

      return res.json({ success: true });
    } catch (err) {
      console.error('Profile consent update failed:', err.message);
      return res.status(500).json({ error: 'profile_update_failed' });
    }
  });

  router.post('/anonymise-health-data', verifyToken, async (req, res) => {
    await saveResearchSnapshot(req.userId, 'consent_revoked');
    await saveResearchAggregate(req.userId, 'consent_revoked');

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
        'UPDATE users SET age = NULL, height = NULL, weight = NULL, goal = NULL WHERE id = $1',
        [req.userId]
      );

      return res.json({ success: true });
    } catch (err) {
      console.error('Health data anonymisation failed:', err.message);
      return res.status(500).json({ error: 'anonymisation_failed' });
    }
  });

  router.delete('/me', verifyToken, async (req, res) => {
    try {
      await saveResearchSnapshot(req.userId, 'account_deleted');
      await saveResearchAggregate(req.userId, 'account_deleted');

      const result = await pool.query(
        'DELETE FROM users WHERE id = $1 RETURNING id, email',
        [req.userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      return res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.verifyToken = verifyToken;
  return router;
};
