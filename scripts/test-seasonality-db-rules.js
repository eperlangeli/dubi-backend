const assert = require('assert');
const { generateDayPlan } = require('../services/mealEngine');

const timings = ['breakfast', 'lunch', 'snack', 'dinner'];
let nextId = 1;

const rule = (months) => [{ country: 'IT', regions: ['all'], months }];

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
    source_id: `seasonality-db-test-${id}`,
    is_active: true,
    compatible_omnivore: true,
    compatible_pescatarian: true,
    compatible_vegetarian: extra.compatible_vegetarian ?? ['dairy', 'egg', 'protein_plant', 'legume', 'grain', 'vegetable', 'fruit', 'fat', 'nut_seed', 'dairy_alt'].includes(category),
    compatible_vegan: extra.compatible_vegan ?? ['protein_plant', 'legume', 'grain', 'vegetable', 'fruit', 'fat', 'nut_seed', 'dairy_alt'].includes(category),
    nutritionist_validated: true,
    seasonality_rules: extra.seasonality_rules || []
  };
};

const ingredients = [
  ingredient('Petto di pollo', 'protein_animal', ['protein'], 165, 31, 0, 3.6),
  ingredient('Skyr naturale', 'dairy', ['protein'], 65, 11, 4, 0.2, 0, { compatible_vegetarian: true }),
  ingredient('Riso integrale', 'grain', ['carb'], 360, 7, 76, 3, 4),
  ingredient('Pane integrale', 'grain', ['carb'], 250, 9, 48, 3, 6),
  ingredient('Frutto DB luglio', 'fruit', ['fruit'], 60, 1, 14, 0.3, 2, { seasonality_rules: rule([7]) }),
  ingredient('Verdura DB luglio', 'vegetable', ['vegetable'], 25, 2, 4, 0.2, 2, { seasonality_rules: rule([7]) }),
  ingredient('Verdura DB inverno', 'vegetable', ['vegetable'], 25, 2, 4, 0.2, 2, { seasonality_rules: rule([1]) }),
  ingredient('Olio EVO', 'fat', ['fat'], 884, 0, 0, 100)
];

const templates = {
  breakfast: { protein: { required: true }, carb: { required: true }, fruit: { required: false } },
  lunch: { protein: { required: true }, carb: { required: true }, vegetable: { required: true }, fat: { required: true } },
  snack: { fruit: { required: true } },
  dinner: { protein: { required: true }, carb: { required: true }, vegetable: { required: true }, fat: { required: true } }
};

let ingredientQueryChecked = false;

const pool = {
  async query(sql, params = []) {
    const normalized = String(sql).replace(/\s+/g, ' ').trim();
    if (normalized.includes('FROM ingredients')) {
      assert(
        normalized.includes('ingredient_seasonality'),
        'eligible ingredient query should join ingredient_seasonality'
      );
      ingredientQueryChecked = true;
      return { rows: ingredients };
    }
    if (normalized.includes('FROM meal_templates')) return { rows: [{ slots: templates[params[0]] || {} }] };
    throw new Error(`Unexpected query in seasonality DB rules test: ${normalized}`);
  }
};

const main = async () => {
  const plan = await generateDayPlan(pool, {
    userId: 1919,
    weightKg: 78,
    dietaryStyle: 'omnivore',
    dailyCalorieTarget: 2300,
    dailyProteinTarget: 145,
    dailyCarbTarget: 280,
    dailyFatTarget: 75,
    breakfastPref: 'both',
    seasonalityMode: 'strict',
    country: 'IT',
    region: 'all'
  }, '2026-07-22');

  assert.strictEqual(ingredientQueryChecked, true);
  assert.strictEqual(plan.seasonality_filter.mode, 'strict');
  assert(plan.seasonality_filter.excluded.some((item) => item.name === 'Verdura DB inverno'), 'out-of-season DB produce should be excluded');

  const allNames = plan.meals.flatMap((meal) => meal.ingredients || []).map((item) => item.name);
  assert(!allNames.includes('Verdura DB inverno'), 'out-of-season DB produce must not be generated');
  assert(allNames.includes('Verdura DB luglio'), 'in-season DB produce should remain eligible');

  console.log('seasonality DB rules tests passed');
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
