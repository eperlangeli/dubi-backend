const express = require('express');

module.exports = (pool) => {
  const router = express.Router();
  const authModule = require('./auth')(pool);
  const { verifyToken } = authModule;

  // Submit NPS
  router.post('/submit', verifyToken, async (req, res) => {
    try {
      const { score } = req.body;

      if (!score || score < 1 || score > 10) {
        return res.status(400).json({ error: 'Score must be 1-10' });
      }

      const result = await pool.query(
        'INSERT INTO nps_responses (user_id, score) VALUES ($1, $2) RETURNING *',
        [req.userId, score]
      );

      res.json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get NPS average
  router.get('/average', verifyToken, async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT AVG(score) as average, COUNT(*) as total FROM nps_responses WHERE user_id = $1',
        [req.userId]
      );

      const { average, total } = result.rows[0];

      res.json({ average: average ? Math.round(average * 10) / 10 : null, total });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
