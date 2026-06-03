const FDC_BASE_URL = 'https://api.nal.usda.gov/fdc/v1';

const USDA_DATA_TYPES = ['Foundation', 'SR Legacy'];

const extractNutrient = (food, nutrientNames) => {
  const names = nutrientNames.map((name) => name.toLowerCase());
  const nutrient = (food.foodNutrients || []).find((item) => {
    const label = String(item.nutrientName || item.name || '').toLowerCase();
    return names.some((name) => label === name || label.includes(name));
  });

  if (!nutrient) return null;
  const value = Number(nutrient.value);
  return Number.isFinite(value) ? value : null;
};

const normalizeUsdaFood = (food) => ({
  source_id: food.dataType === 'SR Legacy' ? 'usda_sr_legacy' : 'usda_foundation',
  source_food_id: String(food.fdcId),
  source_food_name: food.description,
  calories_per_100g: extractNutrient(food, ['Energy']) ?? extractNutrient(food, ['Energy (Atwater General Factors)']),
  protein_per_100g: extractNutrient(food, ['Protein']),
  carbs_per_100g: extractNutrient(food, ['Carbohydrate, by difference']),
  fats_per_100g: extractNutrient(food, ['Total lipid (fat)', 'Total fat']),
  fiber_per_100g: extractNutrient(food, ['Fiber, total dietary'])
});

const searchUsdaFood = async (query, { apiKey = process.env.USDA_FDC_API_KEY, pageSize = 5 } = {}) => {
  if (!apiKey) {
    throw new Error('USDA_FDC_API_KEY is not configured');
  }

  const response = await fetch(`${FDC_BASE_URL}/foods/search?api_key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      dataType: USDA_DATA_TYPES,
      pageSize,
      sortBy: 'dataType.keyword',
      sortOrder: 'asc'
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`USDA search failed ${response.status}: ${text.slice(0, 200)}`);
  }

  const payload = await response.json();
  return (payload.foods || [])
    .map(normalizeUsdaFood)
    .filter((food) =>
      food.calories_per_100g !== null &&
      food.protein_per_100g !== null &&
      food.carbs_per_100g !== null &&
      food.fats_per_100g !== null
    );
};

module.exports = {
  searchUsdaFood,
  normalizeUsdaFood,
  USDA_DATA_TYPES
};
