const express = require('express');

module.exports = (pool) => {
  const router = express.Router();
  const authModule = require('./auth')(pool);
  const { verifyToken } = authModule;

  // Log weight
  router.post('/log', verifyToken, async (req, res) => {
    try {
      const { weight } = req.body;

      if (!weight) {
        return res.status(400).json({ error: 'Weight required' });
      }

      const result = await pool.query(
        'INSERT INTO weight_history (user_id, weight) VALUES ($1, $2) RETURNING *',
        [req.userId, weight]
      );

      res.json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get weight history
  router.get('/history', verifyToken, async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT * FROM weight_history WHERE user_id = $1 ORDER BY logged_at DESC LIMIT 90',
        [req.userId]
      );

      res.json(result.rows);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get weight change (last 30 days)
  router.get('/change', verifyToken, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT 
          (SELECT weight FROM weight_history WHERE user_id = $1 ORDER BY logged_at DESC LIMIT 1) as current,
          (SELECT weight FROM weight_history WHERE user_id = $1 AND logged_at <= CURRENT_TIMESTAMP - INTERVAL '30 days' ORDER BY logged_at DESC LIMIT 1) as thirty_days_ago
        `,
        [req.userId]
      );

      const { current, thirty_days_ago } = result.rows[0];
      const change = thirty_days_ago ? Math.round((current - thirty_days_ago) * 10) / 10 : null;

      res.json({ current, thirty_days_ago, change_last_30_days: change });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
