const assert = require('assert');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'ingredient-plan-get-test-secret';

const planRoutes = require('../routes/plan');

const timings = ['breakfast', 'lunch', 'snack', 'dinner', 'pre_workout', 'post_workout'];
let nextIngredientId = 1;

const ingredient = (name, category, slots, kcal, protein, carbs, fat, fiber = 1, gi = null) => {
  const id = nextIngredientId++;
  return {
    id,
    name,
    name_en: `${name} EN`,
    category,
    template_slots: slots,
    meal_timing: timings,
    calories_per_100g: kcal,
    protein_g: protein,
    carbs_g: carbs,
    fat_g: fat,
    fiber_g: fiber,
    glycemic_index: gi && gi >= 67 ? 'high' : gi && gi >= 55 ? 'medium' : gi ? 'low' : null,
    gi_numeric: gi,
    source_id: `test-source-${id}`,
    is_active: true,
    compatible_omnivore: true,
    nutritionist_validated: true
  };
};

const ingredients = [
  ingredient('Nasello', 'protein_animal', ['protein'], 82, 18, 0, 1),
  ingredient('Tacchino', 'protein_animal', ['protein'], 135, 29, 0, 1.5),
  ingredient('Uova', 'egg', ['protein'], 143, 13, 1, 10),
  ingredient('Skyr', 'dairy', ['protein'], 62, 11, 4, 0.2, 0, 35),
  ingredient('Riso integrale', 'grain', ['carb'], 360, 7, 76, 3, 4, 50),
  ingredient('Pane di segale', 'grain', ['carb'], 259, 9, 48, 3, 6, 50),
  ingredient('Gallette di riso e miele', 'grain', ['carb'], 390, 7, 84, 1, 1, 78),
  ingredient('Banana', 'fruit', ['fruit', 'carb'], 89, 1, 23, 0.3, 2.6, 62),
  ingredient('Bietola', 'vegetable', ['vegetable'], 19, 1.8, 3.7, 0.2, 1.6, 15),
  ingredient('Rucola', 'vegetable', ['vegetable'], 25, 2.6, 3.7, 0.7, 1.6, 15),
  ingredient('Olio EVO', 'fat', ['fat'], 884, 0, 0, 100)
];

const templates = {
  breakfast: { protein: { required: true }, carb: { required: true }, fruit: { required: false } },
  lunch: { protein: { required: true }, carb: { required: true }, vegetable: { required: true }, fat: { required: false } },
  snack: { fruit: { required: true } },
  dinner: { protein: { required: true }, carb: { required: true }, vegetable: { required: true }, fat: { required: false } },
  pre_workout: { carb: { required: true }, fruit: { required: false } },
  post_workout: { protein: { required: true }, carb: { required: true } }
};

const normalizeSql = (sql) => String(sql).replace(/\s+/g, ' ').trim();
const toKey = (userId, date) => `${userId}:${date}`;

const makePool = (targetDate, options = {}) => {
  const state = {
    dailyPlans: new Map(),
    dailyPlanWrites: 0,
    mealPlanWrites: 0
  };

  return {
    state,
    async query(sql, params = []) {
      const normalized = normalizeSql(sql);

      if (normalized.startsWith('SELECT health_data_consent FROM user_onboarding')) {
        return { rows: [{ health_data_consent: true }] };
      }

      if (normalized.includes('FROM user_onboarding uo JOIN users u')) {
        return {
          rows: [{
            user_id: params[0],
            age: 32,
            weight: 78,
            height: 178,
            goal: 'maintain',
            gender: 'M',
            diet: 'omnivore',
            allergies: '',
            workout_days: options.workoutDays ?? 4,
            workout_intensity: 'moderate',
            sport: 'running',
            sports: ['running'],
            training_time: options.trainingTime ?? null,
            breakfast_pref: 'both',
            health_data_consent: true,
            is_minor: false,
            parental_consent_status: 'not_required'
          }]
        };
      }

      if (normalized.startsWith('SELECT plan_data FROM daily_plans')) {
        const [userId, date] = params;
        const plan = state.dailyPlans.get(toKey(userId, date));
        return { rows: plan ? [{ plan_data: plan }] : [] };
      }

      if (normalized.startsWith('INSERT INTO daily_plans')) {
        const [userId, date, planJson] = params;
        state.dailyPlanWrites += 1;
        state.dailyPlans.set(toKey(userId, date), JSON.parse(planJson));
        return { rows: [] };
      }

      if (normalized.startsWith('INSERT INTO meal_plans')) {
        state.mealPlanWrites += 1;
        return { rows: [] };
      }

      if (normalized.includes('FROM wearable_data')) {
        return { rows: [] };
      }

      if (normalized.includes('FROM training_week_plans')) {
        if (options.noWeekPlan) return { rows: [] };
        return {
          rows: [{
            planned_days: [targetDate],
            source: 'user',
            created_at: new Date().toISOString()
          }]
        };
      }

      if (normalized.includes('FROM training_confirmations')) {
        return { rows: options.confirmation ? [options.confirmation] : [] };
      }

      if (normalized.includes('FROM ingredients')) {
        return { rows: ingredients };
      }

      if (normalized.includes('FROM meal_templates')) {
        return { rows: [{ slots: templates[params[0]] || {} }] };
      }

      throw new Error(`Unexpected query in ingredient-plan GET test: ${normalized}`);
    }
  };
};

const requestJson = async (baseUrl, path, token) => {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const json = await response.json();
  return { status: response.status, json };
};

