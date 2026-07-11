'use strict';

/**
 * DUBI Meal Engine v2
 * Generates a personalized daily meal plan from the ingredients table.
 * No OpenAI dependency: pure nutritional logic.
 */

const { MEAL_FLOORS } = require('../config/meal-floors');

const DIET_COL = {
  omnivore: 'compatible_omnivore',
  onnivoro: 'compatible_omnivore',
  pescatarian: 'compatible_pescatarian',
  pescetariana: 'compatible_pescatarian',
  pescetariano: 'compatible_pescatarian',
  vegetarian: 'compatible_vegetarian',
  vegetariana: 'compatible_vegetarian',
  vegetariano: 'compatible_vegetarian',
  vegan: 'compatible_vegan',
  vegana: 'compatible_vegan',
  vegano: 'compatible_vegan',
};

const ALLERGEN_MAP = {
  gluten: 'allergen_gluten',
  glutine: 'allergen_gluten',
  celiac: 'allergen_gluten',
  celiachia: 'allergen_gluten',
  dairy: 'allergen_dairy',
  latticini: 'allergen_dairy',
  latte: 'allergen_dairy',
  lactose: 'allergen_lactose',
  lattosio: 'allergen_lactose',
  eggs: 'allergen_eggs',
  uova: 'allergen_eggs',
  fish: 'allergen_fish',
  pesce: 'allergen_fish',
  shellfish: 'allergen_shellfish',
  crostacei: 'allergen_shellfish',
  molluschi: 'allergen_shellfish',
  nuts: 'allergen_nuts',
  'frutta secca': 'allergen_nuts',
  frutta_secca: 'allergen_nuts',
  peanuts: 'allergen_peanuts',
  arachidi: 'allergen_peanuts',
  soy: 'allergen_soy',
  soia: 'allergen_soy',
  sesame: 'allergen_sesame',
  sesamo: 'allergen_sesame',
};

const PATHOLOGY_MAP = {
  celiac: 'ok_celiac',
  celiachia: 'ok_celiac',
  'lactose intolerant': 'ok_lactose_intolerant',
  'intolleranza lattosio': 'ok_lactose_intolerant',
  intolleranza_lattosio: 'ok_lactose_intolerant',
  lactose: 'ok_lactose_intolerant',
  lattosio: 'ok_lactose_intolerant',
  diabetic: 'ok_diabetic',
  diabetes: 'ok_diabetic',
  diabete: 'ok_diabetic',
  diabetico: 'ok_diabetic',
  gerd: 'ok_gerd',
  reflusso: 'ok_gerd',
  acidita: 'ok_gerd',
  'reflusso gastrico': 'ok_gerd',
  ibs: 'ok_ibs_fodmap',
  fodmap: 'ok_ibs_fodmap',
  ibs_fodmap: 'ok_ibs_fodmap',
  histamine: 'ok_histamine',
  istamina: 'ok_histamine',
  'intolleranza istamina': 'ok_histamine',
  gout: 'ok_gout',
  gotta: 'ok_gout',
  renal: 'ok_renal',
  renale: 'ok_renal',
  'insufficienza renale': 'ok_renal',
  nickel: 'ok_nickel',
  nichel: 'ok_nickel',
};

const CALORIE_FRACTIONS = {
  breakfast:   0.25,
  pre_workout: 0.08,  // spuntino leggero ~45-60 min prima — solo carbo rapidi, digestione facile
  post_workout: 0.18, // carbo + proteine per recupero glicogeno e sintesi muscolare
  lunch:       0.30,
  snack:       0.08,
  dinner:      0.25,
};

const PORTION_BOUNDS = {
  protein_animal: { min: 100, max: 220, typical: 150 },
  protein_plant: { min: 100, max: 200, typical: 150 },
  legume: { min: 100, max: 200, typical: 150 },
  egg: { min: 50, max: 150, typical: 100 },
  grain: { min: 50, max: 100, typical: 80 },
  dairy: { min: 100, max: 200, typical: 150 },
  dairy_alt: { min: 100, max: 250, typical: 200 },
  vegetable: { min: 100, max: 250, typical: 150 },
  fruit: { min: 80, max: 200, typical: 130 },
  nut_seed: { min: 15, max: 40, typical: 25 },
  fat: { min: 8, max: 15, typical: 10 },
  supplement: { min: 25, max: 35, typical: 30 },
};

const MEAL_NAMES = {
  breakfast: { it: 'Colazione', en: 'Breakfast' },
  pre_workout: { it: 'Pre-Workout', en: 'Pre-Workout' },
  post_workout: { it: 'Post-Workout', en: 'Post-Workout' },
  lunch: { it: 'Pranzo', en: 'Lunch' },
  snack: { it: 'Spuntino', en: 'Snack' },
  dinner: { it: 'Cena', en: 'Dinner' },
};

function normalizeToken(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(normalizeToken).filter(Boolean);
  return String(value)
    .split(/[,;|]/)
    .map(normalizeToken)
    .filter(Boolean)
    .filter((token) => !['none', 'nessuna', 'nessuno', 'no'].includes(token));
}

function normalizeBreakfastPref(value) {
  const pref = normalizeToken(value);
  if (['none', 'skip', 'no', 'nessuna', 'nessuno', 'senza colazione', 'no breakfast'].includes(pref)) {
    return 'none';
  }
  if (['daily', 'giornaliera', 'giornaliero', 'day by day', 'choose daily'].includes(pref)) {
    return 'daily';
  }
  if (['dolce', 'sweet'].includes(pref)) return 'dolce';
  if (['salata', 'salato', 'savory', 'savoury'].includes(pref)) return 'salata';
  if (['both', 'entrambi', 'entrambe', 'mixed', 'mista', 'misto'].includes(pref)) return 'both';
  return 'both';
}

