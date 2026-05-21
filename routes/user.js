const express = require('express');

module.exports = (pool) => {
  const router = express.Router();
  const authModule = require('./auth')(pool);
  const { verifyToken } = authModule;

  // Update profile
  router.post('/profile', verifyToken, async (req, res) => {
    try {
      const { age, weight, height, goal } = req.body;

      const result = await pool.query(
        'UPDATE users SET age = $1, weight = $2, height = $3, goal = $4 WHERE id = $5 RETURNING id, email, age, weight, height, goal',
        [age, weight, height, goal, req.userId]
      );

      res.json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get profile
  router.get('/profile', verifyToken, async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT id, email, age, weight, height, goal FROM users WHERE id = $1',
        [req.userId]
      );

      res.json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
