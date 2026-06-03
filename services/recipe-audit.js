const { validateMacroEnergy } = require('./nutrition-brain');

const UNIT_TO_GRAMS = Object.freeze({
  g: 1,
  grammi: 1,
  ml: 1,
  cucchiaino: 5,
  tazzina: 40,
  medio: 120,
  media: 120,
  pz: 1
});

const PIECE_WEIGHTS = Object.freeze({
  banana: 120,
  mela: 150,
  pera: 150,
  kiwi: 75,
  uova: 55,
  uovo: 55,
  datteri: 18,
  gallette: 9,
  wrap: 60,
  piadina: 80,
  burger: 100
});

const normalizeIngredientKey = (name = '') =>
  String(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b\d+(?:[.,-]\d+)?\s*%/g, '')
    .replace(/\b(light|naturale|fresco|fresca|cotti|cotto|magra|magro|integrale|senza zuccheri aggiunti)\b/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const estimatePortionGrams = (ingredient = {}) => {
  const quantity = Number(ingredient.quantity);
  const unit = String(ingredient.unit || 'g').toLowerCase();
  const key = normalizeIngredientKey(ingredient.name);

  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  if (unit === 'g' || unit === 'grammi') return quantity;
  if (unit === 'ml') return quantity;
  if (UNIT_TO_GRAMS[unit] && unit !== 'pz') return quantity * UNIT_TO_GRAMS[unit];
  if (unit === 'pz' || unit === 'medio' || unit === 'media') {
    const matched = Object.entries(PIECE_WEIGHTS).find(([term]) => key.includes(term));
    return quantity * (matched ? matched[1] : UNIT_TO_GRAMS[unit] || 100);
  }

  return quantity;
};

const calculateIngredientContribution = (ingredient, reference) => {
  const grams = estimatePortionGrams(ingredient);
  if (!grams || !reference) return null;
  const factor = grams / 100;

  return {
    ingredientName: ingredient.name,
    ingredientKey: normalizeIngredientKey(ingredient.name),
    grams: Math.round(grams * 10) / 10,
    sourceId: reference.source_id,
    sourceFoodId: reference.source_food_id,
    sourceFoodName: reference.source_food_name,
    calories: Math.round(Number(reference.calories_per_100g || 0) * factor),
    protein: Math.round(Number(reference.protein_per_100g || 0) * factor * 10) / 10,
    carbs: Math.round(Number(reference.carbs_per_100g || 0) * factor * 10) / 10,
    fats: Math.round(Number(reference.fats_per_100g || 0) * factor * 10) / 10,
    fiber: Math.round(Number(reference.fiber_per_100g || 0) * factor * 10) / 10
  };
};

const sumContributions = (contributions) => contributions.reduce((sum, item) => ({
  calories: sum.calories + Number(item.calories || 0),
  protein: sum.protein + Number(item.protein || 0),
  carbs: sum.carbs + Number(item.carbs || 0),
  fats: sum.fats + Number(item.fats || 0),
  fiber: sum.fiber + Number(item.fiber || 0)
}), { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 });

const buildRecipeAuditFromReferences = (recipe, referenceByKey) => {
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  const contributions = [];
  const missing = [];

  for (const ingredient of ingredients) {
    const key = normalizeIngredientKey(ingredient.name);
    const reference = referenceByKey[key];
    const contribution = calculateIngredientContribution(ingredient, reference);
    if (!contribution) {
      missing.push({ ingredientName: ingredient.name, ingredientKey: key });
    } else {
      contributions.push(contribution);
    }
  }

  const calculated = sumContributions(contributions);
  calculated.calories = Math.round(calculated.calories);
  calculated.protein = Math.round(calculated.protein * 10) / 10;
  calculated.carbs = Math.round(calculated.carbs * 10) / 10;
  calculated.fats = Math.round(calculated.fats * 10) / 10;
  calculated.fiber = Math.round(calculated.fiber * 10) / 10;

  const declared = {
    calories: Number(recipe.calories || 0),
    protein: Number(recipe.protein || 0),
    carbs: Number(recipe.carbs || 0),
    fats: Number(recipe.fats || 0),
    fiber: Number(recipe.fiber || 0)
  };
  const macroEnergy = validateMacroEnergy(declared);
  const calorieDelta = Math.round(calculated.calories - declared.calories);
  const sourceCoverage = ingredients.length ? contributions.length / ingredients.length : 0;
  const status = missing.length === 0 && Math.abs(calorieDelta) <= 60
    ? 'approved'
    : sourceCoverage >= 0.75
      ? 'needs_macro_adjustment'
      : 'pending_sources';

  return {
    recipeId: recipe.id,
    recipeName: recipe.name,
    declared,
    calculated,
    calorieDelta,
    macroEnergy,
    sourceCoverage: Math.round(sourceCoverage * 100),
    status,
    confidence: status === 'approved' ? 90 : status === 'needs_macro_adjustment' ? 75 : 55,
    contributions,
    missing
  };
};

module.exports = {
  normalizeIngredientKey,
  estimatePortionGrams,
  calculateIngredientContribution,
  buildRecipeAuditFromReferences
};