function normalizeBreakfastChoice(value) {
  const choice = normalizeToken(value);
  if (['dolce', 'sweet'].includes(choice)) return 'dolce';
  if (['salata', 'salato', 'savory', 'savoury'].includes(choice)) return 'salata';
  if (['skip', 'none', 'no', 'nessuna', 'nessuno'].includes(choice)) return 'skip';
  return null;
}

function getBreakfastPreference(userProfile = {}) {
  return normalizeBreakfastPref(userProfile.breakfastPref ?? userProfile.breakfast_pref);
}

function getBreakfastChoice(userProfile = {}) {
  return normalizeBreakfastChoice(userProfile.breakfastChoice ?? userProfile.breakfast_choice);
}

function shouldSkipBreakfast(userProfile = {}) {
  return getBreakfastChoice(userProfile) === 'skip' || getBreakfastPreference(userProfile) === 'none';
}

function effectiveBreakfastStyle(userProfile = {}) {
  const choice = getBreakfastChoice(userProfile);
  if (choice === 'skip') return null;
  if (choice === 'dolce' || choice === 'salata') return choice;

  const pref = getBreakfastPreference(userProfile);
  if (pref === 'dolce' || pref === 'salata') return pref;
  if (pref === 'none') return null;

  // "daily" means no fixed style until the daily frontend choice arrives.
  return 'both';
}

function parseRestrictions(allergiesText) {
  const tokens = normalizeList(allergiesText);
  const allergenCols = [];
  const pathologyCols = [];

  for (const token of tokens) {
    if (ALLERGEN_MAP[token]) allergenCols.push(ALLERGEN_MAP[token]);
    if (PATHOLOGY_MAP[token]) pathologyCols.push(PATHOLOGY_MAP[token]);
  }

  return {
    allergenCols: [...new Set(allergenCols)],
    pathologyCols: [...new Set(pathologyCols)],
  };
}

function normalizeUserPathologies(userPathologies) {
  if (!Array.isArray(userPathologies)) return [];

  return [...new Set(
    userPathologies
      .map((value) => normalizeToken(value).replace(/^ok\s+/, '').replace(/\s+/g, '_'))
      .filter(Boolean)
  )];
}

function withoutBreakfastIfNeeded(mealTypes, options = {}) {
  if (!options.skipBreakfast) return mealTypes;
  return mealTypes.filter((mealType) => mealType !== 'breakfast');
}

function buildDayStructure(trainingTime, options = {}) {
  const base = ['breakfast', 'lunch', 'snack', 'dinner'];
  if (!trainingTime) return withoutBreakfastIfNeeded(base, options);

  const time = normalizeToken(trainingTime);

  if (['morning', 'mattina', 'mattino'].includes(time)) {
    // Mattino: niente tempo per digerire un pasto completo prima.
    // Piccolo carbo rapido pre-workout, poi pasto completo post-workout.
    return withoutBreakfastIfNeeded(['pre_workout', 'post_workout', 'breakfast', 'lunch', 'snack', 'dinner'], options);
  }

  if (['afternoon', 'pomeriggio'].includes(time)) {
    // Pomeriggio: pranzo completo ~3h prima (carbo+pro+pochi grassi),
    // poi spuntino pre-workout 45-60 min prima (carbo rapidi, pro opzionali),
    // poi post-workout (carbo+pro recupero), poi spuntino e cena.
    return withoutBreakfastIfNeeded(['breakfast', 'lunch', 'pre_workout', 'post_workout', 'snack', 'dinner'], options);
  }

  if (['evening', 'sera'].includes(time)) {
    // Sera: la CENA è il pasto principale pre-allenamento (carbo+pro+grassi moderati),
    // poi piccolo spuntino carbo ~45-60 min prima, poi post-workout recupero.
    // La cena precede pre_workout — non viene dopo.
    return withoutBreakfastIfNeeded(['breakfast', 'lunch', 'snack', 'dinner', 'pre_workout', 'post_workout'], options);
  }

  return withoutBreakfastIfNeeded(base, options);
}

function isTrainingDay(userProfile, targetDate) {
  const explicitDays = normalizeList(userProfile.trainingDays);
  if (explicitDays.length > 0) {
    const weekday = new Date(targetDate).toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    return explicitDays.includes(weekday) || explicitDays.includes(normalizeToken(weekday));
  }

  return Number(userProfile.workoutDays || 0) > 0 && Boolean(userProfile.trainingTime);
}

function createRng(seedText) {
  let seed = 2166136261;
  for (let i = 0; i < seedText.length; i++) {
    seed ^= seedText.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }

  return () => {
    seed += 0x6D2B79F5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function giScore(input, userProfile = {}) {
  const ingredient = input && typeof input === 'object' ? input : null;
  const giLabel = ingredient ? normalizeToken(ingredient.glycemic_index).replace(/\s+/g, '_') : null;

  if (giLabel === 'low') return 1.2;
  if (giLabel === 'medium') return 1.0;
  if (giLabel === 'high') return 0.7;

  const gi = Number(ingredient ? ingredient.gi_numeric : input);
  if (!Number.isFinite(gi)) return 1.0;

  const goal = normalizeToken(userProfile.goal);
  const currentMealType = normalizeToken(userProfile.currentMealType || userProfile.mealType || userProfile.mealTiming);
  const needsLowGi = ['weight loss', 'weight_loss', 'fat loss', 'fat_loss', 'cut'].includes(goal) || Boolean(userProfile.hasDiabeticNeed);

  if (needsLowGi) {
    if (gi < 35) return 1.4;
    if (gi <= 55) return 1.1;
    if (gi <= 70) return 0.8;
    return 0.5;
  }

  if (['muscle gain', 'muscle_gain'].includes(goal) && currentMealType === 'post workout') {
    if (gi > 70) return 1.3;
    if (gi >= 55) return 1.1;
    return 1.0;
  }

  return 1.0;
}

function deterministicSelectionScore(seedText) {
  return createRng(seedText)();
}

function getPortionBounds(category) {
  return PORTION_BOUNDS[category] || { min: 50, max: 200, typical: 100 };
}

function calcPortion(ingredient, targetCalories) {
  const bounds = getPortionBounds(ingredient.category);
  const caloriesPer100g = Number(ingredient.calories_per_100g || 0);
  if (!caloriesPer100g) return bounds.typical;

  const rawG = (targetCalories / caloriesPer100g) * 100;
  return Math.round(Math.max(bounds.min, Math.min(bounds.max, rawG)));
}

function macrosForPortion(ingredient, portionG) {
  const factor = portionG / 100;
  return {
    calories: Math.round(Number(ingredient.calories_per_100g || 0) * factor),
    protein: Math.round(Number(ingredient.protein_g || 0) * factor * 10) / 10,
    carbs: Math.round(Number(ingredient.carbs_g || 0) * factor * 10) / 10,
    fat: Math.round(Number(ingredient.fat_g || 0) * factor * 10) / 10,
    fiber: Math.round(Number(ingredient.fiber_g || 0) * factor * 10) / 10,
  };
}

function normalizeDbArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    return value
      .replace(/^{|}$/g, '')
      .split(',')
      .map((item) => item.trim().replace(/^"|"$/g, ''))
      .filter(Boolean);
  }
  return [];
}

