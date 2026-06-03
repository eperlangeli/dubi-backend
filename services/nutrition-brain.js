const ENERGY_FACTORS = Object.freeze({
  protein: 4,
  carbs: 4,
  fats: 9,
  alcohol: 7
});

const NUTRITION_DATA_SOURCES = Object.freeze([
  {
    id: 'usda_foundation',
    name: 'USDA FoodData Central - Foundation Foods',
    country: 'US',
    tier: 1,
    reliabilityScore: 98,
    access: 'api_and_download',
    apiKeyEnv: 'USDA_FDC_API_KEY',
    useFor: ['raw_foods', 'lightly_processed_foods', 'macro_micro_validation'],
    caution: 'Foundation Foods may not include every nutrient for every food; small rounding differences can occur.',
    officialUrl: 'https://fdc.nal.usda.gov/Foundation_Foods_Documentation/',
    methodology: 'Analytical data with transparent metadata including samples, collection details and methods.'
  },
  {
    id: 'usda_sr_legacy',
    name: 'USDA FoodData Central - SR Legacy',
    country: 'US',
    tier: 1,
    reliabilityScore: 94,
    access: 'api_and_download',
    apiKeyEnv: 'USDA_FDC_API_KEY',
    useFor: ['validated_legacy_foods', 'fallback_for_foundation_foods'],
    caution: 'Final legacy release; stable and widely validated, but not updated.',
    officialUrl: 'https://fdc.nal.usda.gov/api-guide',
    methodology: 'Values derived from analyses, imputations and published literature.'
  },
  {
    id: 'ciqual',
    name: 'ANSES-CIQUAL Food Composition Table',
    country: 'FR',
    tier: 2,
    reliabilityScore: 94,
    access: 'download',
    apiKeyEnv: null,
    useFor: ['european_foods', 'average_food_composition', 'macro_micro_validation'],
    caution: 'Average composition values; match food names and preparation states carefully.',
    officialUrl: 'https://ciqual.anses.fr/',
    methodology: 'French reference table managed by ANSES using analytical, observatory and industry data.'
  },
  {
    id: 'crea',
    name: 'CREA Tabelle di Composizione degli Alimenti',
    country: 'IT',
    tier: 2,
    reliabilityScore: 91,
    access: 'web_or_download',
    apiKeyEnv: null,
    useFor: ['italian_foods', 'mediterranean_foods', 'local_portions'],
    caution: 'Excellent Italian reference, but less developer-oriented than USDA.',
    officialUrl: 'https://www.crea.gov.it/web/alimenti-e-nutrizione/tabelle-di-composizione-degli-alimenti',
    methodology: 'Italian institutional food composition tables from CREA Alimenti e Nutrizione.'
  },
  {
    id: 'bls',
    name: 'BLS Bundeslebensmittelschluessel',
    country: 'DE',
    tier: 2,
    reliabilityScore: 90,
    access: 'licensed_or_download',
    apiKeyEnv: null,
    useFor: ['german_european_foods', 'prepared_foods', 'recipe_modelling'],
    caution: 'Access/licensing must be checked before production ingestion.',
    officialUrl: 'https://www.blsdb.de/',
    methodology: 'German food composition key used in nutrition research and dietary assessment.'
  },
  {
    id: 'eurofir',
    name: 'EuroFIR FoodExplorer',
    country: 'EU',
    tier: 2,
    reliabilityScore: 88,
    access: 'aggregator',
    apiKeyEnv: null,
    useFor: ['cross_country_comparison', 'european_source_reconciliation'],
    caution: 'Use primarily for harmonisation and comparison; prefer national source for final values.',
    officialUrl: 'https://www.eurofir.org/foodexplorer/',
    methodology: 'European food composition data network and harmonisation layer.'
  },
  {
    id: 'producer_barcode',
    name: 'Official producer label / barcode',
    country: 'global',
    tier: 3,
    reliabilityScore: 75,
    access: 'barcode_or_label',
    apiKeyEnv: null,
    useFor: ['packaged_foods', 'brand_specific_products'],
    caution: 'Label data can be rounded and may change by country, batch or formulation.',
    officialUrl: null,
    methodology: 'Declared nutrition values from manufacturer labels.'
  }
]);

