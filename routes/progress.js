const express = require('express');
const jwt = require('jsonwebtoken');

module.exports = (pool) => {
  const router = express.Router();

  const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Invalid token format' });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.userId = decoded.userId;
      next();
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  };

  router.post('/save', verifyToken, async (req, res) => {
    try {
      const {
        weight,
        calories_consumed,
        meals_completed,
        meals_total,
        adherence_percent,
        note
      } = req.body;

      const result = await pool.query(
        `
        INSERT INTO user_progress (
          user_id,
          weight,
          calories_consumed,
          meals_completed,
          meals_total,
          adherence_percent,
          note
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *;
        `,
        [
          req.userId,
          weight,
          calories_consumed,
          meals_completed,
          meals_total,
          adherence_percent,
          note
        ]
      );

      res.json({
        message: 'Progress saved successfully',
        progress: result.rows[0]
      });
    } catch (error) {
      console.error('Progress save error:', error);
      res.status(500).json({ error: 'Failed to save progress' });
    }
  });

  router.get('/history', verifyToken, async (req, res) => {
    try {
      const result = await pool.query(
        `
        SELECT *
        FROM user_progress
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 50;
        `,
        [req.userId]
      );

      res.json({
        progress: result.rows
      });
    } catch (error) {
      console.error('Progress fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch progress history' });
    }
  });

  return router;
};
