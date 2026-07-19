const assert = require('assert');
const { generateDayPlan } = require('../services/mealEngine');

const timings = ['breakfast', 'lunch', 'snack', 'dinner', 'pre_workout', 'post_workout'];
let nextId = 1;

const ingredient = (name, category, slots, kcal, protein, carbs, fat, fiber = 1, extra = {}) => {
  const id = nextId++;
  return {
    id,
    name,
    name_en: extra.name_en || `${name} EN`,
    category,
    subcategory: extra.subcategory || null,
    template_slots: slots,
    meal_timing: extra.meal_timing || timings,
    calories_per_100g: kcal,
    protein_g: protein,
    carbs_g: carbs,
    fat_g: fat,
    fiber_g: fiber,
    glycemic_index: extra.glycemic_index || 'medium',
    gi_numeric: extra.gi_numeric ?? 50,
    source_id: `meal-grammar-test-${id}`,
    is_active: true,
    compatible_omnivore: true,
    compatible_pescatarian: true,
    compatible_vegetarian: extra.compatible_vegetarian ?? ['dairy', 'egg', 'protein_plant', 'legume', 'grain', 'vegetable', 'fruit', 'fat', 'nut_seed', 'dairy_alt'].includes(category),
    compatible_vegan: extra.compatible_vegan ?? ['protein_plant', 'legume', 'grain', 'vegetable', 'fruit', 'fat', 'nut_seed', 'dairy_alt'].includes(category),
    nutritionist_validated: true
  };
};

const ingredients = [
  ingredient('Petto di pollo', 'protein_animal', ['protein'], 165, 31, 0, 3.6),
  ingredient('Merluzzo', 'protein_animal', ['protein'], 82, 18, 0, 1),
  ingredient('Salmone affumicato', 'protein_animal', ['protein'], 180, 22, 0, 10),
  ingredient('Prosciutto cotto', 'protein_animal', ['protein'], 145, 20, 1, 7, 0, { subcategory: 'deli_meat' }),
  ingredient('Bresaola', 'protein_animal', ['protein'], 151, 32, 0, 2, 0, { subcategory: 'cured_meat', meal_timing: ['breakfast', 'snack'] }),
  ingredient('Skyr naturale', 'dairy', ['protein'], 65, 11, 4, 0.2, 0, { compatible_vegetarian: true }),
  ingredient('Yogurt greco naturale', 'dairy', ['protein'], 97, 9, 4, 5, 0, { compatible_vegetarian: true }),
  ingredient('Uova', 'egg', ['protein'], 143, 13, 1, 10, 0, { compatible_vegetarian: true }),
  ingredient('Tofu', 'protein_plant', ['protein'], 144, 15, 3, 8, 1, { compatible_vegetarian: true, compatible_vegan: true }),

  ingredient('Pasta integrale', 'grain', ['carb'], 350, 13, 68, 2.5, 8),
  ingredient('Riso basmati', 'grain', ['carb'], 356, 7, 78, 0.8, 1),
  ingredient('Pane integrale', 'grain', ['carb'], 250, 9, 48, 3, 6),
  ingredient('Fiocchi di avena', 'grain', ['carb'], 389, 17, 66, 7, 10, { meal_timing: ['breakfast', 'snack'] }),
  ingredient('Gallette di riso', 'grain', ['carb'], 380, 8, 82, 3, 3, { gi_numeric: 78, glycemic_index: 'high', meal_timing: ['pre_workout', 'snack'] }),

  ingredient('Banana', 'fruit', ['fruit', 'carb'], 89, 1, 23, 0.3, 2.6, { gi_numeric: 62, glycemic_index: 'medium' }),
  ingredient('Mirtilli', 'fruit', ['fruit'], 57, 0.7, 14, 0.3, 2.4, { meal_timing: ['breakfast', 'snack', 'post_workout'] }),
  ingredient('Bietola', 'vegetable', ['vegetable'], 19, 1.8, 3.7, 0.2, 1.6),
  ingredient('Zucchine', 'vegetable', ['vegetable'], 17, 1.2, 3.1, 0.3, 1.1),
  ingredient('Broccoli', 'vegetable', ['vegetable'], 34, 2.8, 7, 0.4, 2.6),

  ingredient('Olio EVO', 'fat', ['fat'], 884, 0, 0, 100),
  ingredient('Burro', 'fat', ['fat'], 717, 1, 0, 81),
  ingredient('Noci', 'nut_seed', ['fat'], 654, 15, 14, 65, 7)
];

