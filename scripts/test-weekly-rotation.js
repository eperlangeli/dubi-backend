const assert = require('assert');
const { generateDayPlan, buildWeeklyMealContext } = require('../services/mealEngine');

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
    source_id: `weekly-rotation-test-${id}`,
    is_active: true,
    compatible_omnivore: true,
    compatible_pescatarian: true,
    compatible_vegetarian: extra.compatible_vegetarian ?? ['dairy', 'egg', 'protein_plant', 'legume', 'grain', 'vegetable', 'fruit', 'fat', 'nut_seed', 'dairy_alt'].includes(category),
    compatible_vegan: extra.compatible_vegan ?? ['protein_plant', 'legume', 'grain', 'vegetable', 'fruit', 'fat', 'nut_seed', 'dairy_alt'].includes(category),
    nutritionist_validated: true
  };
};

const ingredients = [
  ingredient('Manzo magro', 'protein_animal', ['protein'], 170, 29, 0, 5),
  ingredient('Petto di pollo', 'protein_animal', ['protein'], 165, 31, 0, 3.6),
  ingredient('Sardine', 'protein_animal', ['protein'], 208, 25, 0, 11),
  ingredient('Uova', 'egg', ['protein'], 143, 13, 1, 10, 0, { compatible_vegetarian: true }),
  ingredient('Skyr naturale', 'dairy', ['protein'], 65, 11, 4, 0.2, 0, { compatible_vegetarian: true }),

  ingredient('Pasta integrale', 'grain', ['carb'], 350, 13, 68, 2.5, 8),
  ingredient('Riso integrale', 'grain', ['carb'], 360, 7, 76, 3, 4),
  ingredient('Pane integrale', 'grain', ['carb'], 250, 9, 48, 3, 6),
  ingredient('Fiocchi di avena', 'grain', ['carb'], 389, 17, 66, 7, 10, { meal_timing: ['breakfast', 'snack'] }),

  ingredient('Banana', 'fruit', ['fruit', 'carb'], 89, 1, 23, 0.3, 2.6),
  ingredient('Mirtilli', 'fruit', ['fruit'], 57, 0.7, 14, 0.3, 2.4),
  ingredient('Zucchine', 'vegetable', ['vegetable'], 17, 1.2, 3.1, 0.3, 1.1),
  ingredient('Bietola', 'vegetable', ['vegetable'], 19, 1.8, 3.7, 0.2, 1.6),
  ingredient('Rucola', 'vegetable', ['vegetable'], 25, 2.6, 3.7, 0.7, 1.6),
  ingredient('Olio EVO', 'fat', ['fat'], 884, 0, 0, 100)
];

const templates = {
  breakfast: { protein: { required: true }, carb: { required: true }, fruit: { required: false } },
  lunch: { protein: { required: true }, carb: { required: true }, vegetable: { required: true }, fat: { required: true } },
  snack: { fruit: { required: true } },
  dinner: { protein: { required: true }, carb: { required: true }, vegetable: { required: true }, fat: { required: true } }
};

const historicalPlan = (date) => ({
  plan_date: date,
  plan_data: {
    date,
    meals: [
      {
        mealType: 'lunch',
        ingredients: [
          { name: 'Manzo magro', category: 'protein_animal', slot: 'protein', protein: 35 },
          { name: 'Pasta integrale', category: 'grain', slot: 'carb', carbs: 70 },
          { name: 'Zucchine', category: 'vegetable', slot: 'vegetable' },
          { name: 'Olio EVO', category: 'fat', slot: 'fat' }
        ]
      }
    ]
  }
});

const pool = {
  async query(sql, params = []) {
    if (String(sql).includes('FROM ingredients')) return { rows: ingredients };
    if (String(sql).includes('FROM meal_templates')) return { rows: [{ slots: templates[params[0]] || {} }] };
    throw new Error(`Unexpected query in weekly rotation test: ${sql}`);
  }
};

const namesForMeal = (meal) => meal.ingredients.map((item) => item.name.toLowerCase()).join(' ');

const main = async () => {
  const weeklyPlanContext = buildWeeklyMealContext([
    historicalPlan('2026-07-20'),
    historicalPlan('2026-07-21')
  ], {
    weekStart: '2026-07-20',
    weekEnd: '2026-07-26'
  });

  const plan = await generateDayPlan(pool, {
    userId: 222,
    weightKg: 82,
    dietaryStyle: 'omnivore',
    dailyCalorieTarget: 2400,
    dailyProteinTarget: 150,
    dailyCarbTarget: 290,
    dailyFatTarget: 75,
    breakfastPref: 'both',
    weeklyPlanContext
  }, '2026-07-22');

  assert(plan.weeklyRotationAudit, 'weeklyRotationAudit should be present');
  assert.strictEqual(plan.weeklyRotationAudit.checks.redMeatMax, true);
  assert.strictEqual(plan.weeklyRotationAudit.checks.carbRepeatMax, true);

  for (const mealType of ['lunch', 'dinner']) {
    const meal = plan.meals.find((entry) => entry.mealType === mealType);
    assert(meal, `${mealType} should exist`);
    const names = namesForMeal(meal);
    assert(!names.includes('manzo'), `${mealType} should avoid red meat after weekly red-meat cap`);
  }

  const lunch = plan.meals.find((entry) => entry.mealType === 'lunch');
  assert(!namesForMeal(lunch).includes('pasta'), 'first main meal after two consecutive pasta meals should rotate away from pasta');

  console.log('weekly rotation tests passed');
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