function pathologyFlagCount(candidate, userPathologies) {
  return normalizeUserPathologies(userPathologies)
    .reduce((count, pathology) => count + (candidate[`ok_${pathology}`] === false ? 1 : 0), 0);
}

function rawPathologyFilter(candidates, userPathologies) {
  const normalizedPathologies = normalizeUserPathologies(userPathologies);
  if (normalizedPathologies.length === 0) return Array.isArray(candidates) ? candidates : [];

  return (Array.isArray(candidates) ? candidates : []).filter((candidate) =>
    normalizedPathologies.every((pathology) => candidate[`ok_${pathology}`] !== false)
  );
}

function applyPathologyFilter(candidates, userPathologies) {
  const sourceCandidates = Array.isArray(candidates) ? candidates : [];
  const normalizedPathologies = normalizeUserPathologies(userPathologies);
  if (normalizedPathologies.length === 0) return sourceCandidates;

  const filtered = rawPathologyFilter(sourceCandidates, normalizedPathologies);
  if (filtered.length >= 3 || sourceCandidates.length <= 3) return filtered;

  console.warn(
    `[mealEngine] Pathology filter relaxed for ${normalizedPathologies.join(', ')}: ` +
    `${filtered.length}/${sourceCandidates.length} safe candidates available`
  );

  return [...sourceCandidates]
    .sort((a, b) => {
      const delta = pathologyFlagCount(a, normalizedPathologies) - pathologyFlagCount(b, normalizedPathologies);
      if (delta !== 0) return delta;
      if (Boolean(a.nutritionist_validated) !== Boolean(b.nutritionist_validated)) {
        return a.nutritionist_validated ? -1 : 1;
      }
      return String(a.name || '').localeCompare(String(b.name || ''));
    })
    .slice(0, Math.min(5, sourceCandidates.length));
}

function calcPathologyExclusions(allIngredients, userPathologies) {
  const normalizedPathologies = normalizeUserPathologies(userPathologies);
  const sourceIngredients = Array.isArray(allIngredients) ? allIngredients : [];
  const filteredIngredients = rawPathologyFilter(sourceIngredients, normalizedPathologies);

  return {
    activePathologies: normalizedPathologies,
    excludedCount: sourceIngredients.length - filteredIngredients.length,
    totalPool: sourceIngredients.length,
    filteredPool: filteredIngredients.length,
  };
}

function buildVarietyTracker() {
  return {
    usedIds: new Set(),
    fishCount: 0,
    processedMeatCount: 0,
  };
}

function isFishIngredient(ingredient) {
  const text = `${ingredient.category || ''} ${ingredient.subcategory || ''} ${ingredient.name || ''}`.toLowerCase();
  return /\bfish\b|pesce|salmone|tonno|merluzzo|orata|branzino/.test(text);
}

function isProcessedMeat(ingredient) {
  const text = `${ingredient.subcategory || ''} ${ingredient.name || ''}`.toLowerCase();
  return /cured_meat|affettat|bresaola|prosciutto|salame|fesa/.test(text);
}

function checkVariety(ingredient, dayTracker, mealTracker) {
  if (dayTracker.usedIds.has(ingredient.id)) return false;
  if (isFishIngredient(ingredient) && dayTracker.fishCount >= 1) return false;
  if (isProcessedMeat(ingredient) && dayTracker.processedMeatCount >= 1) return false;
  if (mealTracker.mainMeal && ingredient.category === 'grain' && mealTracker.grainCount >= 1) return false;
  return true;
}

function recordVariety(ingredient, dayTracker, mealTracker) {
  dayTracker.usedIds.add(ingredient.id);
  if (isFishIngredient(ingredient)) dayTracker.fishCount++;
  if (isProcessedMeat(ingredient)) dayTracker.processedMeatCount++;
  if (mealTracker.mainMeal && ingredient.category === 'grain') mealTracker.grainCount++;
}

async function loadEligibleIngredients(pool, dietCol, allergenCols) {
  const conditions = ['i.is_active = true', `i.${dietCol} = true`];

  for (const col of allergenCols) conditions.push(`i.${col} = false`);

  const { rows } = await pool.query(`
    SELECT i.*
    FROM ingredients i
    WHERE ${conditions.join(' AND ')}
    ORDER BY i.nutritionist_validated DESC, i.name
  `);
  return rows;
}

function filterBySlotAndTiming(ingredients, slot, mealType) {
  return ingredients.filter((ingredient) => {
    const slots = normalizeDbArray(ingredient.template_slots);
    const timings = normalizeDbArray(ingredient.meal_timing);
    return slots.includes(slot) && timings.includes(mealType);
  });
}

function breakfastIngredientText(ingredient) {
  return normalizeToken([
    ingredient.category,
    ingredient.subcategory,
    ingredient.name,
    ingredient.name_en,
    ...normalizeDbArray(ingredient.health_tags),
  ].filter(Boolean).join(' '));
}

