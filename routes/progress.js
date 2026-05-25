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
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

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
      UPDATE user_progress
      SET
        weight = COALESCE($1, weight),
        calories_consumed = COALESCE($2, calories_consumed),
        meals_completed = COALESCE($3, meals_completed),
        meals_total = COALESCE($4, meals_total),
        adherence_percent = COALESCE($5, adherence_percent),
        note = COALESCE($6, note)
      WHERE id = $7 AND user_id = $8
      RETURNING *;
      `,
      [
        weight,
        calories_consumed,
        meals_completed,
        meals_total,
        adherence_percent,
        note,
        id,
        req.userId
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Progress entry not found' });
    }

    res.json({
      message: 'Progress updated successfully',
      progress: result.rows[0]
    });
  } catch (error) {
    console.error('Progress update error:', error);
    res.status(500).json({ error: 'Failed to update progress' });
  }
});

router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      DELETE FROM user_progress
      WHERE id = $1 AND user_id = $2
      RETURNING *;
      `,
      [id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Progress entry not found' });
    }

    res.json({
      message: 'Progress deleted successfully',
      progress: result.rows[0]
    });
  } catch (error) {
    console.error('Progress delete error:', error);
    res.status(500).json({ error: 'Failed to delete progress' });
  }
});
  return router;
};