const SOURCE_PRIORITY = Object.freeze([
  'usda_foundation',
  'usda_sr_legacy',
  'ciqual',
  'crea',
  'bls',
  'eurofir',
  'producer_barcode'
]);

const calculateEnergyFromMacros = ({ protein = 0, carbs = 0, fats = 0, alcohol = 0 }) => {
  const p = Number(protein) || 0;
  const c = Number(carbs) || 0;
  const f = Number(fats) || 0;
  const a = Number(alcohol) || 0;

  return Math.round(
    p * ENERGY_FACTORS.protein +
    c * ENERGY_FACTORS.carbs +
    f * ENERGY_FACTORS.fats +
    a * ENERGY_FACTORS.alcohol
  );
};

const validateMacroEnergy = ({ calories, protein, carbs, fats, toleranceKcal = 8 }) => {
  const declaredCalories = Math.round(Number(calories) || 0);
  const calculatedCalories = calculateEnergyFromMacros({ protein, carbs, fats });
  const delta = declaredCalories - calculatedCalories;

  return {
    declaredCalories,
    calculatedCalories,
    delta,
    toleranceKcal,
    valid: Math.abs(delta) <= toleranceKcal,
    method: 'General Atwater factors: protein 4 kcal/g, carbohydrate 4 kcal/g, fat 9 kcal/g'
  };
};

const getSourceById = (sourceId) =>
  NUTRITION_DATA_SOURCES.find((source) => source.id === sourceId) || null;

const rankSourcesForIngredient = ({ locale = 'global', packaged = false } = {}) => {
  if (packaged) {
    return ['producer_barcode', ...SOURCE_PRIORITY.filter((id) => id !== 'producer_barcode')]
      .map(getSourceById)
      .filter(Boolean);
  }

  const regionalBoost = locale === 'it'
    ? ['crea', 'ciqual', 'bls']
    : locale === 'eu'
      ? ['ciqual', 'crea', 'bls', 'eurofir']
      : [];

  return [...new Set([...regionalBoost, ...SOURCE_PRIORITY])]
    .map(getSourceById)
    .filter(Boolean)
    .sort((a, b) => {
      const tierDelta = a.tier - b.tier;
      if (tierDelta !== 0) return tierDelta;
      return b.reliabilityScore - a.reliabilityScore;
    });
};

const scoreIngredientReference = (reference = {}) => {
  const source = getSourceById(reference.source_id || reference.sourceId);
  const sourceScore = source?.reliabilityScore || 50;
  const hasMacros = ['calories_per_100g', 'protein_per_100g', 'carbs_per_100g', 'fats_per_100g']
    .every((key) => reference[key] !== null && reference[key] !== undefined);
  const preparationMatch = reference.preparation_match === true ? 8 : 0;
  const localeMatch = reference.locale_match === true ? 4 : 0;
  const brandedPenalty = source?.id === 'producer_barcode' ? -8 : 0;
  const missingPenalty = hasMacros ? 0 : -30;

  return Math.max(0, Math.min(100, sourceScore + preparationMatch + localeMatch + brandedPenalty + missingPenalty));
};

const buildNutritionBrainStatus = () => ({
  version: 'nutrition-brain-v1',
  energyFactors: ENERGY_FACTORS,
  sourcePriority: SOURCE_PRIORITY,
  sources: NUTRITION_DATA_SOURCES,
  validationRules: {
    macroEnergyToleranceKcal: 8,
    recipeIngredientAudit: 'Compare declared recipe macros against source-backed ingredient macros after portion normalization.',
    preferredWorkflow: [
      'Match ingredient name and preparation state',
      'Fetch or read per-100g values from the highest-priority official source',
      'Convert portion quantity to grams/ml',
      'Sum ingredient macros',
      'Compare recipe totals against declared calories and macros',
      'Store source IDs, confidence score and audit result'
    ]
  }
});

module.exports = {
  ENERGY_FACTORS,
  NUTRITION_DATA_SOURCES,
  SOURCE_PRIORITY,
  calculateEnergyFromMacros,
  validateMacroEnergy,
  getSourceById,
  rankSourcesForIngredient,
  scoreIngredientReference,
  buildNutritionBrainStatus
};