function matchesBreakfastStyle(ingredient, style) {
  const text = breakfastIngredientText(ingredient);
  if (style === 'dolce') {
    return /frutta|fruit|banana|mela|pera|fragol|mirtill|berry|berries|avena|oat|muesli|granola|yogurt|skyr|kefir|latte|milk|cacao|cocoa|miele|honey|marmellata|jam|pane|toast|ricotta/.test(text);
  }
  if (style === 'salata') {
    return /uov|egg|album|avocado|salmone|salmon|tonno|tuna|tacchino|turkey|pollo|chicken|bresaola|prosciutto|hummus|tofu|tempeh|formaggio|cheese|fiocchi di latte|cottage|legume|legumi|pane|toast/.test(text);
  }
  return true;
}

function applyBreakfastStylePreference(candidates, mealType, userProfile) {
  if (mealType !== 'breakfast') return candidates;

  const style = effectiveBreakfastStyle(userProfile);
  if (style !== 'dolce' && style !== 'salata') return candidates;

  const preferred = candidates.filter((ingredient) => matchesBreakfastStyle(ingredient, style));
  return preferred.length > 0 ? preferred : candidates;
}

function pickIngredient(candidates, dayTracker, mealTracker, rng, userProfile, selectionSeed) {
  const eligible = candidates.filter((candidate) => checkVariety(candidate, dayTracker, mealTracker));
  if (eligible.length === 0) return null;

  const validated = eligible.filter((item) => item.nutritionist_validated);
  const pool = validated.length > 0 && rng() < 0.65 ? validated : eligible;
  const rankingProfile = { ...userProfile };

  return pool
    .map((candidate) => ({
      candidate,
      score: deterministicSelectionScore(`${selectionSeed}:${candidate.id}:${candidate.name}`) *
        giScore(candidate, rankingProfile),
    }))
    .sort((a, b) => b.score - a.score || String(a.candidate.name).localeCompare(String(b.candidate.name)))
    .map((entry) => entry.candidate)[0] || null;
}

function pickRequiredProteinFallback(candidates, userProfile, selectionSeed) {
  const proteinCandidates = candidates.filter(isProteinFloorItem);
  if (proteinCandidates.length === 0) return null;

  return proteinCandidates
    .map((candidate) => ({
      candidate,
      score: deterministicSelectionScore(`${selectionSeed}:protein-floor:${candidate.id}:${candidate.name}`) *
        giScore(candidate, userProfile),
    }))
    .sort((a, b) =>
      b.score - a.score ||
      proteinDensity(b.candidate) - proteinDensity(a.candidate) ||
      String(a.candidate.name || '').localeCompare(String(b.candidate.name || ''))
    )
    .map((entry) => entry.candidate)[0] || null;
}

function buildPlanItem(ingredient, slot, portionG) {
  const macros = macrosForPortion(ingredient, portionG);
  return {
    id: ingredient.id,
    name: ingredient.name,
    name_en: ingredient.name_en,
    category: ingredient.category,
    subcategory: ingredient.subcategory,
    source_id: ingredient.source_id || null,
    source_confidence: ingredient.source_confidence === null || ingredient.source_confidence === undefined
      ? null
      : Number(ingredient.source_confidence),
    glycemic_index: ingredient.glycemic_index || null,
    gi_numeric: ingredient.gi_numeric !== null &&
      ingredient.gi_numeric !== undefined &&
      Number.isFinite(Number(ingredient.gi_numeric))
      ? Number(ingredient.gi_numeric)
      : null,
    slot,
    portionG,
    calories_per_100g: Number(ingredient.calories_per_100g || 0),
    protein_g: Number(ingredient.protein_g || 0),
    carbs_g: Number(ingredient.carbs_g || 0),
    fat_g: Number(ingredient.fat_g || 0),
    fiber_g: Number(ingredient.fiber_g || 0),
    ...macros,
  };
}

function isVegetableFloorItem(item) {
  return item.category === 'vegetable' || item.slot === 'vegetable';
}

function isFiberFloorItem(item) {
  return ['vegetable', 'fruit', 'grain', 'legume'].includes(item.category);
}

function isDinnerFatFloorItem(item) {
  return ['fat', 'nut_seed'].includes(item.category) || Number(item.fat_g || 0) >= 10;
}

function vegetableGramsForMeal(meal) {
  return Math.round(meal.ingredients
    .filter(isVegetableFloorItem)
    .reduce((sum, item) => sum + Number(item.portionG || 0), 0) * 10) / 10;
}

function mainMealFiberFloor() {
  const floor = Number(MEAL_FLOORS.main_meal_fiber_g || 0);
  return Number.isFinite(floor) && floor > 0 ? floor : 0;
}

function mainMealVegetableFloor() {
  const floor = Number(MEAL_FLOORS.main_meal_vegetable_g || 0);
  return Number.isFinite(floor) && floor > 0 ? floor : 0;
}

function dinnerFatFloor() {
  const floor = Number(MEAL_FLOORS.dinner_fat_g || 0);
  return Number.isFinite(floor) && floor > 0 ? floor : 0;
}

function recomputeMealTotals(meal) {
  meal.totalCalories = Math.round(meal.ingredients.reduce((sum, item) => sum + (item.calories || 0), 0));
  meal.totalMacros = {
    protein: Math.round(meal.ingredients.reduce((sum, item) => sum + (item.protein || 0), 0) * 10) / 10,
    carbs: Math.round(meal.ingredients.reduce((sum, item) => sum + (item.carbs || 0), 0) * 10) / 10,
    fat: Math.round(meal.ingredients.reduce((sum, item) => sum + (item.fat || 0), 0) * 10) / 10,
    fiber: Math.round(meal.ingredients.reduce((sum, item) => sum + (item.fiber || 0), 0) * 10) / 10,
  };
}

