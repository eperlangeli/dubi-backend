const assert = require('assert');
const { generateDayPlan } = require('../services/mealEngine');

const timings = ['breakfast', 'lunch', 'snack', 'dinner', 'pre_workout', 'post_workout'];
let nextId = 1;

const ingredient = (name, category, slots, kcal, protein, carbs, fat, fiber = 1, extra = {}) => {
  const id = nextId++;
  return {
    id,
    name,
    name_en: `${name} EN`,
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
    source_id: `plate-test-${id}`,
    is_active: true,
    compatible_omnivore: true,
    compatible_pescatarian: true,
    compatible_vegetarian: extra.compatible_vegetarian ?? false,
    compatible_vegan: extra.compatible_vegan ?? false,
    nutritionist_validated: true
  };
};

const ingredients = [
  ingredient('Nasello', 'protein_animal', ['protein'], 82, 18, 0, 1),
  ingredient('Pollo', 'protein_animal', ['protein'], 165, 31, 0, 3.6),
  ingredient('Salmone', 'protein_animal', ['protein'], 208, 20, 0, 13),
  ingredient('Tofu', 'protein_plant', ['protein'], 144, 15, 3, 8, 1, { compatible_vegetarian: true, compatible_vegan: true }),
  ingredient('Yogurt greco', 'dairy', ['protein', 'fat'], 97, 9, 4, 5, 0, { compatible_vegetarian: true }),

  ingredient('Riso integrale', 'grain', ['carb'], 360, 7, 76, 3, 4),
  ingredient('Pasta integrale', 'grain', ['carb'], 350, 13, 68, 2.5, 8),
  ingredient('Pane di segale', 'grain', ['carb'], 259, 9, 48, 3, 6),
  ingredient('Fagioli cotti', 'legume', ['carb', 'protein'], 110, 8, 18, 0.5, 6, { compatible_vegetarian: true, compatible_vegan: true }),
  ingredient('Avena', 'grain', ['carb'], 389, 17, 66, 7, 10, { meal_timing: ['breakfast', 'lunch', 'dinner'] }),

  ingredient('Banana', 'fruit', ['fruit', 'carb'], 89, 1, 23, 0.3, 2.6),
  ingredient('Bietola', 'vegetable', ['vegetable'], 19, 1.8, 3.7, 0.2, 1.6),
  ingredient('Rucola', 'vegetable', ['vegetable'], 25, 2.6, 3.7, 0.7, 1.6),
  ingredient('Zucchine', 'vegetable', ['vegetable'], 17, 1.2, 3.1, 0.3, 1.1),

  ingredient('Olio EVO', 'fat', ['fat'], 884, 0, 0, 100),
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
    fruit: { required: false },
    vegetable: { required: true, count: 3 },
    fat: { required: true, count: 2 }
  },
  snack: {
    fruit: { required: true }
  },
  dinner: {
    protein: { required: true, count: 2 },
    carb: { required: true, count: 2 },
    fruit: { required: false },
    vegetable: { required: true, count: 3 },
    fat: { required: true, count: 2 }
  }
};

const pool = {
  async query(sql, params = []) {
    if (String(sql).includes('FROM ingredients')) return { rows: ingredients };
    if (String(sql).includes('FROM meal_templates')) return { rows: [{ slots: templates[params[0]] || {} }] };
    throw new Error(`Unexpected query in plate structure test: ${sql}`);
  }
};

const mainMealCounts = (meal) => ({
  protein: meal.ingredients.filter((item) => item.slot === 'protein').length,
  carb: meal.ingredients.filter((item) => item.slot === 'carb' && item.category !== 'fruit').length,
  vegetables: meal.ingredients.filter((item) => item.slot === 'vegetable' || item.category === 'vegetable').length,
  fat: meal.ingredients.filter((item) => item.slot === 'fat' || ['fat', 'nut_seed'].includes(item.category)).length
});

const main = async () => {
  const plan = await generateDayPlan(pool, {
    userId: 909,
    weightKg: 78,
    dietaryStyle: 'omnivore',
    dailyCalorieTarget: 2400,
    dailyProteinTarget: 150,
    dailyCarbTarget: 290,
    dailyFatTarget: 75,
    breakfastPref: 'both'
  }, '2026-07-21');

  assert.strictEqual(plan.plateStructureAudit.version, 'plate-structure-v1');
  assert.strictEqual(plan.plateStructureAudit.passed, true);

  for (const mealType of ['lunch', 'dinner']) {
    const meal = plan.meals.find((entry) => entry.mealType === mealType);
    assert(meal, `${mealType} should exist`);
    assert.strictEqual(meal.plateStructure.passed, true, `${mealType} plate audit should pass`);

    const counts = mainMealCounts(meal);
    assert.strictEqual(counts.protein, 1, `${mealType} should keep exactly one main protein`);
    assert.strictEqual(counts.carb, 1, `${mealType} should keep exactly one main carb`);
    assert(counts.vegetables >= 1 && counts.vegetables <= 2, `${mealType} should keep 1-2 vegetables`);
    assert.strictEqual(counts.fat, 1, `${mealType} should keep exactly one fat`);

    const names = meal.ingredients.map((item) => item.name.toLowerCase()).join(' ');
    assert(!/avena|banana/.test(names), `${mealType} should not contain breakfast/sweet fruit items`);
    assert(!(/nasello|salmone/.test(names) && /yogurt/.test(names)), `${mealType} should not pair fish and dairy`);
    assert(meal.ingredients.some((item) => item.slot === 'protein' && item.category === 'protein_animal'), `${mealType} omnivore protein should be animal`);
  }

  console.log('plate structure tests passed');
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
