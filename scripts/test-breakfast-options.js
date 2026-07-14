const assert = require('assert');
const { generateDayPlan, generateBreakfastOptions } = require('../services/mealEngine');

const timings = ['breakfast', 'lunch', 'snack', 'dinner', 'pre_workout', 'post_workout'];
let nextId = 1;

const ingredient = (name, nameEn, category, slots, kcal, protein, carbs, fat, fiber = 1, gi = null) => {
  const id = nextId++;
  return {
    id,
    name,
    name_en: nameEn,
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
  ingredient('Skyr naturale', 'Plain skyr', 'dairy', ['protein'], 62, 11, 4, 0.2, 0, 35),
  ingredient('Uova', 'Eggs', 'egg', ['protein'], 143, 13, 1, 10),
  ingredient('Tacchino', 'Turkey', 'protein_animal', ['protein'], 135, 29, 0, 1.5),
  ingredient('Avena', 'Oats', 'grain', ['carb'], 389, 17, 66, 7, 10, 50),
  ingredient('Pane di segale', 'Rye bread', 'grain', ['carb'], 259, 9, 48, 3, 6, 50),
  ingredient('Banana', 'Banana', 'fruit', ['fruit', 'carb'], 89, 1, 23, 0.3, 2.6, 62),
  ingredient('Mirtilli', 'Blueberries', 'fruit', ['fruit'], 57, 0.7, 14, 0.3, 2.4, 53),
  ingredient('Broccoli', 'Broccoli', 'vegetable', ['vegetable'], 34, 2.8, 7, 0.4, 3, 15),
  ingredient('Riso integrale', 'Brown rice', 'grain', ['carb'], 360, 7, 76, 3, 4, 50),
  ingredient('Olio EVO', 'Olive oil', 'fat', ['fat'], 884, 0, 0, 100)
];

const templates = {
  breakfast: { protein: { required: true }, carb: { required: true }, fruit: { required: false } },
  lunch: { protein: { required: true }, carb: { required: true }, vegetable: { required: true }, fat: { required: false } },
  snack: { fruit: { required: true } },
  dinner: { protein: { required: true }, carb: { required: true }, vegetable: { required: true }, fat: { required: false } }
};

const pool = {
  async query(sql, params = []) {
    if (String(sql).includes('FROM ingredients')) return { rows: ingredients };
    if (String(sql).includes('FROM meal_templates')) return { rows: [{ slots: templates[params[0]] || {} }] };
    throw new Error(`Unexpected query in breakfast options test: ${sql}`);
  }
};

const signatureFromOption = (option) => option.ingredients
  .map((item) => [
    item.name,
    item.name_en,
    item.portionG,
    item.calories,
    item.protein,
    item.carbs,
    item.fat,
    item.source_id
  ].join(':'))
  .join('|');

const signatureFromMeal = (meal) => meal.ingredients
  .map((item) => [
    item.name,
    item.name_en || null,
    item.portionG,
    item.calories,
    item.protein,
    item.carbs,
    item.fat,
    item.source_id || null
  ].join(':'))
  .join('|');

const main = async () => {
  const date = '2026-07-14';
  const profile = {
    userId: 101,
    weightKg: 76,
    dietaryStyle: 'omnivore',
    dailyCalorieTarget: 2300,
    dailyProteinTarget: 150,
    dailyCarbTarget: 280,
    dailyFatTarget: 75,
    breakfastPref: 'variable'
  };

  const options = await generateBreakfastOptions(pool, profile, date);
  const sweetPlan = await generateDayPlan(pool, { ...profile, breakfastChoice: 'dolce' }, date);
  const savoryPlan = await generateDayPlan(pool, { ...profile, breakfastChoice: 'salata' }, date);
  const sweetMeal = sweetPlan.meals.find((meal) => meal.mealType === 'breakfast');
  const savoryMeal = savoryPlan.meals.find((meal) => meal.mealType === 'breakfast');

  assert.strictEqual(options.date, date);
  assert.strictEqual(options.sweet.style, 'sweet');
  assert.strictEqual(options.savory.style, 'savory');
  assert.strictEqual(signatureFromOption(options.sweet), signatureFromMeal(sweetMeal));
  assert.strictEqual(signatureFromOption(options.savory), signatureFromMeal(savoryMeal));
  assert(options.sweet.ingredients.every((item) => Object.prototype.hasOwnProperty.call(item, 'name_en')));
  assert(options.savory.ingredients.every((item) => Object.prototype.hasOwnProperty.call(item, 'name_en')));

  console.log('breakfast options determinism tests passed');
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