function pickMainMealVegetableFallback(ingredients, mealType, dayTracker, mealTracker, rng, userProfile, date) {
  const candidates = ingredients.filter((ingredient) => {
    if (ingredient.category !== 'vegetable') return false;
    const timings = normalizeDbArray(ingredient.meal_timing);
    return timings.length === 0 || timings.includes(mealType);
  });
  if (candidates.length === 0) return null;

  return pickIngredient(
    candidates,
    dayTracker,
    mealTracker,
    rng,
    { ...userProfile, currentMealType: mealType },
    `${userProfile.userId || 'anonymous'}:${date}:${mealType}:vegetable-floor`
  ) || candidates[0];
}

function ensureMainMealVegetable(meal, eligibleIngredients, dayTracker, mealTracker, rng, userProfile, date) {
  if (!['lunch', 'dinner'].includes(meal.mealType)) return;
  if (meal.ingredients.some(isVegetableFloorItem)) return;

  const vegetable = pickMainMealVegetableFallback(
    eligibleIngredients,
    meal.mealType,
    dayTracker,
    mealTracker,
    rng,
    userProfile,
    date
  );
  if (!vegetable) {
    console.warn(`[mealEngine] Vegetable floor unmet for ${meal.mealType}: no eligible vegetable item available`);
    return;
  }

  recordVariety(vegetable, dayTracker, mealTracker);
  meal.ingredients.push(buildPlanItem(vegetable, 'vegetable', mainMealVegetableFloor() || getPortionBounds('vegetable').typical));
}

function ensureDinnerFat(meal, eligibleIngredients) {
  if (meal.mealType !== 'dinner' || dinnerFatFloor() <= 0) return;
  if (meal.ingredients.some(isDinnerFatFloorItem)) return;

  const fat = eligibleIngredients.find((ingredient) => {
    if (!['fat', 'nut_seed'].includes(ingredient.category)) return false;
    const timings = normalizeDbArray(ingredient.meal_timing);
    return timings.length === 0 || timings.includes('dinner');
  });
  if (!fat) return;

  meal.ingredients.push(buildPlanItem(fat, 'fat', getPortionBounds(fat.category).typical));
}

function calcDailyGiSummary(mealPlan) {
  const meals = Array.isArray(mealPlan) ? mealPlan : [];
  const allIngredients = meals.flatMap((meal) => Array.isArray(meal.ingredients) ? meal.ingredients : []);
  const totalIngredients = allIngredients.length;
  const counts = allIngredients.reduce((acc, item) => {
    const label = normalizeToken(item.glycemic_index);
    if (['low', 'basso'].includes(label)) acc.low++;
    else if (['medium', 'medio'].includes(label)) acc.medium++;
    else if (['high', 'alto'].includes(label)) acc.high++;
    else acc.unknown++;
    return acc;
  }, { low: 0, medium: 0, high: 0, unknown: 0 });
  const ingredientsWithGi = totalIngredients - counts.unknown;

  if (ingredientsWithGi === 0) {
    return {
      avgGi: null,
      giCategory: 'unknown',
      ingredientsWithGi,
      totalIngredients,
      ...counts,
    };
  }

  const coverage = totalIngredients > 0 ? ingredientsWithGi / totalIngredients : 0;
  const weighted = allIngredients.reduce((acc, item) => {
    const gi = item.gi_numeric === null || item.gi_numeric === undefined ? NaN : Number(item.gi_numeric);
    if (!Number.isFinite(gi)) return acc;
    const weight = Number(item.portionG) > 0 ? Number(item.portionG) : 1;
    acc.totalWeight += weight;
    acc.totalGi += gi * weight;
    return acc;
  }, { totalGi: 0, totalWeight: 0 });

  const avgGi = weighted.totalWeight > 0 ? Math.round(weighted.totalGi / weighted.totalWeight) : null;
  let giCategory = 'unknown';

  if (coverage < 0.5) giCategory = 'mixed';
  else if (avgGi !== null && avgGi < 45) giCategory = 'low';
  else if (avgGi !== null && avgGi <= 65) giCategory = 'medium';
  else if (avgGi !== null) giCategory = 'high';
  else if (counts.high > 0 && counts.low === 0 && counts.medium === 0) giCategory = 'high';
  else if (counts.medium > 0 && counts.low === 0 && counts.high === 0) giCategory = 'medium';
  else if (counts.low > 0 && counts.medium === 0 && counts.high === 0) giCategory = 'low';
  else giCategory = 'mixed';

  return {
    avgGi,
    giCategory,
    ingredientsWithGi,
    totalIngredients,
    ...counts,
  };
}