const templates = {
  breakfast: {
    protein: { required: true },
    carb: { required: true },
    fruit: { required: false }
  },
  lunch: {
    protein: { required: true, count: 2 },
    carb: { required: true, count: 2 },
    vegetable: { required: true, count: 2 },
    fat: { required: true, count: 2 }
  },
  dinner: {
    protein: { required: true, count: 2 },
    carb: { required: true, count: 2 },
    vegetable: { required: true, count: 2 },
    fat: { required: true, count: 2 }
  },
  snack: {
    fruit: { required: true }
  },
  pre_workout: {
    carb: { required: true },
    protein: { required: true },
    fat: { required: true }
  },
  post_workout: {
    protein: { required: true },
    carb: { required: true }
  }
};

const pool = {
  async query(sql, params = []) {
    if (String(sql).includes('FROM ingredients')) return { rows: ingredients };
    if (String(sql).includes('FROM meal_templates')) return { rows: [{ slots: templates[params[0]] || {} }] };
    throw new Error(`Unexpected query in meal grammar test: ${sql}`);
  }
};

const namesFor = (meal) => meal.ingredients.map((item) => item.name.toLowerCase()).join(' ');

const main = async () => {
  const plan = await generateDayPlan(pool, {
    userId: 1717,
    weightKg: 82,
    dietaryStyle: 'omnivore',
    dailyCalorieTarget: 2600,
    dailyProteinTarget: 155,
    dailyCarbTarget: 330,
    dailyFatTarget: 80,
    breakfastPref: 'sweet',
    workoutDays: 4,
    trainingTime: 'afternoon'
  }, '2026-07-22');

  assert.strictEqual(plan.mealGrammarAudit.version, 'meal-grammar-v1');
  assert.strictEqual(plan.mealGrammarAudit.passed, true, JSON.stringify(plan.mealGrammarAudit, null, 2));
  assert.strictEqual(plan.mealAssemblyAudit.passed, true, JSON.stringify(plan.mealAssemblyAudit, null, 2));

  const breakfast = plan.meals.find((meal) => meal.mealType === 'breakfast');
  assert(breakfast.ingredients.some((item) => item.slot === 'protein' && /skyr|yogurt|uova|ricotta|fiocchi/.test(item.name.toLowerCase())), 'sweet breakfast should have a breakfast-compatible protein');
  assert(!/pollo|prosciutto|bresaola|salmone affumicato/.test(namesFor(breakfast)), 'sweet breakfast must not use meat, cured meat or smoked salmon');
  assert(breakfast.assembly?.type, 'breakfast should expose assembly metadata');

  const preWorkout = plan.meals.find((meal) => meal.mealType === 'pre_workout');
  assert(preWorkout, 'training day should include pre_workout');
  assert(preWorkout.ingredients.some((item) => ['grain', 'fruit'].includes(item.category)), 'pre_workout should include an easy carb');
  assert(!preWorkout.ingredients.some((item) => item.slot === 'protein'), 'pre_workout should not force protein in the near-workout snack');
  assert(!preWorkout.ingredients.some((item) => item.category === 'fat' || item.category === 'nut_seed'), 'pre_workout should stay low fat');

  const postWorkout = plan.meals.find((meal) => meal.mealType === 'post_workout');
  assert(postWorkout, 'training day should include post_workout');
  assert(postWorkout.ingredients.some((item) => item.slot === 'protein'), 'post_workout should include protein');
  assert(postWorkout.ingredients.some((item) => ['carb', 'fruit'].includes(item.slot)), 'post_workout should include carbs');

  for (const mealType of ['lunch', 'dinner']) {
    const meal = plan.meals.find((entry) => entry.mealType === mealType);
    assert(meal, `${mealType} should exist`);
    assert(!/prosciutto|salmone affumicato|burro/.test(namesFor(meal)), `${mealType} should not include processed meats, smoked fish or butter`);
    assert(meal.assembly?.title?.it, `${mealType} should expose a usable plate title`);
  }

  console.log('meal grammar tests passed');
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
