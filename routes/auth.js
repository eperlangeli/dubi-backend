const express = require('express');
const jwt = require('jsonwebtoken');
const bcryptjs = require('bcryptjs');

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