async function composeMeal(pool, mealType, mealCalorieTarget, eligibleIngredients, allIngredients, userPathologies, dayTracker, rng, userProfile, date) {
  const tmplResult = await pool.query(
    'SELECT slots FROM meal_templates WHERE meal_type = $1',
    [mealType]
  );

  if (tmplResult.rows.length === 0) {
    return { mealType, error: `No template for ${mealType}`, ingredients: [], totalCalories: 0, totalMacros: {} };
  }

  const template = tmplResult.rows[0].slots || {};
  const slots = Object.entries(template);
  const requiredSlots = slots.filter(([, config]) => config && config.required);
  const divisor = requiredSlots.length > 0 ? requiredSlots.length : Math.max(slots.length, 1);
  const caloriesPerSlot = Math.round(mealCalorieTarget / divisor);
  const mealTracker = {
    mainMeal: ['lunch', 'dinner'].includes(mealType),
    grainCount: 0,
  };

  const meal = {
    mealType,
    displayName: MEAL_NAMES[mealType] || { it: mealType, en: mealType },
    ingredients: [],
    totalCalories: 0,
    totalMacros: {},
  };

  // For omnivores, legumes should never fill the protein slot (use animal protein instead)
  const isOmnivore = normalizeToken(userProfile.dietaryStyle) === 'omnivore' ||
    normalizeToken(userProfile.dietaryStyle) === 'onnivoro';

  for (const [slot, config] of slots) {
    let candidates = filterBySlotAndTiming(eligibleIngredients, slot, mealType);
    if (candidates.length === 0) {
      candidates = eligibleIngredients.filter((ingredient) => normalizeDbArray(ingredient.template_slots).includes(slot));
    }

    // Omnivore + protein slot: exclude legumes so animal protein fills the slot
    if (isOmnivore && slot === 'protein' && ['lunch', 'dinner'].includes(mealType)) {
      const withoutLegumes = candidates.filter(ing => ing.category !== 'legume');
      if (withoutLegumes.length > 0) candidates = withoutLegumes;
    }

    if (normalizeUserPathologies(userPathologies).length > 0 && candidates.length < 3) {
      let fallbackCandidates = filterBySlotAndTiming(allIngredients, slot, mealType);
      if (fallbackCandidates.length === 0) {
        fallbackCandidates = allIngredients.filter((ingredient) => normalizeDbArray(ingredient.template_slots).includes(slot));
      }
      candidates = applyPathologyFilter(fallbackCandidates, userPathologies);
    }

    candidates = applyBreakfastStylePreference(candidates, mealType, userProfile);

    if (candidates.length === 0) {
      if (config && config.required) {
        console.error(`[mealEngine] No eligible ingredients for required slot "${slot}" in "${mealType}"`);
      }
      continue;
    }

    const count = Number(config && config.count) || 1;
    for (let index = 0; index < count; index++) {
      const selectionSeed = `${userProfile.userId || 'anonymous'}:${date}:${mealType}:${slot}:${index}`;
      let chosen = pickIngredient(
        candidates,
        dayTracker,
        mealTracker,
        rng,
        { ...userProfile, currentMealType: mealType },
        selectionSeed
      );

      if (!chosen && config && config.required && slot === 'protein' && ['lunch', 'dinner'].includes(mealType)) {
        chosen = pickRequiredProteinFallback(
          candidates,
          { ...userProfile, currentMealType: mealType },
          selectionSeed
        );
        if (chosen) {
          console.warn(`[mealEngine] Variety relaxed for required protein slot in "${mealType}"`);
        }
      }

      if (!chosen) break;

      recordVariety(chosen, dayTracker, mealTracker);
      const portionG = calcPortion(chosen, caloriesPerSlot);
      meal.ingredients.push(buildPlanItem(chosen, slot, portionG));
    }
  }

  ensureMainMealVegetable(meal, eligibleIngredients, dayTracker, mealTracker, rng, userProfile, date);
  ensureDinnerFat(meal, eligibleIngredients);
  recomputeMealTotals(meal);
  return meal;
}

function setItemPortion(item, portionG) {
  item.portionG = Math.round(portionG);
  const macros = macrosForPortion(item, item.portionG);
  item.calories = macros.calories;
  item.protein = macros.protein;
  item.carbs = macros.carbs;
  item.fat = macros.fat;
  item.fiber = macros.fiber;
}

function adjustItemPortion(item, ratio, options = {}) {
  const bounds = getPortionBounds(item.category);
  const maxPortion = options.allowAboveMax ? Number.POSITIVE_INFINITY : bounds.max;
  const nextPortion = Math.round(Math.max(bounds.min, Math.min(maxPortion, item.portionG * ratio)));
  if (nextPortion === item.portionG) return;

  setItemPortion(item, nextPortion);
}

function adjustMacros(meals, dailyCalTarget, dailyProteinTarget, dailyCarbTarget = null, dailyFatTarget = null) {
  const actualCal = meals.reduce((sum, meal) => sum + (meal.totalCalories || 0), 0);
  const actualProtein = meals.reduce((sum, meal) => sum + (meal.totalMacros?.protein || 0), 0);
  const actualCarbs = meals.reduce((sum, meal) => sum + (meal.totalMacros?.carbs || 0), 0);
  const actualFat = meals.reduce((sum, meal) => sum + (meal.totalMacros?.fat || 0), 0);
  const calRatio = dailyCalTarget / (actualCal || 1);
  const proteinRatio = dailyProteinTarget / (actualProtein || 1);
  const carbRatio = dailyCarbTarget ? dailyCarbTarget / (actualCarbs || 1) : calRatio;
  const fatRatio = dailyFatTarget ? dailyFatTarget / (actualFat || 1) : calRatio;

  if (
    Math.abs(calRatio - 1) < 0.1
    && Math.abs(proteinRatio - 1) < 0.15
    && Math.abs(carbRatio - 1) < 0.15
    && Math.abs(fatRatio - 1) < 0.15
  ) {
    return meals;
  }

  const boundedProteinRatio = Math.max(0.75, Math.min(1.35, proteinRatio));
  const boundedCalRatio = Math.max(0.75, Math.min(1.35, calRatio));
  const boundedCarbRatio = Math.max(0.75, Math.min(1.35, carbRatio));
  const boundedFatRatio = Math.max(0.75, Math.min(1.35, fatRatio));

  for (const meal of meals) {
    if (!['breakfast', 'lunch', 'dinner', 'post_workout', 'pre_workout', 'snack'].includes(meal.mealType)) continue;

    for (const item of meal.ingredients) {
      if (['protein_animal', 'protein_plant', 'legume', 'egg', 'dairy', 'dairy_alt', 'supplement'].includes(item.category)) {
        adjustItemPortion(item, boundedProteinRatio);
      } else if (['grain', 'fruit'].includes(item.category)) {
        adjustItemPortion(item, dailyCarbTarget ? boundedCarbRatio : boundedCalRatio);
      } else if (['fat', 'nut_seed'].includes(item.category)) {
        adjustItemPortion(item, dailyFatTarget ? boundedFatRatio : boundedCalRatio);
      }
    }

    recomputeMealTotals(meal);
  }

  return meals;
}

