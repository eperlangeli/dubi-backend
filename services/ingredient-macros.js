const { normalizeIngredientKey, estimatePortionGrams } = require('./recipe-audit');

// Official-source aligned averages per 100 g/ml.
// Used as a runtime guard when recipe-level macros are older than ingredient portions.
const MACROS_PER_100G = Object.freeze({
  pane: { calories: 247, protein: 13.0, carbs: 41.0, fats: 4.2, fiber: 7.0, source_id: 'usda_sr_legacy', source_food_name: 'Bread, whole-wheat' },
  'pane di segale': { calories: 259, protein: 8.5, carbs: 48.3, fats: 3.3, fiber: 5.8, source_id: 'usda_sr_legacy', source_food_name: 'Bread, rye' },
  uova: { calories: 143, protein: 12.6, carbs: 0.7, fats: 9.5, fiber: 0, source_id: 'usda_foundation', source_food_name: 'Egg, whole, raw' },
  albumi: { calories: 52, protein: 10.9, carbs: 0.7, fats: 0.2, fiber: 0, source_id: 'usda_foundation', source_food_name: 'Egg white, raw' },
  funghi: { calories: 22, protein: 3.1, carbs: 3.3, fats: 0.3, fiber: 1.0, source_id: 'usda_foundation', source_food_name: 'Mushrooms, raw' },
  spinaci: { calories: 23, protein: 2.9, carbs: 3.6, fats: 0.4, fiber: 2.2, source_id: 'usda_foundation', source_food_name: 'Spinach, raw' },
  pomodoro: { calories: 18, protein: 0.9, carbs: 3.9, fats: 0.2, fiber: 1.2, source_id: 'usda_foundation', source_food_name: 'Tomatoes, raw' },
  rucola: { calories: 25, protein: 2.6, carbs: 3.7, fats: 0.7, fiber: 1.6, source_id: 'usda_foundation', source_food_name: 'Arugula, raw' },
  basilico: { calories: 23, protein: 3.2, carbs: 2.7, fats: 0.6, fiber: 1.6, source_id: 'usda_foundation', source_food_name: 'Basil, fresh' },
  'olio evo': { calories: 884, protein: 0, carbs: 0, fats: 100, fiber: 0, source_id: 'crea', source_food_name: 'Olio extra vergine di oliva' },
  'fesa di tacchino': { calories: 110, protein: 24, carbs: 0, fats: 1.5, fiber: 0, source_id: 'ciqual', source_food_name: 'Turkey breast, lean' },
  'petto di pollo': { calories: 110, protein: 23.1, carbs: 0, fats: 1.2, fiber: 0, source_id: 'ciqual', source_food_name: 'Chicken breast, raw' },
  'lenticchie cotte': { calories: 116, protein: 9.0, carbs: 20.1, fats: 0.4, fiber: 7.9, source_id: 'usda_sr_legacy', source_food_name: 'Lentils, cooked' },
  'mozzarella light': { calories: 168, protein: 19, carbs: 2.2, fats: 9, fiber: 0, source_id: 'producer_barcode', source_food_name: 'Mozzarella light average label' },
  branzino: { calories: 97, protein: 18.4, carbs: 0, fats: 2.0, fiber: 0, source_id: 'ciqual', source_food_name: 'Sea bass, raw' },
  passata: { calories: 29, protein: 1.4, carbs: 5.0, fats: 0.2, fiber: 1.4, source_id: 'ciqual', source_food_name: 'Tomato puree' },
  'passata di pomodoro': { calories: 29, protein: 1.4, carbs: 5.0, fats: 0.2, fiber: 1.4, source_id: 'ciqual', source_food_name: 'Tomato puree' },
  broccoli: { calories: 34, protein: 2.8, carbs: 6.6, fats: 0.4, fiber: 2.6, source_id: 'usda_foundation', source_food_name: 'Broccoli, raw' },
  zucchine: { calories: 17, protein: 1.2, carbs: 3.1, fats: 0.3, fiber: 1.0, source_id: 'usda_foundation', source_food_name: 'Zucchini, raw' },
  'verdure miste': { calories: 28, protein: 1.5, carbs: 5.5, fats: 0.3, fiber: 2.2, source_id: 'crea', source_food_name: 'Mixed vegetables average' },
  'verdure di stagione': { calories: 28, protein: 1.5, carbs: 5.5, fats: 0.3, fiber: 2.2, source_id: 'crea', source_food_name: 'Mixed vegetables average' }
});

const findMacroReference = (ingredientName = '') => {
  const key = normalizeIngredientKey(ingredientName);
  if (MACROS_PER_100G[key]) return MACROS_PER_100G[key];

  const matched = Object.entries(MACROS_PER_100G)
    .find(([term]) => key.includes(term) || term.includes(key));
  return matched ? matched[1] : null;
};

const buildSourceBackedNutritionFromIngredients = (ingredients = []) => {
  if (!Array.isArray(ingredients) || ingredients.length === 0) return null;

  const totals = { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 };
  const contributions = [];
  const missing = [];

  for (const ingredient of ingredients) {
    const grams = estimatePortionGrams(ingredient);
    const reference = findMacroReference(ingredient?.name);
    if (!grams || !reference) {
      missing.push({ name: ingredient?.name || '', quantity: ingredient?.quantity, unit: ingredient?.unit });
      continue;
    }

    const factor = grams / 100;
    const contribution = {
      name: ingredient.name,
      grams: Math.round(grams * 10) / 10,
      sourceId: reference.source_id,
      sourceFoodName: reference.source_food_name,
      calories: Math.round(reference.calories * factor),
      protein: Math.round(reference.protein * factor * 10) / 10,
      carbs: Math.round(reference.carbs * factor * 10) / 10,
      fats: Math.round(reference.fats * factor * 10) / 10,
      fiber: Math.round(reference.fiber * factor * 10) / 10
    };

    totals.calories += contribution.calories;
    totals.protein += contribution.protein;
    totals.carbs += contribution.carbs;
    totals.fats += contribution.fats;
    totals.fiber += contribution.fiber;
    contributions.push(contribution);
  }

  return {
    totals: {
      calories: Math.round(totals.calories),
      protein: Math.round(totals.protein * 10) / 10,
      carbs: Math.round(totals.carbs * 10) / 10,
      fats: Math.round(totals.fats * 10) / 10,
      fiber: Math.round(totals.fiber * 10) / 10
    },
    sourceCoverage: Math.round((contributions.length / ingredients.length) * 100),
    sourceIds: [...new Set(contributions.map((item) => item.sourceId))],
    contributions,
    missing
  };
};

module.exports = {
  buildSourceBackedNutritionFromIngredients,
  findMacroReference
};
