const express = require('express');

module.exports = (pool) => {
  const router = express.Router();
  const authModule = require('./auth')(pool);
  const { verifyToken } = authModule;

  // Log adherence
  router.post('/log', verifyToken, async (req, res) => {
    try {
      const { date, completed } = req.body;

      const result = await pool.query(
        'INSERT INTO adherence (user_id, date, completed) VALUES ($1, $2, $3) RETURNING *',
        [req.userId, date, completed]
      );

      res.json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get adherence history
  router.get('/history', verifyToken, async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT * FROM adherence WHERE user_id = $1 ORDER BY date DESC LIMIT 30',
        [req.userId]
      );

      res.json(result.rows);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get adherence percentage (last 30 days)
  router.get('/percentage', verifyToken, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN completed THEN 1 ELSE 0 END) as completed
        FROM adherence 
        WHERE user_id = $1 
        AND date >= CURRENT_DATE - INTERVAL '30 days'`,
        [req.userId]
      );

      const { total, completed } = result.rows[0];
      const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

      res.json({ total, completed, percentage });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
