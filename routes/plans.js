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
        calories,
        protein,
        carbs,
        fat,
        meals_count,
        goal,
        plan_json
      } = req.body;

      const result = await pool.query(
        `
        INSERT INTO user_plans (
          user_id,
          calories,
          protein,
          carbs,
          fat,
          meals_count,
          goal,
          plan_json
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *;
        `,
        [
          req.userId,
          calories,
          protein,
          carbs,
          fat,
          meals_count,
          goal,
          plan_json
        ]
      );

      res.json({
        message: 'Plan saved successfully',
        plan: result.rows[0]
      });
    } catch (error) {
      console.error('Plan save error:', error);
      res.status(500).json({ error: 'Failed to save plan' });
    }
  });

  router.get('/latest', verifyToken, async (req, res) => {
    try {
      const result = await pool.query(
        `
        SELECT *
        FROM user_plans
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 1;
        `,
        [req.userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'No plan found' });
      }

      res.json({
        plan: result.rows[0]
      });
    } catch (error) {
      console.error('Plan fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch plan' });
    }
  });

  return router;
};
