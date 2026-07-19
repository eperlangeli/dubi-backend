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
  ingredient('Petto di tacchino', 'protein_animal', ['protein'], 135, 29, 0, 1.5),
  ingredient('Salmone', 'protein_animal', ['protein'], 208, 25, 0, 11),
  ingredient('Sardine', 'protein_animal', ['protein'], 208, 25, 0, 11),
  ingredient('Merluzzo', 'protein_animal', ['protein'], 82, 18, 0, 1),
  ingredient('Nasello', 'protein_animal', ['protein'], 82, 18, 0, 1),
  ingredient('Uova', 'egg', ['protein'], 143, 13, 1, 10, 0, { compatible_vegetarian: true }),
  ingredient('Tofu', 'protein_plant', ['protein'], 120, 13, 2, 7, 2, { compatible_vegetarian: true, compatible_vegan: true }),
  ingredient('Ceci cotti', 'legume', ['protein', 'carb'], 164, 9, 27, 2.6, 7, { compatible_vegetarian: true, compatible_vegan: true }),
  ingredient('Lenticchie cotte', 'legume', ['protein', 'carb'], 116, 9, 20, 0.4, 8, { compatible_vegetarian: true, compatible_vegan: true }),
  ingredient('Ricotta', 'dairy', ['protein'], 146, 11, 3, 10, 0, { compatible_vegetarian: true }),
  ingredient('Skyr naturale', 'dairy', ['protein'], 65, 11, 4, 0.2, 0, { compatible_vegetarian: true }),

  ingredient('Pasta integrale', 'grain', ['carb'], 350, 13, 68, 2.5, 8),
  ingredient('Pasta di semola', 'grain', ['carb'], 350, 12, 71, 1.5, 3),
  ingredient('Riso integrale', 'grain', ['carb'], 360, 7, 76, 3, 4),
  ingredient('Pane integrale', 'grain', ['carb'], 250, 9, 48, 3, 6),
  ingredient('Patate', 'vegetable', ['carb'], 77, 2, 17, 0.1, 2),
  ingredient('Farro', 'grain', ['carb'], 340, 12, 68, 2, 7),
  ingredient('Quinoa', 'grain', ['carb'], 368, 14, 64, 6, 7),
  ingredient('Fiocchi di avena', 'grain', ['carb'], 389, 17, 66, 7, 10, { meal_timing: ['breakfast', 'snack'] }),

  ingredient('Banana', 'fruit', ['fruit', 'carb'], 89, 1, 23, 0.3, 2.6),
  ingredient('Mela', 'fruit', ['fruit'], 52, 0.3, 14, 0.2, 2.4),
  ingredient('Mirtilli', 'fruit', ['fruit'], 57, 0.7, 14, 0.3, 2.4),
  ingredient('Arancia', 'fruit', ['fruit'], 47, 0.9, 12, 0.1, 2.4),
  ingredient('Zucchine', 'vegetable', ['vegetable'], 17, 1.2, 3.1, 0.3, 1.1),
  ingredient('Bietola', 'vegetable', ['vegetable'], 19, 1.8, 3.7, 0.2, 1.6),
  ingredient('Rucola', 'vegetable', ['vegetable'], 25, 2.6, 3.7, 0.7, 1.6),
  ingredient('Broccoli', 'vegetable', ['vegetable'], 34, 2.8, 7, 0.4, 2.6),
  ingredient('Carote', 'vegetable', ['vegetable'], 41, 0.9, 10, 0.2, 2.8),
  ingredient('Melanzane', 'vegetable', ['vegetable'], 25, 1, 6, 0.2, 3),
  ingredient('Radicchio', 'vegetable', ['vegetable'], 23, 1.4, 4.5, 0.3, 1.5),
  ingredient('Funghi', 'vegetable', ['vegetable'], 22, 3.1, 3.3, 0.3, 1),
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

const mainMeals = (plan) => plan.meals.filter((meal) => ['lunch', 'dinner'].includes(meal.mealType));

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

  const weekRows = [];
  const weekDates = [
    '2026-07-20',
    '2026-07-21',
    '2026-07-22',
    '2026-07-23',
    '2026-07-24',
    '2026-07-25',
    '2026-07-26'
  ];

  for (const date of weekDates) {
    const context = buildWeeklyMealContext(weekRows, {
      weekStart: '2026-07-20',
      weekEnd: '2026-07-26'
    });
    const weeklyPlan = await generateDayPlan(pool, {
      userId: 333,
      weightKg: 78,
      dietaryStyle: 'omnivore',
      dailyCalorieTarget: 2500,
      dailyProteinTarget: 150,
      dailyCarbTarget: 300,
      dailyFatTarget: 80,
      breakfastPref: 'both',
      weeklyPlanContext: context
    }, date);

    for (const meal of mainMeals(weeklyPlan)) {
      assert(meal.plateStructure?.passed, `${date} ${meal.mealType} should pass plate structure`);
      assert(meal.ingredients.some((item) => item.slot === 'protein'), `${date} ${meal.mealType} should keep exactly one readable protein`);
      assert(!namesForMeal(meal).includes('skyr'), `${date} ${meal.mealType} should not use skyr/yogurt as main-meal protein`);
    }

    weekRows.push({ plan_date: date, plan_data: weeklyPlan });
  }

  const completeWeekContext = buildWeeklyMealContext(weekRows, {
    weekStart: '2026-07-20',
    weekEnd: '2026-07-26'
  });
  const protein = completeWeekContext.counts.proteinGroups;
  const carbs = completeWeekContext.counts.carbSources;
  const uniqueCarbs = Object.values(carbs).filter((count) => Number(count || 0) > 0).length;

  assert(Number(protein.fish || 0) >= 2 && Number(protein.fish || 0) <= 3, 'weekly fish should land in the 2-3 meal range');
  assert(Number(protein.fattyFish || 0) >= 1 && Number(protein.fattyFish || 0) <= 2, 'weekly fatty fish should land in the 1-2 meal range');
  assert(Number(protein.legumesMain || 0) >= 2 && Number(protein.legumesMain || 0) <= 4, 'weekly legumes should land in the 2-4 meal range');
  assert(Number(carbs.pasta || 0) >= 4 && Number(carbs.pasta || 0) <= 7, 'weekly pasta should land in the 4-7 meal range');
  assert(uniqueCarbs >= 4, 'weekly carbohydrate rotation should use at least 4 sources');

  console.log('weekly rotation tests passed');
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