function proteinFloorForMeal(userProfile = {}) {
  const perKg = Number(MEAL_FLOORS.protein_per_meal_g_per_kg || 0.3);
  const weightKg = Number(userProfile.weightKg || userProfile.weight || userProfile.currentWeight || 0);
  if (!Number.isFinite(perKg) || perKg <= 0 || !Number.isFinite(weightKg) || weightKg <= 0) return 0;
  return Math.round(weightKg * perKg * 10) / 10;
}

function isProteinFloorItem(item) {
  return ['protein_animal', 'protein_plant', 'legume', 'egg', 'dairy', 'dairy_alt', 'supplement']
    .includes(item.category);
}

function proteinDensity(item) {
  return Math.max(0, Number(item.protein_g || 0));
}

function enforceProteinFloors(meals, userProfile = {}) {
  const floorG = proteinFloorForMeal(userProfile);
  if (floorG <= 0) return meals;

  for (const meal of meals) {
    if (!['lunch', 'dinner'].includes(meal.mealType)) continue;

    const currentProtein = Number(meal.totalMacros?.protein || 0);
    if (currentProtein >= floorG) continue;

    const proteinItems = meal.ingredients.filter(isProteinFloorItem);
    if (proteinItems.length === 0) {
      console.warn(`[mealEngine] Protein floor unmet for ${meal.mealType}: no protein item available`);
      continue;
    }

    const boundedRatio = floorG / Math.max(currentProtein, 1);
    for (const item of proteinItems) {
      adjustItemPortion(item, boundedRatio);
    }
    recomputeMealTotals(meal);

    const afterBoundedProtein = Number(meal.totalMacros?.protein || 0);
    if (afterBoundedProtein >= floorG) continue;

    const strongestProtein = [...proteinItems]
      .sort((a, b) => proteinDensity(b) - proteinDensity(a))[0];

    const proteinPerGram = proteinDensity(strongestProtein) / 100;
    if (proteinPerGram <= 0) {
      console.warn(`[mealEngine] Protein floor unmet for ${meal.mealType}: protein density unavailable`);
      continue;
    }

    const missingProtein = floorG - afterBoundedProtein;
    const extraGrams = Math.ceil(missingProtein / proteinPerGram);
    setItemPortion(strongestProtein, strongestProtein.portionG + extraGrams);
    recomputeMealTotals(meal);
  }

  return meals;
}

function enforceMainMealDistributionFloors(meals, userProfile = {}) {
  const vegetableFloorG = mainMealVegetableFloor(userProfile);
  const fiberFloorG = mainMealFiberFloor(userProfile);
  const dinnerFatFloorG = dinnerFatFloor(userProfile);

  for (const meal of meals) {
    if (!['lunch', 'dinner'].includes(meal.mealType)) continue;

    if (vegetableFloorG > 0 && vegetableGramsForMeal(meal) < vegetableFloorG) {
      const vegetableItems = meal.ingredients.filter(isVegetableFloorItem);
      if (vegetableItems.length === 0) {
        console.warn(`[mealEngine] Vegetable floor unmet for ${meal.mealType}: no vegetable item available`);
      } else {
        const currentVegetableG = Math.max(vegetableGramsForMeal(meal), 1);
        const ratio = vegetableFloorG / currentVegetableG;
        for (const item of vegetableItems) adjustItemPortion(item, ratio);
        recomputeMealTotals(meal);
      }
    }

    if (fiberFloorG > 0 && Number(meal.totalMacros?.fiber || 0) < fiberFloorG) {
      const fiberItems = meal.ingredients
        .filter(isFiberFloorItem)
        .sort((a, b) => Number(b.fiber_g || 0) - Number(a.fiber_g || 0));
      const strongestFiber = fiberItems[0];
      const fiberPerGram = Number(strongestFiber?.fiber_g || 0) / 100;
      if (!strongestFiber || fiberPerGram <= 0) {
        console.warn(`[mealEngine] Fiber floor unmet for ${meal.mealType}: no high-fiber item available`);
      } else {
        const missingFiber = fiberFloorG - Number(meal.totalMacros?.fiber || 0);
        const extraGrams = Math.ceil(missingFiber / fiberPerGram);
        setItemPortion(strongestFiber, strongestFiber.portionG + extraGrams);
        recomputeMealTotals(meal);
      }
    }

    if (meal.mealType === 'dinner' && dinnerFatFloorG > 0 && Number(meal.totalMacros?.fat || 0) < dinnerFatFloorG) {
      const fatItems = meal.ingredients
        .filter(isDinnerFatFloorItem)
        .sort((a, b) => Number(b.fat_g || 0) - Number(a.fat_g || 0));
      const strongestFat = fatItems[0];
      const fatPerGram = Number(strongestFat?.fat_g || 0) / 100;
      if (!strongestFat || fatPerGram <= 0) {
        console.warn('[mealEngine] Dinner fat floor unmet: no fat item available');
      } else {
        const missingFat = dinnerFatFloorG - Number(meal.totalMacros?.fat || 0);
        const extraGrams = Math.ceil(missingFat / fatPerGram);
        setItemPortion(strongestFat, strongestFat.portionG + extraGrams);
        recomputeMealTotals(meal);
      }
    }
  }

  return meals;
}

function buildMealFloorAudit(meals, userProfile = {}) {
  const proteinFloorG = proteinFloorForMeal(userProfile);
  const vegetableFloorG = mainMealVegetableFloor(userProfile);
  const fiberFloorG = mainMealFiberFloor(userProfile);
  const dinnerFatFloorG = dinnerFatFloor(userProfile);

  return meals
    .filter((meal) => ['lunch', 'dinner'].includes(meal.mealType))
    .map((meal) => {
      const proteinG = Number(meal.totalMacros?.protein || 0);
      const fiberG = Number(meal.totalMacros?.fiber || 0);
      const fatG = Number(meal.totalMacros?.fat || 0);
      const vegetableG = vegetableGramsForMeal(meal);
      const checks = {
        protein: proteinFloorG <= 0 || proteinG >= proteinFloorG,
        fiber: fiberFloorG <= 0 || fiberG >= fiberFloorG,
        vegetables: vegetableFloorG <= 0 || vegetableG >= vegetableFloorG,
        dinnerFat: meal.mealType !== 'dinner' || dinnerFatFloorG <= 0 || fatG >= dinnerFatFloorG,
      };

      return {
        mealType: meal.mealType,
        proteinG: Math.round(proteinG * 10) / 10,
        proteinFloorG,
        fiberG: Math.round(fiberG * 10) / 10,
        fiberFloorG,
        vegetableG,
        vegetableFloorG,
        fatG: Math.round(fatG * 10) / 10,
        dinnerFatFloorG: meal.mealType === 'dinner' ? dinnerFatFloorG : null,
        passed: Object.values(checks).every(Boolean),
        checks,
      };
    });
}