const planSignature = (plan) => JSON.stringify({
  date: plan.date,
  meals: (plan.meals || []).map((meal) => ({
    mealType: meal.mealType,
    ingredients: (meal.ingredients || []).map((item) => ({
      name: item.name,
      portionG: item.portionG,
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
      source_id: item.source_id || null
    }))
  }))
});

const main = async () => {
  const targetDate = '2026-07-16';
  const pool = makePool(targetDate, { trainingTime: 'pomeriggio' });
  const app = express();
  app.use(express.json());
  app.use('/plan', planRoutes(pool));

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const token = jwt.sign({ userId: 42 }, process.env.JWT_SECRET);

    const noGenerate = await requestJson(baseUrl, `/plan/ingredient-plan/${targetDate}?generateIfMissing=false`, token);
    assert.strictEqual(noGenerate.status, 404);

    const first = await requestJson(baseUrl, `/plan/ingredient-plan/${targetDate}`, token);
    assert.strictEqual(first.status, 200);
    assert.strictEqual(first.json.date, targetDate);
    assert.strictEqual(pool.state.dailyPlanWrites, 1);
    assert(pool.state.dailyPlans.has(toKey(42, targetDate)));

    const mealTypes = first.json.meals.map((meal) => meal.mealType);
    assert(mealTypes.includes('pre_workout'), 'future planned training day should include pre_workout');
    assert(mealTypes.includes('post_workout'), 'future planned training day should include post_workout');
    assert.strictEqual(first.json.has_training, true);
    assert.strictEqual(first.json.training_resolved, false);
    assert.strictEqual(first.json.training_defaulted, true);
    assert.strictEqual(first.json.training_time_slot, 'afternoon');
    assert.strictEqual(first.json.workoutNutrition?.active, true);
    assert.strictEqual(first.json.workoutNutrition?.time_slot, 'afternoon');
    assert.strictEqual(first.json.workoutNutrition?.resolved, false);
    assert.strictEqual(first.json.workoutNutrition?.defaulted, true);

    const second = await requestJson(baseUrl, `/plan/ingredient-plan/${targetDate}`, token);
    assert.strictEqual(second.status, 200);
    assert.strictEqual(pool.state.dailyPlanWrites, 1, 'second GET should use saved plan, not regenerate');
    assert.strictEqual(planSignature(second.json), planSignature(first.json));

    console.log('ingredient-plan GET generate-if-missing tests passed');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }

  const confirmedPool = makePool(targetDate, {
    trainingTime: 'afternoon',
    confirmation: {
      planned: true,
      status: 'confirmed_yes',
      training_time_slot: 'evening',
      training_sport: 'running',
      answered_at: new Date().toISOString(),
      detected_strain: null,
      detected_duration_min: null,
      detected_active_kcal: null
    }
  });
  const confirmedApp = express();
  confirmedApp.use(express.json());
  confirmedApp.use('/plan', planRoutes(confirmedPool));

  const confirmedServer = await new Promise((resolve) => {
    const instance = confirmedApp.listen(0, () => resolve(instance));
  });

  try {
    const baseUrl = `http://127.0.0.1:${confirmedServer.address().port}`;
    const token = jwt.sign({ userId: 42 }, process.env.JWT_SECRET);
    const confirmed = await requestJson(baseUrl, `/plan/ingredient-plan/${targetDate}`, token);

    assert.strictEqual(confirmed.status, 200);
    assert.strictEqual(confirmed.json.has_training, true);
    assert.strictEqual(confirmed.json.training_resolved, true);
    assert.strictEqual(confirmed.json.training_defaulted, false);
    assert.strictEqual(confirmed.json.training_time_slot, 'evening');
    assert.strictEqual(confirmed.json.workoutNutrition?.time_slot, 'evening');
    assert.strictEqual(confirmed.json.workoutNutrition?.resolved, true);
    assert.strictEqual(confirmed.json.workoutNutrition?.defaulted, false);
  } finally {
    await new Promise((resolve, reject) => confirmedServer.close((error) => (error ? reject(error) : resolve())));
  }

  const inferredPool = makePool(targetDate, {
    noWeekPlan: true,
    workoutDays: 4,
    trainingTime: 'pomeriggio'
  });
  const inferredApp = express();
  inferredApp.use(express.json());
  inferredApp.use('/plan', planRoutes(inferredPool));

  const inferredServer = await new Promise((resolve) => {
    const instance = inferredApp.listen(0, () => resolve(instance));
  });

  try {
    const baseUrl = `http://127.0.0.1:${inferredServer.address().port}`;
    const token = jwt.sign({ userId: 42 }, process.env.JWT_SECRET);
    const inferred = await requestJson(baseUrl, `/plan/ingredient-plan/${targetDate}`, token);
    const inferredMealTypes = inferred.json.meals.map((meal) => meal.mealType);

    assert.strictEqual(inferred.status, 200);
    assert(inferredMealTypes.includes('pre_workout'), 'inferred training day should include pre_workout');
    assert(inferredMealTypes.includes('post_workout'), 'inferred training day should include post_workout');
    assert.strictEqual(inferred.json.has_training, true);
    assert.strictEqual(inferred.json.training_resolved, false);
    assert.strictEqual(inferred.json.training_defaulted, true);
    assert.strictEqual(inferred.json.training_time_slot, 'afternoon');
    assert.strictEqual(inferred.json.dailyAdaptation?.signals?.training?.inferredFromWorkoutDays, true);
  } finally {
    await new Promise((resolve, reject) => inferredServer.close((error) => (error ? reject(error) : resolve())));
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
