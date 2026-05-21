const express = require('express');

// Formule scientifiche DUBI
const calculateBMR = (weight, height, age, sex = 'male') => {
  // Mifflin-St Jeor formula (clinical standard)
  if (sex === 'male') {
    return 10 * weight + 6.25 * height - 5 * age + 5;
  } else {
    return 10 * weight + 6.25 * height - 5 * age - 161;
  }
};

const calculateTDEE = (bmr, activityKcal = 500) => {
  // Total Daily Energy Expenditure
  return Math.round(bmr + activityKcal);
};

const calculateMacros = (tdee, goal) => {
  let calories = tdee;
  let protein, carbs, fat;

  switch (goal) {
    case 'fat_loss':
      // 20% deficit, high protein (35% calories)
      calories = Math.round(tdee * 0.8);
      protein = Math.round((calories * 0.35) / 4);
      fat = Math.round((calories * 0.25) / 9);
      carbs = Math.round((calories - protein * 4 - fat * 9) / 4);
      break;

    case 'muscle_gain':
      // 15% surplus, high protein (30% calories)
      calories = Math.round(tdee * 1.15);
      protein = Math.round((calories * 0.30) / 4);
      fat = Math.round((calories * 0.30) / 9);
      carbs = Math.round((calories - protein * 4 - fat * 9) / 4);
      break;

    case 'cut':
      // 15% deficit, very high protein (40% calories)
      calories = Math.round(tdee * 0.85);
      protein = Math.round((calories * 0.40) / 4);
      fat = Math.round((calories * 0.25) / 9);
      carbs = Math.round((calories - protein * 4 - fat * 9) / 4);
      break;

    case 'maintain':
    default:
      // Maintenance, balanced (25% protein, 30% fat, rest carbs)
      protein = Math.round((calories * 0.25) / 4);
      fat = Math.round((calories * 0.30) / 9);
      carbs = Math.round((calories - protein * 4 - fat * 9) / 4);
      break;
  }

  return { calories, protein, carbs, fat };
};

module.exports = (pool) => {
  const router = express.Router();
  const authModule = require('./auth')(pool);
  const { verifyToken } = authModule;

  // Generate plan
  router.post('/generate', verifyToken, async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT weight, height, age, goal FROM users WHERE id = $1',
        [req.userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const user = result.rows[0];
      
      // Calculate
      const bmr = calculateBMR(user.weight, user.height, user.age, 'male');
      const tdee = calculateTDEE(bmr, 500);
      const macros = calculateMacros(tdee, user.goal);

      // Save to DB
      const planResult = await pool.query(
        'INSERT INTO meal_plans (user_id, calories, protein, carbs, fat) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [req.userId, macros.calories, macros.protein, macros.carbs, macros.fat]
      );

      res.json({
        plan: planResult.rows[0],
        macros: macros,
        calculations: {
          bmr: Math.round(bmr),
          tdee: tdee,
          goal: user.goal
        }
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get current plan
  router.get('/current', verifyToken, async (req, res) => {
    try {
      const result = await pool.query(
        'SELECT * FROM meal_plans WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
        [req.userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'No plan found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
