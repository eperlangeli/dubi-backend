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

  // Save or update onboarding data
  router.post('/save', verifyToken, async (req, res) => {
    try {
      const {
        name,
        gender,
        age,
        height,
        weight,
        goal,
        target_weight,
        target_body_fat,
        competition_sport,
        competition_date,
        occupation,
        workout_days,
        workout_duration,
        workout_intensity,
        daily_steps,
        sedentary_days,
        diet,
        allergies,
        sport,
        training_time,
        breakfast_pref,
        day_start,
        day_end,
        wearable_provider
      } = req.body;

      const allowedWearables = [
        'apple_health',
        'garmin',
        'whoop',
        'oura_ring',
        'strava',
        'polar',
        'suunto',
        'samsung_health',
        'google_health_connect',
        'none'
      ];

      if (wearable_provider && !allowedWearables.includes(wearable_provider)) {
        return res.status(400).json({ error: 'Invalid wearable provider' });
      }

      const result = await pool.query(
        `
        INSERT INTO user_onboarding (
          user_id,
          name,
          gender,
          age,
          height,
          weight,
          goal,
          target_weight,
          target_body_fat,
          competition_sport,
          competition_date,
          occupation,
          workout_days,
          workout_duration,
          workout_intensity,
          daily_steps,
          sedentary_days,
          diet,
          allergies,
          sport,
          training_time,
          breakfast_pref,
          day_start,
          day_end,
          wearable_provider,
          onboarding_completed,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
          $21, $22, $23, $24, $25, true, CURRENT_TIMESTAMP
        )
        ON CONFLICT (user_id)
        DO UPDATE SET
          name = EXCLUDED.name,
          gender = EXCLUDED.gender,
          age = EXCLUDED.age,
          height = EXCLUDED.height,
          weight = EXCLUDED.weight,
          goal = EXCLUDED.goal,
          target_weight = EXCLUDED.target_weight,
          target_body_fat = EXCLUDED.target_body_fat,
          competition_sport = EXCLUDED.competition_sport,
          competition_date = EXCLUDED.competition_date,
          occupation = EXCLUDED.occupation,
          workout_days = EXCLUDED.workout_days,
          workout_duration = EXCLUDED.workout_duration,
          workout_intensity = EXCLUDED.workout_intensity,
          daily_steps = EXCLUDED.daily_steps,
          sedentary_days = EXCLUDED.sedentary_days,
          diet = EXCLUDED.diet,
          allergies = EXCLUDED.allergies,
          sport = EXCLUDED.sport,
          training_time = EXCLUDED.training_time,
          breakfast_pref = EXCLUDED.breakfast_pref,
          day_start = EXCLUDED.day_start,
          day_end = EXCLUDED.day_end,
          wearable_provider = EXCLUDED.wearable_provider,
          onboarding_completed = true,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *;
        `,
        [
          req.userId,
          name,
          gender,
          age,
          height,
          weight,
          goal,
          target_weight,
          target_body_fat,
          competition_sport,
          competition_date,
          occupation,
          workout_days,
          workout_duration,
          workout_intensity,
          daily_steps,
          sedentary_days,
          diet,
          allergies,
          sport,
          training_time,
          breakfast_pref,
          day_start,
          day_end,
          wearable_provider
        ]
      );

      res.json({
        message: 'Onboarding saved successfully',
        onboarding: result.rows[0]
      });
    } catch (error) {
      console.error('Onboarding save error:', error);
      res.status(500).json({ error: 'Failed to save onboarding data' });
    }
  });

  // Get current user onboarding data
  router.get('/me', verifyToken, async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT * FROM user_onboarding WHERE user_id = $1',
        [req.userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Onboarding data not found' });
      }

      res.json({
        onboarding: result.rows[0]
      });
    } catch (error) {
      console.error('Onboarding fetch error:', error);
      res.status(500).json({ error: 'Failed to fetch onboarding data' });
    }
  });

  return router;
};