function buildDaySummary(meals) {
  const summary = meals.reduce((acc, meal) => {
    acc.totalCalories += meal.totalCalories || 0;
    acc.totalProtein += meal.totalMacros?.protein || 0;
    acc.totalCarbs += meal.totalMacros?.carbs || 0;
    acc.totalFat += meal.totalMacros?.fat || 0;
    return acc;
  }, { totalCalories: 0, totalProtein: 0, totalCarbs: 0, totalFat: 0 });

  return {
    totalCalories: Math.round(summary.totalCalories),
    totalProtein: Math.round(summary.totalProtein * 10) / 10,
    totalCarbs: Math.round(summary.totalCarbs * 10) / 10,
    totalFat: Math.round(summary.totalFat * 10) / 10,
  };
}

async function generateDayPlan(pool, userProfile, targetDate) {
  const date = targetDate || new Date().toISOString().split('T')[0];
  const { allergenCols, pathologyCols } = parseRestrictions(userProfile.allergiesText);
  const dietCol = DIET_COL[normalizeToken(userProfile.dietaryStyle)] || 'compatible_omnivore';
  const dailyCal = Number(userProfile.dailyCalorieTarget || 2000);
  const dailyProtein = Number(userProfile.dailyProteinTarget || Math.round((dailyCal * 0.25) / 4));
  const dailyCarbs = Number(userProfile.dailyCarbTarget || 0) || null;
  const dailyFat = Number(userProfile.dailyFatTarget || 0) || null;
  const breakfastPref = getBreakfastPreference(userProfile);
  const breakfastChoice = getBreakfastChoice(userProfile);
  const skipBreakfast = shouldSkipBreakfast(userProfile);
  const breakfastStyle = effectiveBreakfastStyle(userProfile);
  const rng = createRng(`${userProfile.userId || 'anonymous'}:${date}:${userProfile.trainingTime || 'rest'}:${breakfastChoice || breakfastPref}`);
  const userPathologies = normalizeUserPathologies(userProfile.pathologies || []);
  const engineProfile = {
    ...userProfile,
    hasDiabeticNeed: pathologyCols.includes('ok_diabetic') || userPathologies.includes('diabetic'),
  };

  const eligibleIngredients = await loadEligibleIngredients(pool, dietCol, allergenCols);
  const safeIngredients = applyPathologyFilter(eligibleIngredients, userPathologies);
  const pathologyFilter = calcPathologyExclusions(eligibleIngredients, userPathologies);
  const trainingToday = isTrainingDay(userProfile, date);
  const mealTypes = trainingToday
    ? buildDayStructure(userProfile.trainingTime, { skipBreakfast })
    : buildDayStructure(null, { skipBreakfast });
  const totalFraction = mealTypes.reduce((sum, mealType) => sum + (CALORIE_FRACTIONS[mealType] || 0.1), 0);
  const dayTracker = buildVarietyTracker();
  const meals = [];

  for (const mealType of mealTypes) {
    const fraction = (CALORIE_FRACTIONS[mealType] || 0.1) / totalFraction;
    const mealCalories = Math.round(dailyCal * fraction);
    const meal = await composeMeal(
      pool,
      mealType,
      mealCalories,
      safeIngredients,
      eligibleIngredients,
      userPathologies,
      dayTracker,
      rng,
      engineProfile,
      date
    );
    meals.push(meal);
  }

  const adjustedMeals = enforceMainMealDistributionFloors(
    enforceProteinFloors(
      adjustMacros(meals, dailyCal, dailyProtein, dailyCarbs, dailyFat),
      engineProfile
    ),
    engineProfile
  );

  return {
    userId: userProfile.userId,
    date,
    isTrainingDay: trainingToday,
    targetCalories: dailyCal,
    targetProtein: dailyProtein,
    targetCarbs: dailyCarbs,
    targetFat: dailyFat,
    breakfast: {
      preference: breakfastPref,
      choice: breakfastChoice,
      skipped: skipBreakfast,
      style: breakfastStyle,
      reason: breakfastChoice ? (userProfile.breakfastChoiceReason || 'breakfast_choice') : null,
    },
    proteinFloor: {
      lunchDinnerG: proteinFloorForMeal(engineProfile),
      source: 'config/meal-floors.js',
    },
    mealFloors: {
      proteinPerMainMealG: proteinFloorForMeal(engineProfile),
      mainMealFiberG: mainMealFiberFloor(engineProfile),
      mainMealVegetableG: mainMealVegetableFloor(engineProfile),
      dinnerFatG: dinnerFatFloor(engineProfile),
      source: 'config/meal-floors.js',
      status: 'provisional_da_validare_col_nutrizionista',
    },
    mealFloorAudit: buildMealFloorAudit(adjustedMeals, engineProfile),
    meals: adjustedMeals,
    daySummary: buildDaySummary(adjustedMeals),
    gi_summary: calcDailyGiSummary(adjustedMeals),
    pathology_filter: pathologyFilter,
    eligibleIngredientsCount: eligibleIngredients.length,
    restrictionsApplied: {
      allergenCols,
      pathologyCols,
    },
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { generateDayPlan, giScore, calcDailyGiSummary, applyPathologyFilter, calcPathologyExclusions };
