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
    const updates = {};
    const consentFields = ['health_data_consent', 'wearable_consent'];

    for (const field of consentFields) {
      if (!Object.prototype.hasOwnProperty.call(req.body || {}, field)) continue;
      if (typeof req.body[field] !== 'boolean') {
        return res.status(400).json({ error: 'invalid_consent_value' });
      }
      updates[field] = req.body[field];
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'no_profile_fields' });
    }

    const admin = getSupabaseAdmin();
    if (!admin) {
      return res.status(503).json({ error: 'supabase_admin_unavailable' });
    }

    try {
      const { error } = await admin
        .from('user_onboarding')
        .update(updates)
        .eq('user_id', req.userId);

      if (error) {
        console.error('Profile consent update failed:', error.message);
        return res.status(500).json({ error: 'profile_update_failed' });
      }

      return res.json({ success: true });
    } catch (error) {
      console.error('Profile consent update failed:', error.message);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  router.post('/anonymise-health-data', verifyToken, async (req, res) => {
    const admin = getSupabaseAdmin();
    if (!admin) {
      return res.status(503).json({ error: 'supabase_admin_unavailable' });
    }

    const onboardingHealthData = {
      health_data_consent: false,
      age: null,
      height: null,
      weight: null,
      goal: null,
      target_weight: null,
      target_body_fat: null,
      competition_sport: null,
      competition_date: null,
      occupation: null,
      workout_days: null,
      workout_duration: null,
      workout_intensity: null,
      daily_steps: null,
      sedentary_days: null,
      diet: null,
      diet_intensity: null,
      allergies: null,
      sport: null,
      training_time: null,
      breakfast_pref: null,
      day_start: null,
      day_end: null
    };

    try {
      const { error: onboardingError } = await admin
        .from('user_onboarding')
        .update(onboardingHealthData)
        .eq('user_id', req.userId);

      if (onboardingError) {
        console.error('Health data anonymisation failed:', onboardingError.message);
        return res.status(500).json({ error: 'anonymisation_failed' });
      }

      const { error: userError } = await admin
        .from('users')
        .update({
          age: null,
          height: null,
          weight: null,
          goal: null
        })
        .eq('id', req.userId);

      if (userError) {
        console.error('Health data anonymisation failed:', userError.message);
        return res.status(500).json({ error: 'anonymisation_failed' });
      }

      return res.json({ success: true });
    } catch (error) {
      console.error('Health data anonymisation failed:', error.message);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  router.delete('/me', verifyToken, async (req, res) => {
    try {
      const result = await pool.query(
        'DELETE FROM users WHERE id = $1 RETURNING id, email',
        [req.userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.verifyToken = verifyToken;
  return router;
};
