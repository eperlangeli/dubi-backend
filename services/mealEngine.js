'use strict';

/**
 * DUBI Meal Engine v2
 * Generates a personalized daily meal plan from the ingredients table.
 * No OpenAI dependency: pure nutritional logic.
 */

const { MEAL_FLOORS } = require('../config/meal-floors');
const { WORKOUT_NUTRITION } = require('../config/workout-nutrition');
const { PLATE_STRUCTURE } = require('../config/plate-structure');
const { MEAL_GRAMMAR } = require('../config/meal-grammar');
const { MEAL_ASSEMBLY } = require('../config/meal-assembly');
const { SEASONALITY } = require('../config/seasonality');

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

function normalizeWorkoutTimeSlot(value) {
  if (value === undefined || value === null || value === '') return null;
  const token = normalizeToken(value).replace(/[\s-]+/g, '_');
  if (!token) return null;
  return WORKOUT_NUTRITION.timeSlotAliases[token]
    || (WORKOUT_NUTRITION.allowedTimeSlots.includes(token) ? token : null);
}

function normalizeWorkoutSportGroup(userProfile = {}) {
  const explicit = normalizeToken(userProfile.trainingSportGroup || userProfile.workoutSportGroup).replace(/\s+/g, '_');
  if (explicit) return explicit;

  const groups = Array.isArray(userProfile.sportGroups)
    ? userProfile.sportGroups
    : normalizeList(userProfile.sportGroup || userProfile.sport_profile || userProfile.sportProfile);
  const normalized = groups.map((group) => normalizeToken(group).replace(/\s+/g, '_')).filter(Boolean);
  const unique = [...new Set(normalized)];
  if (unique.length > 1) return 'mixed';
  return unique[0] || normalizeToken(userProfile.sportGroup).replace(/\s+/g, '_') || 'none';
}

function getWorkoutSportModifier(userProfile = {}) {
  const sportGroup = normalizeWorkoutSportGroup(userProfile);
  return WORKOUT_NUTRITION.sportModifiers[sportGroup]
    || WORKOUT_NUTRITION.sportModifiers.mixed
    || WORKOUT_NUTRITION.sportModifiers.none;
}

function resolveWorkoutNutritionContext(userProfile = {}) {
  const sportsList = Array.isArray(userProfile.sports)
    ? userProfile.sports
    : normalizeList(userProfile.sports);
  const explicitSlot = normalizeWorkoutTimeSlot(
    userProfile.trainingTimeSlot
      ?? userProfile.training_time_slot
      ?? userProfile.timeSlot
      ?? userProfile.trainingTime
      ?? userProfile.training_time
  );
  const planned = userProfile.trainingPlanned === true;
  const performed = userProfile.trainingPerformed === true
    || ['confirmed_yes', 'detected_wearable'].includes(normalizeToken(userProfile.trainingStatus));
  const missed = userProfile.trainingMissed === true
    || normalizeToken(userProfile.trainingStatus) === 'confirmed_no';
  const shouldFuelTraining = !missed && (performed || planned || Boolean(explicitSlot && explicitSlot !== 'unset'));
  const timeSlot = shouldFuelTraining
    ? (explicitSlot || (planned || performed ? 'unset' : null))
    : null;
  const config = timeSlot
    ? WORKOUT_NUTRITION.timeSlots[timeSlot] || WORKOUT_NUTRITION.timeSlots.unset
    : null;
  const sportGroup = normalizeWorkoutSportGroup(userProfile);
  const sportModifier = getWorkoutSportModifier(userProfile);
  const hasResolvedOverride = typeof userProfile.trainingResolved === 'boolean';
  const defaultedOverride = userProfile.trainingDefaulted === true
    || userProfile.training_time_defaulted === true
    || userProfile.trainingDefaultedFromOnboarding === true;

  return {
    active: Boolean(timeSlot && config),
    timeSlot,
    rawTimeSlot: explicitSlot,
    resolved: hasResolvedOverride ? userProfile.trainingResolved : Boolean(config?.resolved),
    defaulted: defaultedOverride || timeSlot === 'unset',
    config,
    sport: userProfile.trainingSport || userProfile.sport || sportsList[0] || null,
    sportGroup,
    sportModifier,
  };
}

function normalizeBreakfastPref(value) {
  const pref = normalizeToken(value);
  if (['none', 'skip', 'no', 'nessuna', 'nessuno', 'senza colazione', 'no breakfast'].includes(pref)) {
    return 'none';
  }
  if (['variable', 'variabile', 'daily', 'giornaliera', 'giornaliero', 'mattina', 'day by day', 'choose daily'].includes(pref)) {
    return 'variable';
  }
  if (['dolce', 'sweet'].includes(pref)) return 'sweet';
  if (['salata', 'salato', 'savory', 'savoury'].includes(pref)) return 'savory';
  if (['both', 'entrambi', 'entrambe', 'mixed', 'mista', 'misto'].includes(pref)) return 'both';
  return 'both';
}

function normalizeBreakfastChoice(value) {
  const choice = normalizeToken(value);
  if (['dolce', 'sweet'].includes(choice)) return 'sweet';
  if (['salata', 'salato', 'savory', 'savoury'].includes(choice)) return 'savory';
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
  if (choice === 'sweet' || choice === 'savory') return choice;

  const pref = getBreakfastPreference(userProfile);
  if (pref === 'sweet' || pref === 'savory') return pref;
  if (pref === 'none') return null;

  // "variable" means no fixed style until the daily frontend choice arrives.
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
  const workoutContext = options.workoutContext || resolveWorkoutNutritionContext({ trainingTime });
  if (!workoutContext.active) return withoutBreakfastIfNeeded(base, options);

  const structure = workoutContext.config?.structure || base;
  return withoutBreakfastIfNeeded([...structure], options);
}

function isTrainingDay(userProfile, targetDate) {
  if (userProfile.trainingMissed === true || normalizeToken(userProfile.trainingStatus) === 'confirmed_no') return false;
  if (
    userProfile.trainingPlanned === true
    || userProfile.trainingPerformed === true
    || ['confirmed_yes', 'detected_wearable'].includes(normalizeToken(userProfile.trainingStatus))
  ) {
    return true;
  }

  const explicitDays = normalizeList(userProfile.trainingDays);
  if (explicitDays.length > 0) {
    const weekday = new Date(targetDate).toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    return explicitDays.includes(weekday) || explicitDays.includes(normalizeToken(weekday));
  }

  return Number(userProfile.workoutDays || 0) > 0 && Boolean(userProfile.trainingTime);
}

function getMealFraction(mealType, workoutContext = null) {
  const fractionSet = workoutContext?.active
    ? WORKOUT_NUTRITION.mealFractions[workoutContext.timeSlot]
    : WORKOUT_NUTRITION.mealFractions.rest;
  return Number(fractionSet?.[mealType] || WORKOUT_NUTRITION.mealFractions.rest?.[mealType] || 0.1);
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

function positiveConfigNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function isDenseVegetableIngredient(ingredient = {}) {
  if (ingredient.category !== 'vegetable') return false;
  const kcal = Number(ingredient.calories_per_100g || 0);
  const carbs = Number(ingredient.carbs_g || 0);
  const kcalThreshold = positiveConfigNumber(MEAL_FLOORS.dense_vegetable_max_calories_per_100g, 120);
  const carbsThreshold = positiveConfigNumber(MEAL_FLOORS.dense_vegetable_max_carbs_per_100g, 20);
  return kcal > kcalThreshold || carbs > carbsThreshold;
}

function getPortionBoundsForIngredient(ingredient = {}) {
  const bounds = getPortionBounds(ingredient.category);
  if (!isDenseVegetableIngredient(ingredient)) return bounds;

  const max = positiveConfigNumber(MEAL_FLOORS.dense_vegetable_max_portion_g, 40);
  const typical = Math.min(max, positiveConfigNumber(MEAL_FLOORS.dense_vegetable_typical_portion_g, 25));

  return {
    min: Math.min(bounds.min, typical),
    max: Math.min(bounds.max, max),
    typical,
  };
}

function calcPortion(ingredient, targetCalories) {
  const bounds = getPortionBoundsForIngredient(ingredient);
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
  return /\bfish\b|pesce|salmone|tonno|merluzzo|nasello|orata|branzino|sardine|sardina|sgombro|alici|acciughe|aringa|trota|platessa|sogliola|gamberi|gambero|calamari|calamaro|polpo/.test(text);
}

function isProcessedMeat(ingredient) {
  const text = `${ingredient.subcategory || ''} ${ingredient.name || ''}`.toLowerCase();
  return /processed_meat|cured_meat|deli_meat|sausage|affettat|bresaola|prosciutto|salame|fesa|speck|mortadella|wurstel|salsiccia|bacon|pancetta|nuggets|hamburger industriale|arrosto confezionato|impanata|precotta|carne in scatola/.test(text);
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

function ingredientText(ingredient = {}) {
  return normalizeToken([
    ingredient.category,
    ingredient.subcategory,
    ingredient.name,
    ingredient.name_en,
    ...normalizeDbArray(ingredient.health_tags),
  ].filter(Boolean).join(' '));
}

function isRapidCarbIngredient(ingredient = {}) {
  const text = ingredientText(ingredient);
  const gi = Number(ingredient.gi_numeric);
  return (
    (Number.isFinite(gi) && gi >= WORKOUT_NUTRITION.giRules.mediumGiMin)
    || WORKOUT_NUTRITION.rapidCarbPatterns.some((pattern) => text.includes(normalizeToken(pattern)))
  );
}

function isCarbSlot(slot, ingredient = {}) {
  return ['carb', 'fruit'].includes(slot)
    || ['grain', 'fruit'].includes(ingredient.category);
}

function isFatHeavyIngredient(ingredient = {}, maxFatG = WORKOUT_NUTRITION.giRules.lowFatNearWorkoutMaxG) {
  return Number(ingredient.fat_g || 0) > maxFatG
    || ['fat', 'nut_seed'].includes(ingredient.category);
}

function isCompleteWorkoutPreMeal(mealType, workoutContext = null) {
  return Boolean(workoutContext?.active && workoutContext.config?.mainPreMeal === mealType);
}

function applyWorkoutCandidateRules(candidates, mealType, slot, userProfile = {}) {
  if (!Array.isArray(candidates) || candidates.length === 0) return candidates;
  const workoutContext = userProfile.workoutNutritionContext || resolveWorkoutNutritionContext(userProfile);
  if (!workoutContext.active) return candidates;

  if (mealType === 'pre_workout') {
    if (isCarbSlot(slot)) {
      const rapid = candidates.filter((ingredient) => isRapidCarbIngredient(ingredient));
      if (rapid.length > 0) return rapid;
    }
    const lowFat = candidates.filter((ingredient) => !isFatHeavyIngredient(ingredient, workoutContext.config?.preWorkout?.maxFatG));
    return lowFat.length > 0 ? lowFat : candidates;
  }

  if (mealType === 'post_workout') {
    if (isCarbSlot(slot)) {
      const mediumHigh = candidates.filter((ingredient) => isRapidCarbIngredient(ingredient));
      if (mediumHigh.length > 0) return mediumHigh;
    }
    const lowerFat = candidates.filter((ingredient) => !isFatHeavyIngredient(ingredient, WORKOUT_NUTRITION.giRules.moderateFatNearWorkoutMaxG));
    return lowerFat.length > 0 ? lowerFat : candidates;
  }

  if (isCompleteWorkoutPreMeal(mealType, workoutContext) && isCarbSlot(slot)) {
    const mediumLowGi = candidates.filter((ingredient) => {
      const gi = Number(ingredient.gi_numeric);
      return !Number.isFinite(gi) || gi <= WORKOUT_NUTRITION.giRules.completeMealMaxGi;
    });
    return mediumLowGi.length > 0 ? mediumLowGi : candidates;
  }

  if (!WORKOUT_NUTRITION.giRules.rapidCarbMealTypes.includes(mealType) && isCarbSlot(slot)) {
    const withoutRapidOnly = candidates.filter((ingredient) => !isRapidCarbIngredient(ingredient));
    return withoutRapidOnly.length > 0 ? withoutRapidOnly : candidates;
  }

  return candidates;
}

function breakfastIngredientText(ingredient) {
  return ingredientText(ingredient);
}

function matchesBreakfastStyle(ingredient, style) {
  const text = breakfastIngredientText(ingredient);
  if (style === 'sweet') {
    return /frutta|fruit|banana|mela|pera|fragol|mirtill|berry|berries|avena|oat|muesli|granola|yogurt|skyr|kefir|latte|milk|cacao|cocoa|miele|honey|marmellata|jam|pane|toast|ricotta|fiocchi di latte|cottage/.test(text);
  }
  if (style === 'savory') {
    return /uov|egg|album|avocado|bresaola|tofu|ricotta|fiocchi di latte|cottage|pane|toast|verdura|vegetable|pomodor|spinaci|rucola/.test(text);
  }
  return true;
}

function applyBreakfastStylePreference(candidates, mealType, userProfile) {
  if (mealType !== 'breakfast') return candidates;

  const style = effectiveBreakfastStyle(userProfile);
  if (style !== 'sweet' && style !== 'savory') return candidates;

  const preferred = candidates.filter((ingredient) => matchesBreakfastStyle(ingredient, style));
  return preferred.length > 0 ? preferred : candidates;
}

function inferBreakfastStyleFromMeal(meal, userProfile = {}) {
  const explicitStyle = effectiveBreakfastStyle(userProfile);
  if (explicitStyle === 'sweet' || explicitStyle === 'savory') return explicitStyle;

  let sweetScore = 0;
  let savoryScore = 0;
  for (const ingredient of meal.ingredients || []) {
    if (matchesBreakfastStyle(ingredient, 'sweet')) sweetScore += 1;
    if (matchesBreakfastStyle(ingredient, 'savory')) savoryScore += 1;
  }

  return savoryScore > sweetScore ? 'savory' : 'sweet';
}

function annotateBreakfastStyle(meal, userProfile = {}) {
  if (!meal || meal.mealType !== 'breakfast' || meal.error) return meal;
  const style = inferBreakfastStyleFromMeal(meal, userProfile);
  meal.breakfast_style = style;
  meal.breakfastStyle = style;
  return meal;
}

function normalizeDietaryPattern(userProfile = {}) {
  const diet = normalizeToken(userProfile.dietaryStyle || userProfile.diet || 'omnivore');
  if (['vegan', 'vegano', 'vegana'].includes(diet)) return 'vegan';
  if (['vegetarian', 'vegetariano', 'vegetariana'].includes(diet)) return 'vegetarian';
  if (['pescatarian', 'pescetariano', 'pescetariana'].includes(diet)) return 'pescatarian';
  return 'omnivore';
}

function isMainMeal(mealType) {
  return PLATE_STRUCTURE.mainMeals.includes(mealType);
}

function matchesAnyPattern(item = {}, patterns = []) {
  const text = ingredientText(item);
  return patterns.some((pattern) => text.includes(normalizeToken(pattern)));
}

function textMatchesPatterns(text, patterns = []) {
  const normalizedText = normalizeToken(text);
  return patterns.some((pattern) => normalizedText.includes(normalizeToken(pattern)));
}

function itemHasAnyPattern(item = {}, patterns = []) {
  return textMatchesPatterns(ingredientText(item), patterns);
}

function isSeasonalityProduce(item = {}) {
  return SEASONALITY.categoriesRequiringSeasonality.includes(item.category);
}

function normalizeSeasonalityMode(userProfile = {}) {
  const rawMode = normalizeToken(userProfile.seasonalityMode || userProfile.seasonality_mode || SEASONALITY.defaultMode)
    .replace(/\s+/g, '_');
  return SEASONALITY.allowedModes.includes(rawMode) ? rawMode : SEASONALITY.defaultMode;
}

function userSeasonalityLocation(userProfile = {}) {
  return {
    country: String(userProfile.country || userProfile.locationCountry || userProfile.countryCode || SEASONALITY.defaultLocation.country).toUpperCase(),
    region: String(userProfile.region || userProfile.locationRegion || SEASONALITY.defaultLocation.region),
    hemisphere: userProfile.hemisphere || SEASONALITY.defaultLocation.hemisphere,
    climateArea: userProfile.climateArea || userProfile.climate_area || SEASONALITY.defaultLocation.climateArea
  };
}

function planMonth(targetDate) {
  const parsed = new Date(`${targetDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return new Date().getUTCMonth() + 1;
  return parsed.getUTCMonth() + 1;
}

function monthInRange(month, startMonth, endMonth) {
  const start = Number(startMonth);
  const end = Number(endMonth);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  if (start <= end) return month >= start && month <= end;
  return month >= start || month <= end;
}

function monthAllowedByRule(rule = {}, month) {
  if (Array.isArray(rule.months)) return rule.months.map(Number).includes(Number(month));
  if (rule.start_month || rule.end_month) return monthInRange(month, rule.start_month, rule.end_month);
  if (rule.startMonth || rule.endMonth) return monthInRange(month, rule.startMonth, rule.endMonth);
  return false;
}

function regionAllowedByRule(rule = {}, location = {}) {
  const ruleRegions = rule.regions || rule.region || ['all'];
  const regions = Array.isArray(ruleRegions) ? ruleRegions : [ruleRegions];
  const normalizedRegions = regions.map((region) => normalizeToken(region));
  return normalizedRegions.includes('all') || normalizedRegions.includes(normalizeToken(location.region));
}

function countryAllowedByRule(rule = {}, location = {}) {
  const country = String(rule.country || '').toUpperCase();
  if (country && country !== String(location.country || '').toUpperCase()) return false;
  return true;
}

function normalizeSeasonalityRules(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;

  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return [];
    }
  }

  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    return Object.entries(parsed).map(([country, rules]) => ({
      country,
      ...(rules || {})
    }));
  }

  return [];
}

function defaultSeasonalityRulesForIngredient(item = {}) {
  return SEASONALITY.defaultProduceRules
    .filter((rule) => rule.category === item.category && itemHasAnyPattern(item, rule.patterns));
}

function isNaturalFrozenItem(item = {}) {
  const freshness = normalizeToken(item.freshness_form || item.freshnessForm);
  if (['frozen', 'frozen_natural', 'surgelato_naturale'].includes(freshness)) return true;
  const text = ingredientText(item);
  return /surgelat|frozen/.test(text) && !/condit|sauce|crema|panna|butter/.test(text);
}

function isIngredientInSeason(item = {}, targetDate, location = userSeasonalityLocation()) {
  if (!isSeasonalityProduce(item)) {
    return { eligible: true, reason: 'not_produce' };
  }

  const month = planMonth(targetDate);
  const rules = [
    ...normalizeSeasonalityRules(item.seasonality),
    ...defaultSeasonalityRulesForIngredient(item)
  ];

  const matched = rules.find((rule) =>
    countryAllowedByRule(rule, location)
    && regionAllowedByRule(rule, location)
    && monthAllowedByRule(rule, month)
  );

  if (matched) return { eligible: true, reason: 'fresh_in_season', month };
  if (isNaturalFrozenItem(item)) return { eligible: true, reason: 'frozen_natural_fallback', month };

  return {
    eligible: false,
    reason: rules.length > 0 ? 'out_of_season' : 'unknown_seasonality',
    month
  };
}

function applySeasonalityFilter(ingredients = [], targetDate, userProfile = {}) {
  const mode = normalizeSeasonalityMode(userProfile);
  const location = userSeasonalityLocation(userProfile);
  if (mode === 'off') {
    return {
      ingredients,
      audit: {
        version: SEASONALITY.version,
        source: SEASONALITY.source,
        status: SEASONALITY.status,
        mode,
        location,
        applied: false,
        totalProduce: ingredients.filter(isSeasonalityProduce).length,
        excludedProduce: 0,
        excluded: []
      }
    };
  }

  const included = [];
  const excluded = [];

  for (const ingredient of ingredients) {
    if (!isSeasonalityProduce(ingredient)) {
      included.push(ingredient);
      continue;
    }

    const result = isIngredientInSeason(ingredient, targetDate, location);
    if (result.eligible) {
      included.push(ingredient);
      continue;
    }

    if (mode === 'seasonal_preferred' && result.reason === 'out_of_season') {
      included.push(ingredient);
      continue;
    }

    excluded.push({
      id: ingredient.id,
      name: ingredient.name,
      category: ingredient.category,
      reason: result.reason,
      month: result.month
    });
  }

  return {
    ingredients: included,
    audit: {
      version: SEASONALITY.version,
      source: SEASONALITY.source,
      status: SEASONALITY.status,
      mode,
      location,
      applied: true,
      totalProduce: ingredients.filter(isSeasonalityProduce).length,
      excludedProduce: excluded.length,
      unknownSeasonalityExcluded: excluded.filter((item) => item.reason === 'unknown_seasonality').length,
      outOfSeasonExcluded: excluded.filter((item) => item.reason === 'out_of_season').length,
      excluded: excluded.slice(0, 25)
    }
  };
}

function itemNutritionRole(item = {}) {
  const text = ingredientText(item);
  if (item.category === 'fruit') return 'fruit';
  if (item.category === 'vegetable' && isDenseVegetableIngredient(item)) return 'starchy_carb';
  if (item.category === 'vegetable') return 'non_starchy_vegetable';
  if (item.category === 'legume') return 'legume';
  if (item.category === 'grain') return 'carbohydrate';
  if (item.category === 'fat' || item.category === 'nut_seed') return 'fat';
  if (['protein_animal', 'protein_plant', 'egg', 'dairy', 'dairy_alt', 'supplement'].includes(item.category)) return 'protein';
  if (textMatchesPatterns(text, MEAL_GRAMMAR.carbohydrateStrategy.starchyFoods)) return 'carbohydrate';
  return 'other';
}

function isBresaolaItem(item = {}) {
  return itemHasAnyPattern(item, ['bresaola']);
}

function isSmokedFishItem(item = {}) {
  return isFishIngredient(item) && itemHasAnyPattern(item, MEAL_GRAMMAR.fish.excludePatterns);
}

function isForbiddenFatItem(item = {}) {
  return itemHasAnyPattern(item, MEAL_GRAMMAR.fats.excludedPatterns);
}

function isParmesanItem(item = {}) {
  return itemHasAnyPattern(item, ['parmigiano', 'parmesan']);
}

function isAgedCheeseStandardExcludedItem(item = {}) {
  if (isParmesanItem(item)) return false;
  return itemHasAnyPattern(item, MEAL_GRAMMAR.dairy.agedCheeseExcludedPatterns);
}

function isProcessedMeatExcludedItem(item = {}, mealType = null) {
  if (!isProcessedMeat(item) && !itemHasAnyPattern(item, MEAL_GRAMMAR.meat.excludedPatterns)) return false;
  if (!isBresaolaItem(item)) return true;

  const exception = MEAL_GRAMMAR.meat.processedException.bresaola;
  return !exception.allowed || !exception.contexts.includes(mealType);
}

function isStandardExcludedIngredient(item = {}, mealType = null) {
  if (isForbiddenFatItem(item)) return true;
  if (isAgedCheeseStandardExcludedItem(item)) return true;
  if (isSmokedFishItem(item)) return true;
  if (isProcessedMeatExcludedItem(item, mealType)) return true;
  if (itemHasAnyPattern(item, MEAL_GRAMMAR.pasta.forbiddenStandardPatterns)) return true;
  return false;
}

function filterWithFallback(candidates, predicate) {
  if (!Array.isArray(candidates) || candidates.length === 0) return candidates;
  const filtered = candidates.filter(predicate);
  return filtered.length > 0 ? filtered : candidates;
}

function isProteinCandidate(item = {}) {
  return itemNutritionRole(item) === 'protein'
    || hasSlot(item, 'protein')
    || item.slot === 'protein';
}

function isBreakfastProteinAllowed(item = {}, style = 'sweet') {
  const breakfastRules = MEAL_GRAMMAR.breakfast[style] || MEAL_GRAMMAR.breakfast.sweet;
  if (item.category === 'supplement' && !MEAL_GRAMMAR.breakfast.powdersAllowedByDefault) return false;
  if (itemHasAnyPattern(item, breakfastRules.excludedProteinPatterns)) return false;
  if (isSmokedFishItem(item)) return false;
  if (isProcessedMeatExcludedItem(item, 'breakfast')) return false;
  return itemHasAnyPattern(item, breakfastRules.allowedProteinPatterns);
}

function isBreakfastIngredientAllowed(item = {}, style = 'sweet', slot = null) {
  if (isStandardExcludedIngredient(item, 'breakfast') && !isBresaolaItem(item)) return false;
  if (isProteinCandidate(item) || slot === 'protein') return isBreakfastProteinAllowed(item, style);
  return matchesBreakfastStyle(item, style);
}

function isEasyCarbSnackItem(item = {}) {
  return itemHasAnyPattern(item, MEAL_GRAMMAR.snack.easyCarbPatterns) || isRapidCarbIngredient(item);
}

function isPreWorkoutIngredientAllowed(item = {}, slot = null) {
  if (isForbiddenFatItem(item) || itemHasAnyPattern(item, MEAL_GRAMMAR.workout.pre.excludedPatterns)) return false;
  if (slot === 'protein' || isProteinCandidate(item)) return false;
  if (isCarbSlot(slot, item) || item.category === 'fruit') return isEasyCarbSnackItem(item);
  return !isFatHeavyIngredient(item, MEAL_GRAMMAR.workout.pre.maxFatG);
}

function isPostWorkoutProteinAllowed(item = {}) {
  if (isStandardExcludedIngredient(item, 'post_workout')) return false;
  if (isForbiddenFatItem(item)) return false;
  return itemHasAnyPattern(item, MEAL_GRAMMAR.workout.post.allowedProteinPatterns)
    || (isProteinCandidate(item) && !isFatHeavyIngredient(item, MEAL_GRAMMAR.workout.post.maxFatG));
}

function isMainMealIngredientAllowed(item = {}, mealType = null) {
  if (isStandardExcludedIngredient(item, mealType)) return false;
  if (isBreakfastOnlyItem(item)) return false;
  return true;
}

function applyMealGrammarCandidateRules(candidates, meal, mealType, slot, userProfile = {}) {
  if (!Array.isArray(candidates) || candidates.length === 0) return candidates;

  let filtered = candidates.filter((ingredient) => !isStandardExcludedIngredient(ingredient, mealType));
  if (filtered.length === 0) return [];

  if (mealType === 'breakfast') {
    const style = effectiveBreakfastStyle(userProfile);
    if (style === 'sweet' || style === 'savory') {
      filtered = filtered.filter((ingredient) => isBreakfastIngredientAllowed(ingredient, style, slot));
    }
  }

  if (mealType === 'pre_workout') {
    filtered = filtered.filter((ingredient) => isPreWorkoutIngredientAllowed(ingredient, slot));
  }

  if (mealType === 'post_workout' && slot === 'protein') {
    filtered = filtered.filter(isPostWorkoutProteinAllowed);
  }

  if (isMainMeal(mealType)) {
    filtered = filtered.filter((ingredient) => isMainMealIngredientAllowed(ingredient, mealType));
    if (slot === 'protein') {
      filtered = filtered.filter((ingredient) => !isParmesanItem(ingredient));
    }
  }

  return filtered;
}

function itemTimings(item = {}) {
  return normalizeDbArray(item.meal_timing || item.mealTiming);
}

function itemSlots(item = {}) {
  return [...new Set([
    item.slot,
    ...normalizeDbArray(item.template_slots || item.templateSlots)
  ].filter(Boolean).map(normalizeToken))];
}

function hasSlot(item = {}, slot) {
  return itemSlots(item).includes(normalizeToken(slot));
}

function isBreakfastOnlyItem(item = {}) {
  if (matchesAnyPattern(item, PLATE_STRUCTURE.breakfastOnlyPatterns)) return true;

  const timings = itemTimings(item).map(normalizeToken);
  if (timings.length === 0) return false;
  const mainMealTimings = PLATE_STRUCTURE.mainMeals.map(normalizeToken);
  return timings.includes('breakfast') && !timings.some((timing) => mainMealTimings.includes(timing));
}

function isBreakfastHeavyMainMealItem(item = {}) {
  return matchesAnyPattern(item, PLATE_STRUCTURE.breakfastHeavyMainMealPatterns);
}

function isSweetFruitItem(item = {}) {
  return item.category === 'fruit' && matchesAnyPattern(item, PLATE_STRUCTURE.sweetFruitPatterns);
}

function isDairyIngredient(item = {}) {
  return item.category === 'dairy' || matchesAnyPattern(item, PLATE_STRUCTURE.dairyPatterns);
}

function isFishProteinItem(item = {}) {
  return isFishIngredient(item) || matchesAnyPattern(item, PLATE_STRUCTURE.fishPatterns);
}

function isPlateProteinCategory(item = {}) {
  return PLATE_STRUCTURE.proteinCategories.includes(item.category);
}

function isPlateMainProteinItem(item = {}, mealType = item.mealType) {
  return isMainMeal(mealType)
    && hasSlot(item, 'protein')
    && (isPlateProteinCategory(item) || Number(item.protein_g || 0) >= 8);
}

function isPlateMainCarbItem(item = {}, mealType = item.mealType) {
  if (!isMainMeal(mealType)) return false;
  if (!hasSlot(item, 'carb')) return false;
  if (isSweetFruitItem(item) || isBreakfastOnlyItem(item)) return false;
  return PLATE_STRUCTURE.carbCategories.includes(item.category) || Boolean(starchFamily(item));
}

function isPlateVegetableItem(item = {}, mealType = item.mealType) {
  return isMainMeal(mealType)
    && (PLATE_STRUCTURE.vegetableCategories.includes(item.category) || hasSlot(item, 'vegetable'));
}

function isPlateFatItem(item = {}, mealType = item.mealType) {
  return isMainMeal(mealType)
    && (
      PLATE_STRUCTURE.fatCategories.includes(item.category)
      || hasSlot(item, 'fat')
      || (Number(item.fat_g || 0) >= 10 && !isPlateMainProteinItem(item, mealType))
    );
}

function starchFamily(item = {}) {
  if (item.category === 'legume') return 'legume';
  const text = ingredientText(item);
  for (const [family, patterns] of Object.entries(PLATE_STRUCTURE.starchFamilies)) {
    if (patterns.some((pattern) => text.includes(normalizeToken(pattern)))) return family;
  }
  return item.category === 'grain' ? 'grain' : null;
}

function cuisineFamiliesForItem(item = {}) {
  const text = ingredientText(item);
  return Object.entries(PLATE_STRUCTURE.cuisineFamilies)
    .filter(([, patterns]) => patterns.some((pattern) => text.includes(normalizeToken(pattern))))
    .map(([family]) => family);
}

function cuisineFamiliesForMeal(meal = {}) {
  return [...new Set((meal.ingredients || []).flatMap(cuisineFamiliesForItem))];
}

function roleCount(meal, predicate) {
  return (meal.ingredients || []).filter((item) => predicate(item, meal.mealType)).length;
}

function plateRoleCounts(meal = {}) {
  return {
    mainProtein: roleCount(meal, isPlateMainProteinItem),
    mainCarb: roleCount(meal, isPlateMainCarbItem),
    vegetables: roleCount(meal, isPlateVegetableItem),
    fat: roleCount(meal, isPlateFatItem)
  };
}

function animalMainProteins(meal = {}) {
  return (meal.ingredients || []).filter((item) =>
    isPlateMainProteinItem(item, meal.mealType) && isAnimalProteinSource(item)
  );
}

function plateComponentScore(item = {}, role, userProfile = {}, mealType = item.mealType) {
  const validatedBonus = item.nutritionist_validated ? 5 : 0;
  if (role === 'mainProtein') {
    return proteinSourcePriorityWeight(item, {
      ...userProfile,
      currentMealType: mealType,
      currentSlot: 'protein'
    }) * 100 + proteinDensity(item) + validatedBonus;
  }
  if (role === 'mainCarb') {
    const familyBonus = starchFamily(item) ? 20 : 0;
    return familyBonus + Number(item.carbs_g || item.carbs || 0) + validatedBonus;
  }
  if (role === 'vegetables') {
    return Number(item.fiber_g || item.fiber || 0) * 10 + Number(item.portionG || 0) / 10 + validatedBonus;
  }
  if (role === 'fat') {
    return Number(item.fat_g || item.fat || 0) + validatedBonus;
  }
  return validatedBonus;
}

function keepBestPlateItems(meal, predicate, role, max, userProfile = {}) {
  const matches = (meal.ingredients || [])
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => predicate(item, meal.mealType));
  if (matches.length <= max) return false;

  const keepIndexes = new Set(matches
    .sort((a, b) =>
      plateComponentScore(b.item, role, userProfile, meal.mealType)
      - plateComponentScore(a.item, role, userProfile, meal.mealType)
      || Number(b.item.portionG || 0) - Number(a.item.portionG || 0)
    )
    .slice(0, max)
    .map(({ index }) => index));
  const removeIndexes = new Set(matches
    .filter(({ index }) => !keepIndexes.has(index))
    .map(({ index }) => index));

  meal.ingredients = meal.ingredients.filter((_, index) => !removeIndexes.has(index));
  return true;
}

function removePlateItems(meal, predicate) {
  const before = meal.ingredients.length;
  meal.ingredients = meal.ingredients.filter((item) => !predicate(item));
  return meal.ingredients.length !== before;
}

function candidatePlateItem(candidate = {}, slot) {
  return {
    ...candidate,
    slot,
    template_slots: candidate.template_slots || [slot]
  };
}

function candidateFitsCurrentPlate(candidate = {}, meal = {}, mealType, slot) {
  const candidateItem = candidatePlateItem(candidate, slot);

  if (isMainMeal(mealType)) {
    if (isBreakfastOnlyItem(candidateItem)) return false;
    if (isSweetFruitItem(candidateItem)) return false;
    if (isPlateMainProteinItem(candidateItem, mealType) && roleCount(meal, isPlateMainProteinItem) >= 1) return false;
    if (isPlateMainCarbItem(candidateItem, mealType) && roleCount(meal, isPlateMainCarbItem) >= 1) return false;
    if (isPlateVegetableItem(candidateItem, mealType) && roleCount(meal, isPlateVegetableItem) >= PLATE_STRUCTURE.required.vegetables.max) return false;
    if (isPlateFatItem(candidateItem, mealType) && roleCount(meal, isPlateFatItem) >= 1) return false;

    const existing = meal.ingredients || [];
    if (isFishProteinItem(candidateItem) && existing.some(isDairyIngredient)) return false;
    if (isDairyIngredient(candidateItem) && existing.some(isFishProteinItem)) return false;
    if (isAnimalProteinSource(candidateItem) && existing.some(isSweetFruitItem)) return false;
  }

  if (mealType === 'breakfast' && isBreakfastHeavyMainMealItem(candidateItem)) {
    return false;
  }

  return true;
}

function applyPlateCandidateRules(candidates, meal, mealType, slot) {
  if (!Array.isArray(candidates) || candidates.length === 0) return candidates;
  const filtered = candidates.filter((candidate) => candidateFitsCurrentPlate(candidate, meal, mealType, slot));
  return filtered.length > 0 ? filtered : candidates;
}

function plateFallbackCandidates(ingredients, meal, mealType, slot, predicate, userProfile = {}) {
  let candidates = filterBySlotAndTiming(ingredients, slot, mealType);
  if (candidates.length === 0) {
    candidates = ingredients.filter((ingredient) => normalizeDbArray(ingredient.template_slots).includes(slot));
  }

  candidates = candidates.filter((ingredient) => predicate(candidatePlateItem(ingredient, slot), mealType));
  candidates = applyPlateCandidateRules(candidates, meal, mealType, slot);

  if (slot === 'protein') {
    candidates = prioritizeProteinCandidatesForDiet(candidates, mealType, slot, {
      ...userProfile,
      currentMealType: mealType,
      currentSlot: slot
    });
  }

  return candidates;
}

function choosePlateFallback(ingredients, meal, slot, predicate, dayTracker, mealTracker, rng, userProfile, date, role) {
  const mealType = meal.mealType;
  const candidates = plateFallbackCandidates(ingredients, meal, mealType, slot, predicate, userProfile);
  if (candidates.length === 0) return null;

  const selectionProfile = {
    ...userProfile,
    currentMealType: mealType,
    currentSlot: slot
  };
  const seed = `${userProfile.userId || 'anonymous'}:${date}:${mealType}:${slot}:plate-structure`;
  return pickIngredient(candidates, dayTracker, mealTracker, rng, selectionProfile, seed)
    || [...candidates]
      .sort((a, b) =>
        plateComponentScore(candidatePlateItem(b, slot), role, selectionProfile, mealType)
        - plateComponentScore(candidatePlateItem(a, slot), role, selectionProfile, mealType)
        || String(a.name || '').localeCompare(String(b.name || ''))
      )[0]
    || null;
}

function addPlateFallbackItem(meal, ingredient, slot, mealCalorieTarget) {
  if (!ingredient) return false;
  const targetCalories = {
    protein: Math.round(Number(mealCalorieTarget || meal.totalCalories || 600) * 0.38),
    carb: Math.round(Number(mealCalorieTarget || meal.totalCalories || 600) * 0.32),
    vegetable: Math.max(60, Math.round(Number(mealCalorieTarget || meal.totalCalories || 600) * 0.08)),
    fat: Math.max(60, Math.round(Number(mealCalorieTarget || meal.totalCalories || 600) * 0.08))
  }[slot] || 120;

  meal.ingredients.push(buildPlanItem(ingredient, slot, calcPortion(ingredient, targetCalories)));
  recomputeMealTotals(meal);
  return true;
}

function removeForbiddenMainMealPairs(meal) {
  if (!isMainMeal(meal.mealType)) return false;
  let changed = false;

  changed = removePlateItems(meal, isBreakfastOnlyItem) || changed;

  if ((meal.ingredients || []).some(isAnimalProteinSource)) {
    changed = removePlateItems(meal, isSweetFruitItem) || changed;
  }

  if ((meal.ingredients || []).some(isFishProteinItem)) {
    changed = removePlateItems(meal, (item) => isDairyIngredient(item) && !isPlateMainProteinItem(item, meal.mealType)) || changed;
  }

  return changed;
}

function ensurePlateStructure(meal, eligibleIngredients, dayTracker, mealTracker, rng, userProfile, date, mealCalorieTarget) {
  if (!isMainMeal(meal.mealType)) return meal;

  for (let guard = 0; guard < 3; guard += 1) {
    let changed = false;
    changed = removeForbiddenMainMealPairs(meal) || changed;
    changed = keepBestPlateItems(meal, isPlateMainProteinItem, 'mainProtein', PLATE_STRUCTURE.required.mainProtein.max, userProfile) || changed;
    changed = keepBestPlateItems(meal, isPlateMainCarbItem, 'mainCarb', PLATE_STRUCTURE.required.mainCarb.max, userProfile) || changed;
    changed = keepBestPlateItems(meal, isPlateVegetableItem, 'vegetables', PLATE_STRUCTURE.required.vegetables.max, userProfile) || changed;
    changed = keepBestPlateItems(meal, isPlateFatItem, 'fat', PLATE_STRUCTURE.required.fat.max, userProfile) || changed;

    recomputeMealTotals(meal);

    if (roleCount(meal, isPlateMainProteinItem) < PLATE_STRUCTURE.required.mainProtein.min) {
      const protein = choosePlateFallback(
        eligibleIngredients,
        meal,
        'protein',
        isPlateMainProteinItem,
        dayTracker,
        mealTracker,
        rng,
        userProfile,
        date,
        'mainProtein'
      );
      if (addPlateFallbackItem(meal, protein, 'protein', mealCalorieTarget)) {
        recordVariety(protein, dayTracker, mealTracker);
        changed = true;
      }
    }

    if (roleCount(meal, isPlateMainCarbItem) < PLATE_STRUCTURE.required.mainCarb.min) {
      const carb = choosePlateFallback(
        eligibleIngredients,
        meal,
        'carb',
        isPlateMainCarbItem,
        dayTracker,
        mealTracker,
        rng,
        userProfile,
        date,
        'mainCarb'
      );
      if (addPlateFallbackItem(meal, carb, 'carb', mealCalorieTarget)) {
        recordVariety(carb, dayTracker, mealTracker);
        changed = true;
      }
    }

    if (roleCount(meal, isPlateVegetableItem) < PLATE_STRUCTURE.required.vegetables.min) {
      const vegetable = choosePlateFallback(
        eligibleIngredients,
        meal,
        'vegetable',
        isPlateVegetableItem,
        dayTracker,
        mealTracker,
        rng,
        userProfile,
        date,
        'vegetables'
      );
      if (addPlateFallbackItem(meal, vegetable, 'vegetable', mealCalorieTarget)) {
        recordVariety(vegetable, dayTracker, mealTracker);
        changed = true;
      }
    }

    if (roleCount(meal, isPlateFatItem) < PLATE_STRUCTURE.required.fat.min) {
      const fat = choosePlateFallback(
        eligibleIngredients,
        meal,
        'fat',
        isPlateFatItem,
        dayTracker,
        mealTracker,
        rng,
        userProfile,
        date,
        'fat'
      );
      if (addPlateFallbackItem(meal, fat, 'fat', mealCalorieTarget)) {
        recordVariety(fat, dayTracker, mealTracker);
        changed = true;
      }
    }

    if (!changed) break;
  }

  recomputeMealTotals(meal);
  meal.plateStructure = validatePlateStructureForMeal(meal, userProfile);
  meal.plate_structure = meal.plateStructure;
  return meal;
}

function mealHasProteinSource(meal = {}) {
  return (meal.ingredients || []).some((item) => isProteinCandidate(item) && Number(item.protein || item.protein_g || 0) >= 6);
}

function mealHasCarbSource(meal = {}) {
  return (meal.ingredients || []).some((item) => {
    if (isCarbSlot(item.slot, item)) return true;
    if (['grain', 'fruit', 'legume'].includes(item.category)) return true;
    return Boolean(starchFamily(item));
  });
}

function removeMealGrammarForbiddenItems(meal = {}) {
  const before = meal.ingredients.length;
  const style = meal.mealType === 'breakfast' ? inferBreakfastStyleFromMeal(meal) : null;

  meal.ingredients = (meal.ingredients || []).filter((item) => {
    if (isStandardExcludedIngredient(item, meal.mealType)) return false;
    if (meal.mealType === 'breakfast' && isProteinCandidate(item)) {
      return isBreakfastProteinAllowed(item, style || 'sweet');
    }
    if (meal.mealType === 'pre_workout') {
      return isPreWorkoutIngredientAllowed(item, item.slot);
    }
    if (meal.mealType === 'post_workout' && item.slot === 'protein') {
      return isPostWorkoutProteinAllowed(item);
    }
    if (isMainMeal(meal.mealType)) {
      return isMainMealIngredientAllowed(item, meal.mealType);
    }
    return true;
  });

  if (meal.ingredients.length !== before) recomputeMealTotals(meal);
  return meal.ingredients.length !== before;
}

function grammarFallbackCandidates(ingredients, meal, slot, predicate, userProfile = {}) {
  const mealType = meal.mealType;
  let candidates = filterBySlotAndTiming(ingredients, slot, mealType);
  if (candidates.length === 0) {
    candidates = ingredients.filter((ingredient) => normalizeDbArray(ingredient.template_slots).includes(slot));
  }

  candidates = applyMealGrammarCandidateRules(candidates, meal, mealType, slot, userProfile)
    .filter(predicate);

  if (isMainMeal(mealType)) {
    candidates = applyPlateCandidateRules(candidates, meal, mealType, slot);
  }

  if (slot === 'protein') {
    candidates = prioritizeProteinCandidatesForDiet(candidates, mealType, slot, {
      ...userProfile,
      currentMealType: mealType,
      currentSlot: slot
    });
  }

  return candidates;
}

function chooseGrammarFallback(ingredients, meal, slot, predicate, dayTracker, mealTracker, rng, userProfile, date, tag) {
  const candidates = grammarFallbackCandidates(ingredients, meal, slot, predicate, {
    ...userProfile,
    currentMealType: meal.mealType,
    currentSlot: slot
  });
  if (candidates.length === 0) return null;

  const selectionProfile = {
    ...userProfile,
    currentMealType: meal.mealType,
    currentSlot: slot
  };
  const seed = `${userProfile.userId || 'anonymous'}:${date}:${meal.mealType}:${slot}:meal-grammar:${tag}`;
  return pickIngredient(candidates, dayTracker, mealTracker, rng, selectionProfile, seed)
    || [...candidates]
      .sort((a, b) =>
        mealGrammarPriorityWeight(b, selectionProfile) - mealGrammarPriorityWeight(a, selectionProfile)
        || String(a.name || '').localeCompare(String(b.name || ''))
      )[0]
    || null;
}

function addGrammarFallbackItem(meal, ingredient, slot, mealCalorieTarget, caloriesFraction = 0.25) {
  if (!ingredient) return false;
  const targetCalories = Math.max(80, Math.round(Number(mealCalorieTarget || meal.totalCalories || 400) * caloriesFraction));
  meal.ingredients.push(buildPlanItem(ingredient, slot, calcPortion(ingredient, targetCalories)));
  recomputeMealTotals(meal);
  return true;
}

function ensureBreakfastProtein(meal, eligibleIngredients, dayTracker, mealTracker, rng, userProfile, date, mealCalorieTarget) {
  if (meal.mealType !== 'breakfast') return false;
  if (mealHasProteinSource(meal)) return false;

  const style = inferBreakfastStyleFromMeal(meal, userProfile);
  const protein = chooseGrammarFallback(
    eligibleIngredients,
    meal,
    'protein',
    (ingredient) => isBreakfastProteinAllowed(ingredient, style),
    dayTracker,
    mealTracker,
    rng,
    { ...userProfile, breakfastChoice: style },
    date,
    `${style}-breakfast-protein`
  );

  if (!protein) {
    console.warn(`[mealEngine] Breakfast protein unmet: no eligible ${style} breakfast protein available`);
    return false;
  }

  recordVariety(protein, dayTracker, mealTracker);
  return addGrammarFallbackItem(meal, protein, 'protein', mealCalorieTarget, 0.3);
}

function ensurePreWorkoutCarbOnly(meal, eligibleIngredients, dayTracker, mealTracker, rng, userProfile, date, mealCalorieTarget) {
  if (meal.mealType !== 'pre_workout') return false;
  let changed = false;

  changed = removePlateItems(meal, (item) => isProteinCandidate(item) || isFatHeavyIngredient(item, MEAL_GRAMMAR.workout.pre.maxFatG)) || changed;

  if (!mealHasCarbSource(meal)) {
    const carb = chooseGrammarFallback(
      eligibleIngredients,
      meal,
      'carb',
      isEasyCarbSnackItem,
      dayTracker,
      mealTracker,
      rng,
      userProfile,
      date,
      'pre-workout-easy-carb'
    ) || chooseGrammarFallback(
      eligibleIngredients,
      meal,
      'fruit',
      isEasyCarbSnackItem,
      dayTracker,
      mealTracker,
      rng,
      userProfile,
      date,
      'pre-workout-fruit'
    );

    if (carb) {
      recordVariety(carb, dayTracker, mealTracker);
      changed = addGrammarFallbackItem(meal, carb, carb.category === 'fruit' ? 'fruit' : 'carb', mealCalorieTarget, 0.65) || changed;
    } else {
      console.warn('[mealEngine] Pre-workout easy carb unmet: no eligible rapid carb available');
    }
  }

  recomputeMealTotals(meal);
  return changed;
}

function ensurePostWorkoutProteinAndCarb(meal, eligibleIngredients, dayTracker, mealTracker, rng, userProfile, date, mealCalorieTarget) {
  if (meal.mealType !== 'post_workout') return false;
  let changed = false;

  if (!mealHasProteinSource(meal)) {
    const protein = chooseGrammarFallback(
      eligibleIngredients,
      meal,
      'protein',
      isPostWorkoutProteinAllowed,
      dayTracker,
      mealTracker,
      rng,
      userProfile,
      date,
      'post-workout-protein'
    );

    if (protein) {
      recordVariety(protein, dayTracker, mealTracker);
      changed = addGrammarFallbackItem(meal, protein, 'protein', mealCalorieTarget, 0.45) || changed;
    } else {
      console.warn('[mealEngine] Post-workout protein unmet: no eligible recovery protein available');
    }
  }

  if (!mealHasCarbSource(meal)) {
    const carb = chooseGrammarFallback(
      eligibleIngredients,
      meal,
      'carb',
      (ingredient) => isCarbSlot('carb', ingredient) || isEasyCarbSnackItem(ingredient),
      dayTracker,
      mealTracker,
      rng,
      userProfile,
      date,
      'post-workout-carb'
    ) || chooseGrammarFallback(
      eligibleIngredients,
      meal,
      'fruit',
      isEasyCarbSnackItem,
      dayTracker,
      mealTracker,
      rng,
      userProfile,
      date,
      'post-workout-fruit'
    );

    if (carb) {
      recordVariety(carb, dayTracker, mealTracker);
      changed = addGrammarFallbackItem(meal, carb, carb.category === 'fruit' ? 'fruit' : 'carb', mealCalorieTarget, 0.4) || changed;
    } else {
      console.warn('[mealEngine] Post-workout carb unmet: no eligible recovery carb available');
    }
  }

  recomputeMealTotals(meal);
  return changed;
}

function isExplicitFatItem(item = {}) {
  const text = ingredientText(item);
  return item.category === 'fat'
    || item.category === 'nut_seed'
    || text.includes('avocado')
    || text.includes('tahini')
    || text.includes('crema di arachidi')
    || text.includes('peanut butter')
    || text.includes('almond butter');
}

function explicitFatScore(item = {}) {
  const text = ingredientText(item);
  if (textMatchesPatterns(text, ['olio evo', 'olio extravergine', 'extra virgin olive oil'])) return 100;
  if (text.includes('avocado')) return 55;
  if (text.includes('tahini')) return 50;
  if (item.category === 'nut_seed') return 35;
  return Number(item.fat || item.fat_g || 0);
}

function enforceMainMealFatStacking(meal = {}) {
  if (!isMainMeal(meal.mealType)) return false;
  const fatIndexes = (meal.ingredients || [])
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => isExplicitFatItem(item));

  if (fatIndexes.length <= MEAL_GRAMMAR.fats.stacking.maxMainMealFatSources) return false;

  const keep = [...fatIndexes]
    .sort((a, b) => explicitFatScore(b.item) - explicitFatScore(a.item) || a.index - b.index)
    .slice(0, MEAL_GRAMMAR.fats.stacking.maxMainMealFatSources)
    .map(({ index }) => index);
  const keepIndexes = new Set(keep);
  const removeIndexes = new Set(fatIndexes.filter(({ index }) => !keepIndexes.has(index)).map(({ index }) => index));
  meal.ingredients = meal.ingredients.filter((_, index) => !removeIndexes.has(index));
  recomputeMealTotals(meal);
  return true;
}

function enforceMealGrammar(meal, eligibleIngredients, dayTracker, mealTracker, rng, userProfile, date, mealCalorieTarget) {
  if (!meal || meal.error) return meal;

  removeMealGrammarForbiddenItems(meal);
  ensureBreakfastProtein(meal, eligibleIngredients, dayTracker, mealTracker, rng, userProfile, date, mealCalorieTarget);
  ensurePreWorkoutCarbOnly(meal, eligibleIngredients, dayTracker, mealTracker, rng, userProfile, date, mealCalorieTarget);
  ensurePostWorkoutProteinAndCarb(meal, eligibleIngredients, dayTracker, mealTracker, rng, userProfile, date, mealCalorieTarget);
  enforceMainMealFatStacking(meal);

  recomputeMealTotals(meal);
  return meal;
}

function validatePlateStructureForMeal(meal = {}, userProfile = {}) {
  const mealType = meal.mealType;
  const counts = plateRoleCounts(meal);
  const required = PLATE_STRUCTURE.required;
  const issues = [];
  const ingredients = meal.ingredients || [];
  const starchFamilies = [...new Set(ingredients
    .filter((item) => isPlateMainCarbItem(item, mealType))
    .map(starchFamily)
    .filter(Boolean))];
  const hasFish = ingredients.some(isFishProteinItem);
  const hasDairy = ingredients.some(isDairyIngredient);
  const hasAnimalProtein = ingredients.some(isAnimalProteinSource);
  const hasSweetFruit = ingredients.some(isSweetFruitItem);
  const breakfastOnlyItems = ingredients.filter(isBreakfastOnlyItem);
  const animalMainProteinCount = animalMainProteins(meal).length;

  if (isMainMeal(mealType)) {
    if (counts.mainProtein !== required.mainProtein.max) {
      issues.push({ code: 'main_protein_count', expected: 1, actual: counts.mainProtein });
    }
    if (counts.mainCarb !== required.mainCarb.max) {
      issues.push({ code: 'main_carb_count', expected: 1, actual: counts.mainCarb });
    }
    if (counts.vegetables < required.vegetables.min || counts.vegetables > required.vegetables.max) {
      issues.push({
        code: 'vegetable_count',
        expected: `${required.vegetables.min}-${required.vegetables.max}`,
        actual: counts.vegetables
      });
    }
    if (counts.fat !== required.fat.max) {
      issues.push({ code: 'fat_count', expected: 1, actual: counts.fat });
    }
    if (starchFamilies.length > 1) {
      issues.push({ code: 'multiple_starches', families: starchFamilies });
    }
    if (hasFish && hasDairy) {
      issues.push({ code: 'fish_dairy_pair' });
    }
    if (hasAnimalProtein && hasSweetFruit) {
      issues.push({ code: 'animal_protein_sweet_fruit_pair' });
    }
    if (breakfastOnlyItems.length > 0) {
      issues.push({
        code: 'breakfast_item_in_main_meal',
        items: breakfastOnlyItems.map((item) => item.name).filter(Boolean)
      });
    }
    if (animalMainProteinCount > 1) {
      issues.push({ code: 'multiple_animal_main_proteins', actual: animalMainProteinCount });
    }

    const diet = normalizeDietaryPattern(userProfile);
    if (['omnivore', 'pescatarian'].includes(diet)) {
      const hasAnimalMainProtein = ingredients.some((item) =>
        isPlateMainProteinItem(item, mealType) && isAnimalProteinSource(item)
      );
      if (!hasAnimalMainProtein) {
        issues.push({ code: 'omnivore_main_protein_not_animal' });
      }
    }
  }

  const cuisineFamilies = cuisineFamiliesForMeal(meal);
  const audit = {
    mealType,
    valid: issues.length === 0,
    passed: issues.length === 0,
    counts,
    required,
    starchFamilies,
    cuisineFamilies,
    cuisineCoherent: cuisineFamilies.length <= 1,
    issues
  };

  return audit;
}

function isAnimalProteinSource(ingredient = {}) {
  if (['protein_animal', 'egg', 'dairy'].includes(ingredient.category)) return true;
  if (ingredient.category !== 'supplement') return false;
  return /whey|casein|caseina|latte|milk/.test(ingredientText(ingredient));
}

function isPlantProteinSource(ingredient = {}) {
  if (['protein_plant', 'legume', 'dairy_alt'].includes(ingredient.category)) return true;
  if (ingredient.category !== 'supplement') return false;
  return /plant|pea|pisello|soy|soia|rice protein|proteina vegetale/.test(ingredientText(ingredient));
}

function isProteinSlotForMainMeal(mealType, slot) {
  return isMainMeal(mealType) && slot === 'protein';
}

function proteinSourcePriorityWeight(ingredient = {}, userProfile = {}) {
  if (!isProteinSlotForMainMeal(userProfile.currentMealType, userProfile.currentSlot)) return 1;

  const diet = normalizeDietaryPattern(userProfile);
  if (diet === 'vegan') {
    if (isPlantProteinSource(ingredient)) return 1.4;
    return 0.05;
  }

  if (diet === 'vegetarian') {
    if (['egg', 'dairy'].includes(ingredient.category)) return 1.45;
    if (isPlantProteinSource(ingredient)) return 1.0;
    return 0.2;
  }

  if (isAnimalProteinSource(ingredient)) {
    if (ingredient.category === 'protein_animal') return 2.2;
    if (ingredient.category === 'egg') return 1.75;
    if (ingredient.category === 'dairy') return 1.35;
    return 1.2;
  }

  if (isPlantProteinSource(ingredient)) return 0.25;
  return 0.7;
}

function mealGrammarPriorityWeight(ingredient = {}, userProfile = {}) {
  const mealType = normalizeToken(userProfile.currentMealType || userProfile.mealType);
  const slot = normalizeToken(userProfile.currentSlot || ingredient.slot);
  const text = ingredientText(ingredient);
  let score = 1;

  if (isStandardExcludedIngredient(ingredient, mealType)) return 0.01;

  if (mealType === 'breakfast') {
    const style = effectiveBreakfastStyle(userProfile);
    if ((slot === 'protein' || isProteinCandidate(ingredient)) && (style === 'sweet' || style === 'savory')) {
      score *= isBreakfastProteinAllowed(ingredient, style) ? 1.45 : 0.05;
    }
    for (const [index, pattern] of MEAL_GRAMMAR.dairy.priority.entries()) {
      if (text.includes(normalizeToken(pattern))) score *= 1.35 - Math.min(index, 6) * 0.03;
    }
    if (style === 'sweet' && ['fruit', 'grain', 'dairy', 'dairy_alt'].includes(ingredient.category)) score *= 1.12;
    if (style === 'savory' && ['egg', 'protein_plant', 'dairy'].includes(ingredient.category)) score *= 1.12;
  }

  if (mealType === 'pre workout' || mealType === 'pre_workout') {
    if (isEasyCarbSnackItem(ingredient)) score *= 1.45;
    if (isFatHeavyIngredient(ingredient, MEAL_GRAMMAR.workout.pre.maxFatG)) score *= 0.15;
  }

  if (mealType === 'post workout' || mealType === 'post_workout') {
    if (slot === 'protein' && isPostWorkoutProteinAllowed(ingredient)) score *= 1.45;
    if (isRapidCarbIngredient(ingredient)) score *= 1.15;
  }

  if (isMainMeal(mealType)) {
    if (slot === 'fat') {
      if (textMatchesPatterns(text, ['olio evo', 'olio extravergine', 'extra virgin olive oil'])) score *= 1.8;
      if (text.includes('avocado')) score *= 0.45;
      if (ingredient.category === 'nut_seed') score *= 0.55;
    }

    if (slot === 'carb') {
      if (textMatchesPatterns(text, ['integrale', 'wholegrain', 'whole grain', 'farro', 'orzo', 'avena', 'quinoa', 'basmati', 'venere'])) score *= 1.18;
      if (text.includes('pane')) score *= 0.92;
    }

    if (slot === 'protein' && isFishIngredient(ingredient)) {
      if (itemHasAnyPattern(ingredient, MEAL_GRAMMAR.fish.topPriority)) score *= 1.35;
      else if (itemHasAnyPattern(ingredient, MEAL_GRAMMAR.fish.excellent)) score *= 1.2;
      else if (itemHasAnyPattern(ingredient, MEAL_GRAMMAR.fish.goodModerate)) score *= 1.05;
    }

    if (slot === 'protein' && ingredient.category === 'protein_animal') {
      if (itemHasAnyPattern(ingredient, MEAL_GRAMMAR.meat.allowedPatterns)) score *= 1.1;
      if (itemHasAnyPattern(ingredient, ['sovracoscia'])) score *= 0.9;
    }
  }

  return Math.max(score, 0.01);
}

function prioritizeProteinCandidatesForDiet(candidates, mealType, slot, userProfile = {}) {
  if (!isProteinSlotForMainMeal(mealType, slot) || !Array.isArray(candidates) || candidates.length === 0) {
    return candidates;
  }

  const diet = normalizeDietaryPattern(userProfile);
  if (diet === 'vegan') {
    const plant = candidates.filter(isPlantProteinSource);
    return plant.length > 0 ? plant : candidates;
  }

  if (diet === 'vegetarian') {
    const lactoOvoAndPlant = candidates.filter((ingredient) =>
      ['egg', 'dairy'].includes(ingredient.category) || isPlantProteinSource(ingredient)
    );
    return lactoOvoAndPlant.length > 0 ? lactoOvoAndPlant : candidates;
  }

  // Omnivore/pescatarian: compatibility decides which animal foods are allowed;
  // hierarchy decides they should beat tofu/legumes as the main protein source.
  const animalMain = candidates.filter((ingredient) => ingredient.category === 'protein_animal');
  if (animalMain.length > 0) return animalMain;
  const animal = candidates.filter(isAnimalProteinSource);
  return animal.length > 0 ? animal : candidates;
}

function proteinSlotCandidatesForMeal(ingredients, mealType, userProfile = {}) {
  let candidates = filterBySlotAndTiming(ingredients, 'protein', mealType);
  if (candidates.length === 0) {
    candidates = ingredients.filter((ingredient) => normalizeDbArray(ingredient.template_slots).includes('protein'));
  }
  return prioritizeProteinCandidatesForDiet(candidates, mealType, 'protein', userProfile);
}

function chooseAnimalProteinForMeal(ingredients, meal, dayTracker, mealTracker, rng, userProfile, date) {
  const allProteinCandidates = proteinSlotCandidatesForMeal(ingredients, meal.mealType, {
    ...userProfile,
    currentMealType: meal.mealType,
    currentSlot: 'protein',
  });
  const animalCandidates = allProteinCandidates.filter(isAnimalProteinSource);
  if (animalCandidates.length === 0) return null;

  const selectionProfile = {
    ...userProfile,
    currentMealType: meal.mealType,
    currentSlot: 'protein',
  };
  const seed = `${userProfile.userId || 'anonymous'}:${date}:${meal.mealType}:protein:animal-hierarchy`;
  return pickIngredient(animalCandidates, dayTracker, mealTracker, rng, selectionProfile, seed)
    || animalCandidates
      .map((candidate) => ({
        candidate,
        score: proteinSourcePriorityWeight(candidate, selectionProfile) * Math.max(proteinDensity(candidate), 1),
      }))
      .sort((a, b) => b.score - a.score || String(a.candidate.name || '').localeCompare(String(b.candidate.name || '')))
      .map((entry) => entry.candidate)[0]
    || null;
}

function replaceMainPlantProteinWithAnimal(meal, animalIngredient) {
  const replaceIndex = meal.ingredients.findIndex((item) => item.slot === 'protein' && !isAnimalProteinSource(item));
  const fallbackIndex = meal.ingredients.findIndex((item) => isPlantProteinSource(item));
  const index = replaceIndex >= 0 ? replaceIndex : fallbackIndex;
  const previous = index >= 0 ? meal.ingredients[index] : null;
  const targetCalories = Number(previous?.calories || 0) || 260;
  const portionG = calcPortion(animalIngredient, targetCalories);
  const nextItem = buildPlanItem(animalIngredient, 'protein', portionG);

  if (index >= 0) meal.ingredients[index] = nextItem;
  else meal.ingredients.push(nextItem);
  recomputeMealTotals(meal);
}

function limitOmnivorePlantProteinComplements(meal) {
  if (!isMainMeal(meal.mealType) || !meal.ingredients.some(isAnimalProteinSource)) return;

  const plantProteinIndexes = meal.ingredients
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => isPlantProteinSource(item));
  if (plantProteinIndexes.length <= 1) return;

  const [keep, ...remove] = plantProteinIndexes
    .sort((a, b) => Number(b.item.protein || 0) - Number(a.item.protein || 0));
  const keepIndex = keep.index;
  const removeIndexes = new Set(remove.map(({ index }) => index));
  meal.ingredients = meal.ingredients.filter((_, index) => index === keepIndex || !removeIndexes.has(index));
  recomputeMealTotals(meal);
}

function enforceDietProteinSourceHierarchy(meal, eligibleIngredients, dayTracker, mealTracker, rng, userProfile, date) {
  if (!isMainMeal(meal.mealType)) return;
  const diet = normalizeDietaryPattern(userProfile);
  if (!['omnivore', 'pescatarian'].includes(diet)) return;

  const animalCandidates = proteinSlotCandidatesForMeal(eligibleIngredients, meal.mealType, {
    ...userProfile,
    currentMealType: meal.mealType,
    currentSlot: 'protein',
  }).filter(isAnimalProteinSource);

  if (!meal.ingredients.some(isAnimalProteinSource) && animalCandidates.length > 0) {
    const animal = chooseAnimalProteinForMeal(eligibleIngredients, meal, dayTracker, mealTracker, rng, userProfile, date);
    if (animal) {
      replaceMainPlantProteinWithAnimal(meal, animal);
      recordVariety(animal, dayTracker, mealTracker);
    }
  }

  if (meal.mealType === 'dinner' && !meal.ingredients.some(isAnimalProteinSource) && animalCandidates.length === 0) {
    console.warn('[mealEngine] Omnivore dinner has no animal protein source: compatible pool exhausted by diet/allergy/pathology filters');
  }

  limitOmnivorePlantProteinComplements(meal);
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
        giScore(candidate, rankingProfile) *
        proteinSourcePriorityWeight(candidate, rankingProfile) *
        mealGrammarPriorityWeight(candidate, rankingProfile),
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
        giScore(candidate, userProfile) *
        proteinSourcePriorityWeight(candidate, { ...userProfile, currentSlot: 'protein' }) *
        mealGrammarPriorityWeight(candidate, { ...userProfile, currentSlot: 'protein' }),
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
  if (isDenseVegetableIngredient(item)) return false;
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

function proteinCeilingForMeal(userProfile = {}) {
  const perKg = positiveConfigNumber(MEAL_FLOORS.protein_per_meal_max_g_per_kg, 0.55);
  const weightKg = Number(userProfile.weightKg || userProfile.weight || userProfile.currentWeight || 0);
  if (!Number.isFinite(weightKg) || weightKg <= 0) return 0;
  return Math.round(weightKg * perKg * 10) / 10;
}

function mealCalorieCeiling(dailyCalTarget) {
  const dailyCalories = Number(dailyCalTarget || 0);
  const fraction = positiveConfigNumber(MEAL_FLOORS.max_meal_calorie_fraction, 0.4);
  if (!Number.isFinite(dailyCalories) || dailyCalories <= 0) return 0;
  return Math.round(dailyCalories * fraction);
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
    if (isDenseVegetableIngredient(ingredient)) return false;
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
  const bounds = getPortionBoundsForIngredient(vegetable);
  const vegetablePortionG = Math.min(bounds.max, Math.max(bounds.min, mainMealVegetableFloor() || bounds.typical));
  meal.ingredients.push(buildPlanItem(vegetable, 'vegetable', vegetablePortionG));
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

  meal.ingredients.push(buildPlanItem(fat, 'fat', getPortionBoundsForIngredient(fat).typical));
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
  const workoutContext = userProfile.workoutNutritionContext || resolveWorkoutNutritionContext(userProfile);
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

  for (const [slot, config] of slots) {
    let candidates = filterBySlotAndTiming(eligibleIngredients, slot, mealType);
    if (candidates.length === 0) {
      candidates = eligibleIngredients.filter((ingredient) => normalizeDbArray(ingredient.template_slots).includes(slot));
    }

    if (normalizeUserPathologies(userPathologies).length > 0 && candidates.length < 3) {
      let fallbackCandidates = filterBySlotAndTiming(allIngredients, slot, mealType);
      if (fallbackCandidates.length === 0) {
        fallbackCandidates = allIngredients.filter((ingredient) => normalizeDbArray(ingredient.template_slots).includes(slot));
      }
      candidates = applyPathologyFilter(fallbackCandidates, userPathologies);
    }

    candidates = prioritizeProteinCandidatesForDiet(candidates, mealType, slot, userProfile);
    candidates = applyBreakfastStylePreference(candidates, mealType, userProfile);
    candidates = applyWorkoutCandidateRules(candidates, mealType, slot, {
      ...userProfile,
      workoutNutritionContext: workoutContext,
    });
    candidates = applyMealGrammarCandidateRules(candidates, meal, mealType, slot, {
      ...userProfile,
      workoutNutritionContext: workoutContext,
    });
    candidates = applyPlateCandidateRules(candidates, meal, mealType, slot);

    if (candidates.length === 0) {
      const intentionallySuppressedByGrammar = mealType === 'pre_workout' && ['protein', 'fat'].includes(slot);
      if (config && config.required && !intentionallySuppressedByGrammar) {
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
        { ...userProfile, currentMealType: mealType, currentSlot: slot, workoutNutritionContext: workoutContext },
        selectionSeed
      );

      if (!chosen && config && config.required && slot === 'protein' && ['lunch', 'dinner'].includes(mealType)) {
        chosen = pickRequiredProteinFallback(
          candidates,
          { ...userProfile, currentMealType: mealType, currentSlot: slot, workoutNutritionContext: workoutContext },
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

  enforceMealGrammar(meal, eligibleIngredients, dayTracker, mealTracker, rng, userProfile, date, mealCalorieTarget);
  ensureMainMealVegetable(meal, eligibleIngredients, dayTracker, mealTracker, rng, userProfile, date);
  ensureDinnerFat(meal, eligibleIngredients);
  enforceDietProteinSourceHierarchy(meal, eligibleIngredients, dayTracker, mealTracker, rng, userProfile, date);
  ensurePlateStructure(meal, eligibleIngredients, dayTracker, mealTracker, rng, userProfile, date, mealCalorieTarget);
  enforceMealGrammar(meal, eligibleIngredients, dayTracker, mealTracker, rng, userProfile, date, mealCalorieTarget);
  if (isMainMeal(meal.mealType)) {
    meal.plateStructure = validatePlateStructureForMeal(meal, userProfile);
    meal.plate_structure = meal.plateStructure;
  }
  recomputeMealTotals(meal);
  annotateBreakfastStyle(meal, userProfile);
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
  const bounds = getPortionBoundsForIngredient(item);
  const maxPortion = options.allowAboveMax ? Number.POSITIVE_INFINITY : bounds.max;
  const minPortion = options.allowBelowMin ? 1 : bounds.min;
  const nextPortion = Math.round(Math.max(minPortion, Math.min(maxPortion, item.portionG * ratio)));
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

function rangeMidpoint(range, fallback = 0) {
  if (!range || typeof range !== 'object') return fallback;
  const min = Number(range.min);
  const max = Number(range.max);
  if (Number.isFinite(min) && Number.isFinite(max)) return Math.round((min + max) / 2);
  if (Number.isFinite(min)) return min;
  if (Number.isFinite(max)) return max;
  return fallback;
}

function adjustedWorkoutRange(range, multiplier = 1) {
  if (!range || typeof range !== 'object') return null;
  const min = Number(range.min);
  const max = Number(range.max);
  return {
    min: Number.isFinite(min) ? Math.round(min * multiplier) : null,
    max: Number.isFinite(max) ? Math.round(max * multiplier) : null,
    todoNutritionistValidation: Boolean(range.todoNutritionistValidation),
  };
}

function macroValue(meal, macro) {
  if (macro === 'calories') return Number(meal.totalCalories || 0);
  return Number(meal.totalMacros?.[macro] || 0);
}

function macroItems(meal, macro, preferredPredicate = null) {
  const densityKey = macro === 'carbs' ? 'carbs_g' : macro === 'fat' ? 'fat_g' : 'protein_g';
  const items = (meal.ingredients || [])
    .filter((item) => Number(item[densityKey] || 0) > 0)
    .filter((item) => !preferredPredicate || preferredPredicate(item))
    .sort((a, b) => Number(b[densityKey] || 0) - Number(a[densityKey] || 0));
  return items;
}

function capMealMacro(meal, macro, maxValue, preferredPredicate = null) {
  const cap = Number(maxValue || 0);
  if (!Number.isFinite(cap) || cap <= 0 || macroValue(meal, macro) <= cap) return;
  let items = macroItems(meal, macro, preferredPredicate);
  if (items.length === 0) items = macroItems(meal, macro);
  if (items.length === 0) return;

  const ratio = cap / Math.max(macroValue(meal, macro), 1);
  for (const item of items) {
    adjustItemPortion(item, ratio, { allowBelowMin: true });
  }
  recomputeMealTotals(meal);
}

function boostMealMacro(meal, macro, minValue, preferredPredicate = null) {
  const target = Number(minValue || 0);
  if (!Number.isFinite(target) || target <= 0 || macroValue(meal, macro) >= target) return;
  let items = macroItems(meal, macro, preferredPredicate);
  if (items.length === 0) items = macroItems(meal, macro);
  if (items.length === 0) return;

  let missing = target - macroValue(meal, macro);
  for (const item of items) {
    if (missing <= 0) break;
    const density = Number(
      macro === 'carbs' ? item.carbs_g : macro === 'fat' ? item.fat_g : item.protein_g
    ) / 100;
    const capacity = remainingPortionCapacity(item);
    if (density <= 0 || capacity <= 0) continue;

    const gramsToAdd = Math.min(capacity, Math.ceil(missing / density));
    setItemPortion(item, Number(item.portionG || 0) + gramsToAdd);
    recomputeMealTotals(meal);
    missing = target - macroValue(meal, macro);
  }
}

function getWorkoutBlockTargets(mealType, workoutContext, userProfile = {}) {
  if (!workoutContext?.active) return null;
  const modifier = workoutContext.sportModifier || WORKOUT_NUTRITION.sportModifiers.none;
  const weightKg = Number(userProfile.weightKg || userProfile.weight || userProfile.currentWeight || 0);

  if (mealType === 'pre_workout') {
    const pre = workoutContext.config?.preWorkout || {};
    return {
      role: pre.role || 'rapid_carb_snack',
      timing: pre.timing || null,
      timingWindowMin: pre.timingWindowMin || null,
      targetCarbsG: adjustedWorkoutRange(pre.targetCarbsG, modifier.carbMultiplier || 1),
      targetProteinG: adjustedWorkoutRange(pre.targetProteinG, modifier.proteinMultiplier || 1),
      maxFatG: pre.maxFatG || WORKOUT_NUTRITION.giRules.lowFatNearWorkoutMaxG,
      preferRapidCarbs: Boolean(pre.preferRapidCarbs),
      preferLowFat: Boolean(pre.preferLowFat),
    };
  }

  if (mealType === 'post_workout') {
    const post = workoutContext.config?.postWorkout || {};
    const carbsPerKg = Number(post.targetCarbsGPerKg || 0);
    const targetCarbs = carbsPerKg > 0 && weightKg > 0
      ? Math.round(carbsPerKg * weightKg * (modifier.carbMultiplier || 1))
      : null;
    return {
      role: post.role || 'recovery',
      timing: post.timing || null,
      targetCarbsG: targetCarbs ? { min: Math.round(targetCarbs * 0.8), max: Math.round(targetCarbs * 1.15), todoNutritionistValidation: true } : null,
      targetProteinG: adjustedWorkoutRange(post.targetProteinG, modifier.proteinMultiplier || 1),
      maxFatG: WORKOUT_NUTRITION.giRules.moderateFatNearWorkoutMaxG,
      preferCarbProtein: Boolean(post.preferCarbProtein),
      preferLowModerateFat: Boolean(post.preferLowModerateFat),
    };
  }

  if (isCompleteWorkoutPreMeal(mealType, workoutContext)) {
    const main = workoutContext.config?.mainPreMealTargets || {};
    return {
      role: 'main_pre_workout_meal',
      timing: 'about_3h_pre',
      targetCarbsG: main.targetCarbsG ? { min: Math.round(main.targetCarbsG * 0.85), max: Math.round(main.targetCarbsG * 1.15) } : null,
      targetProteinG: main.targetProteinG || null,
      maxFatG: main.targetFatG ? Math.round(Number(main.targetFatG) * 1.5) : WORKOUT_NUTRITION.giRules.moderateFatNearWorkoutMaxG,
      preferMediumLowGiCarbs: true,
    };
  }

  return null;
}

function enforceWorkoutNutritionBlocks(meals, userProfile = {}) {
  const workoutContext = userProfile.workoutNutritionContext || resolveWorkoutNutritionContext(userProfile);
  if (!workoutContext.active) return meals;

  for (const meal of meals) {
    const targets = getWorkoutBlockTargets(meal.mealType, workoutContext, userProfile);
    if (!targets) continue;

    if (targets.maxFatG) {
      capMealMacro(meal, 'fat', targets.maxFatG, (item) => isFatHeavyIngredient(item, targets.maxFatG));
    }

    if (meal.mealType === 'pre_workout') {
      const carbMin = targets.targetCarbsG?.min;
      const carbMax = targets.targetCarbsG?.max;
      const proteinMax = targets.targetProteinG?.max;
      boostMealMacro(meal, 'carbs', carbMin, isRapidCarbIngredient);
      capMealMacro(meal, 'carbs', carbMax, (item) => isCarbSlot(item.slot, item));
      capMealMacro(meal, 'protein', proteinMax, isProteinFloorItem);
    }

    if (meal.mealType === 'post_workout') {
      boostMealMacro(meal, 'protein', targets.targetProteinG?.min, isProteinFloorItem);
      boostMealMacro(meal, 'carbs', targets.targetCarbsG?.min, isRapidCarbIngredient);
      capMealMacro(meal, 'fat', targets.maxFatG, (item) => isFatHeavyIngredient(item, targets.maxFatG));
    }

    if (targets.role === 'main_pre_workout_meal') {
      boostMealMacro(meal, 'protein', targets.targetProteinG?.min, isProteinFloorItem);
      boostMealMacro(meal, 'carbs', targets.targetCarbsG?.min, (item) => !isRapidCarbIngredient(item));
      capMealMacro(meal, 'fat', targets.maxFatG, (item) => isFatHeavyIngredient(item, targets.maxFatG));
    }
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

function calorieDensity(item) {
  return Math.max(0, Number(item.calories_per_100g || 0) / 100);
}

function proteinPerGram(item) {
  return Math.max(0, proteinDensity(item) / 100);
}

function remainingPortionCapacity(item) {
  const bounds = getPortionBoundsForIngredient(item);
  return Math.max(0, bounds.max - Number(item.portionG || 0));
}

function mealProteinItems(meal) {
  return (meal.ingredients || [])
    .filter((item) => proteinPerGram(item) > 0)
    .sort((a, b) => Number(b.protein || 0) - Number(a.protein || 0));
}

function mealProteinRedistributionItems(meal) {
  return mealProteinItems(meal)
    .filter(isProteinFloorItem)
    .sort((a, b) => proteinDensity(b) - proteinDensity(a));
}

function mealCalorieRedistributionItems(meal) {
  const priority = {
    fat: 5,
    nut_seed: 4,
    grain: 3,
    fruit: 3,
    dairy: 2,
    dairy_alt: 2,
    legume: 1,
    protein_plant: 1,
    protein_animal: 1,
    egg: 1,
  };

  return (meal.ingredients || [])
    .filter((item) => calorieDensity(item) > 0 && !isDenseVegetableIngredient(item))
    .sort((a, b) => {
      const priorityDiff = (priority[b.category] || 0) - (priority[a.category] || 0);
      if (priorityDiff !== 0) return priorityDiff;
      return calorieDensity(b) - calorieDensity(a);
    });
}

function shrinkMealProteinToCeiling(meal, proteinCeilingG) {
  if (proteinCeilingG <= 0) return;

  const currentProtein = Number(meal.totalMacros?.protein || 0);
  if (currentProtein <= proteinCeilingG) return;

  const proteinItems = mealProteinItems(meal);
  if (proteinItems.length === 0) {
    console.warn(`[mealEngine] Protein ceiling unmet for ${meal.mealType}: no protein-bearing item available`);
    return;
  }

  const ratio = proteinCeilingG / Math.max(currentProtein, 1);
  for (const item of proteinItems) {
    adjustItemPortion(item, ratio, { allowBelowMin: true });
  }
  recomputeMealTotals(meal);

  let guard = 0;
  while (Number(meal.totalMacros?.protein || 0) > proteinCeilingG + 0.4 && guard < 12) {
    guard += 1;
    const strongest = mealProteinItems(meal)[0];
    if (!strongest || Number(strongest.portionG || 0) <= 1) break;

    const gramsToRemove = Math.max(
      1,
      Math.ceil((Number(meal.totalMacros?.protein || 0) - proteinCeilingG) / Math.max(proteinPerGram(strongest), 0.01))
    );
    setItemPortion(strongest, Math.max(1, Number(strongest.portionG || 0) - gramsToRemove));
    recomputeMealTotals(meal);
  }
}

function shrinkMealCaloriesToCeiling(meal, calorieCeilingKcal) {
  if (calorieCeilingKcal <= 0) return;
  if (Number(meal.totalCalories || 0) <= calorieCeilingKcal) return;

  const calorieItems = mealCalorieRedistributionItems(meal);
  const reducibleItems = calorieItems.length > 0
    ? calorieItems
    : (meal.ingredients || []).filter((item) => calorieDensity(item) > 0);
  if (reducibleItems.length === 0) {
    console.warn(`[mealEngine] Calorie ceiling unmet for ${meal.mealType}: no calorie-bearing item available`);
    return;
  }

  const ratio = calorieCeilingKcal / Math.max(Number(meal.totalCalories || 0), 1);
  for (const item of reducibleItems) {
    adjustItemPortion(item, ratio, { allowBelowMin: true });
  }
  recomputeMealTotals(meal);

  let guard = 0;
  while (Number(meal.totalCalories || 0) > calorieCeilingKcal + 5 && guard < 12) {
    guard += 1;
    const richest = [...reducibleItems]
      .filter((item) => Number(item.portionG || 0) > 1)
      .sort((a, b) => Number(b.calories || 0) - Number(a.calories || 0))[0];
    if (!richest) break;

    const gramsToRemove = Math.max(
      1,
      Math.ceil((Number(meal.totalCalories || 0) - calorieCeilingKcal) / Math.max(calorieDensity(richest), 0.01))
    );
    setItemPortion(richest, Math.max(1, Number(richest.portionG || 0) - gramsToRemove));
    recomputeMealTotals(meal);
  }
}

function addPortionUnderCeilings(item, meal, grams, proteinCeilingG, calorieCeilingKcal) {
  const addG = Math.floor(Number(grams || 0));
  if (addG <= 0) return 0;

  const currentPortion = Number(item.portionG || 0);
  setItemPortion(item, currentPortion + addG);
  recomputeMealTotals(meal);

  if (
    (proteinCeilingG > 0 && Number(meal.totalMacros?.protein || 0) > proteinCeilingG + 0.4)
    || (calorieCeilingKcal > 0 && Number(meal.totalCalories || 0) > calorieCeilingKcal + 5)
  ) {
    setItemPortion(item, currentPortion);
    recomputeMealTotals(meal);
    return 0;
  }

  return addG;
}

function redistributeProteinUnderCeilings(meals, dailyProteinTarget, proteinCeilingG, calorieCeilingKcal) {
  const targetProtein = Number(dailyProteinTarget || 0);
  if (!Number.isFinite(targetProtein) || targetProtein <= 0 || proteinCeilingG <= 0) return;

  let guard = 0;
  while (buildDaySummary(meals).totalProtein < targetProtein - 0.5 && guard < 24) {
    guard += 1;
    const missingProtein = targetProtein - buildDaySummary(meals).totalProtein;
    let changed = false;

    const candidateMeals = [...meals]
      .filter((meal) => Number(meal.totalMacros?.protein || 0) < proteinCeilingG - 0.5)
      .filter((meal) => calorieCeilingKcal <= 0 || Number(meal.totalCalories || 0) < calorieCeilingKcal - 5)
      .sort((a, b) => Number(a.totalMacros?.protein || 0) - Number(b.totalMacros?.protein || 0));

    for (const meal of candidateMeals) {
      const proteinRoom = Math.max(0, proteinCeilingG - Number(meal.totalMacros?.protein || 0));
      const calorieRoom = calorieCeilingKcal > 0
        ? Math.max(0, calorieCeilingKcal - Number(meal.totalCalories || 0))
        : Number.POSITIVE_INFINITY;

      for (const item of mealProteinRedistributionItems(meal)) {
        const itemProteinPerGram = proteinPerGram(item);
        const itemCaloriePerGram = calorieDensity(item);
        const portionRoom = remainingPortionCapacity(item);
        if (itemProteinPerGram <= 0 || portionRoom <= 0) continue;

        const gramsByProteinNeed = missingProtein / itemProteinPerGram;
        const gramsByProteinRoom = proteinRoom / itemProteinPerGram;
        const gramsByCalorieRoom = itemCaloriePerGram > 0 ? calorieRoom / itemCaloriePerGram : portionRoom;
        const gramsToAdd = Math.min(portionRoom, gramsByProteinNeed, gramsByProteinRoom, gramsByCalorieRoom);
        const added = addPortionUnderCeilings(item, meal, gramsToAdd, proteinCeilingG, calorieCeilingKcal);
        if (added > 0) {
          changed = true;
          break;
        }
      }

      if (buildDaySummary(meals).totalProtein >= targetProtein - 0.5) break;
    }

    if (!changed) break;
  }
}

function redistributeCaloriesUnderCeilings(meals, dailyCalTarget, proteinCeilingG, calorieCeilingKcal) {
  const targetCalories = Number(dailyCalTarget || 0);
  if (!Number.isFinite(targetCalories) || targetCalories <= 0 || calorieCeilingKcal <= 0) return;

  let guard = 0;
  while (buildDaySummary(meals).totalCalories < targetCalories - 20 && guard < 24) {
    guard += 1;
    const missingCalories = targetCalories - buildDaySummary(meals).totalCalories;
    let changed = false;

    const candidateMeals = [...meals]
      .filter((meal) => Number(meal.totalCalories || 0) < calorieCeilingKcal - 5)
      .filter((meal) => proteinCeilingG <= 0 || Number(meal.totalMacros?.protein || 0) < proteinCeilingG - 0.4)
      .sort((a, b) => Number(a.totalCalories || 0) - Number(b.totalCalories || 0));

    for (const meal of candidateMeals) {
      const calorieRoom = Math.max(0, calorieCeilingKcal - Number(meal.totalCalories || 0));
      const proteinRoom = proteinCeilingG > 0
        ? Math.max(0, proteinCeilingG - Number(meal.totalMacros?.protein || 0))
        : Number.POSITIVE_INFINITY;

      for (const item of mealCalorieRedistributionItems(meal)) {
        const itemCaloriePerGram = calorieDensity(item);
        const itemProteinPerGram = proteinPerGram(item);
        const portionRoom = remainingPortionCapacity(item);
        if (itemCaloriePerGram <= 0 || portionRoom <= 0) continue;

        const gramsByCalorieNeed = missingCalories / itemCaloriePerGram;
        const gramsByCalorieRoom = calorieRoom / itemCaloriePerGram;
        const gramsByProteinRoom = itemProteinPerGram > 0 ? proteinRoom / itemProteinPerGram : portionRoom;
        const gramsToAdd = Math.min(portionRoom, gramsByCalorieNeed, gramsByCalorieRoom, gramsByProteinRoom);
        const added = addPortionUnderCeilings(item, meal, gramsToAdd, proteinCeilingG, calorieCeilingKcal);
        if (added > 0) {
          changed = true;
          break;
        }
      }

      if (buildDaySummary(meals).totalCalories >= targetCalories - 20) break;
    }

    if (!changed) break;
  }
}

function enforceMealCeilings(meals, userProfile = {}, dailyCalTarget = null, dailyProteinTarget = null) {
  const proteinCeilingG = proteinCeilingForMeal(userProfile);
  const calorieCeilingKcal = mealCalorieCeiling(dailyCalTarget);

  for (const meal of meals) {
    shrinkMealProteinToCeiling(meal, proteinCeilingG);
    shrinkMealCaloriesToCeiling(meal, calorieCeilingKcal);
  }

  redistributeProteinUnderCeilings(meals, dailyProteinTarget, proteinCeilingG, calorieCeilingKcal);
  redistributeCaloriesUnderCeilings(meals, dailyCalTarget, proteinCeilingG, calorieCeilingKcal);

  for (const meal of meals) {
    shrinkMealProteinToCeiling(meal, proteinCeilingG);
    shrinkMealCaloriesToCeiling(meal, calorieCeilingKcal);
  }

  return meals;
}

function buildPlateStructureAudit(meals, userProfile = {}) {
  const mealAudits = (meals || [])
    .filter((meal) => isMainMeal(meal.mealType))
    .map((meal) => meal.plateStructure || validatePlateStructureForMeal(meal, userProfile));

  return {
    version: PLATE_STRUCTURE.version,
    source: PLATE_STRUCTURE.source,
    status: PLATE_STRUCTURE.status,
    passed: mealAudits.every((audit) => audit.passed),
    meals: mealAudits
  };
}

function validateMealGrammarForMeal(meal = {}, userProfile = {}) {
  const issues = [];
  const ingredients = meal.ingredients || [];
  const mealType = meal.mealType;

  const excluded = ingredients.filter((item) => isStandardExcludedIngredient(item, mealType));
  if (excluded.length > 0) {
    issues.push({
      code: 'standard_excluded_ingredient',
      items: excluded.map((item) => item.name).filter(Boolean)
    });
  }

  if (mealType === 'breakfast') {
    const style = inferBreakfastStyleFromMeal(meal, userProfile);
    if (!mealHasProteinSource(meal)) issues.push({ code: 'breakfast_missing_protein', style });

    const invalidProteins = ingredients
      .filter(isProteinCandidate)
      .filter((item) => !isBreakfastProteinAllowed(item, style));
    if (invalidProteins.length > 0) {
      issues.push({
        code: 'breakfast_incompatible_protein',
        style,
        items: invalidProteins.map((item) => item.name).filter(Boolean)
      });
    }
  }

  if (mealType === 'pre_workout') {
    if (!mealHasCarbSource(meal)) issues.push({ code: 'pre_workout_missing_easy_carb' });
    const heavyItems = ingredients.filter((item) =>
      isProteinCandidate(item) || isFatHeavyIngredient(item, MEAL_GRAMMAR.workout.pre.maxFatG)
    );
    if (heavyItems.length > 0) {
      issues.push({
        code: 'pre_workout_heavy_or_protein_item',
        items: heavyItems.map((item) => item.name).filter(Boolean)
      });
    }
  }

  if (mealType === 'post_workout') {
    if (!mealHasProteinSource(meal)) issues.push({ code: 'post_workout_missing_protein' });
    if (!mealHasCarbSource(meal)) issues.push({ code: 'post_workout_missing_carb' });
  }

  if (isMainMeal(mealType)) {
    const explicitFatCount = ingredients.filter(isExplicitFatItem).length;
    if (explicitFatCount > MEAL_GRAMMAR.fats.stacking.maxMainMealFatSources) {
      issues.push({
        code: 'too_many_explicit_fats',
        max: MEAL_GRAMMAR.fats.stacking.maxMainMealFatSources,
        actual: explicitFatCount
      });
    }

    const parmesanMain = ingredients.filter((item) =>
      isPlateMainProteinItem(item, mealType) && isParmesanItem(item)
    );
    if (parmesanMain.length > 0 && ingredients.filter((item) => isPlateMainProteinItem(item, mealType)).length === parmesanMain.length) {
      issues.push({ code: 'parmesan_used_as_only_main_protein' });
    }
  }

  return {
    mealType,
    passed: issues.length === 0,
    issues
  };
}

function buildMealGrammarAudit(meals, userProfile = {}) {
  const mealAudits = (meals || []).map((meal) => validateMealGrammarForMeal(meal, userProfile));
  return {
    version: MEAL_GRAMMAR.version,
    source: MEAL_GRAMMAR.source,
    status: MEAL_GRAMMAR.status,
    scienceBasis: MEAL_GRAMMAR.scienceBasis,
    passed: mealAudits.every((audit) => audit.passed),
    meals: mealAudits
  };
}

function produceColor(item = {}) {
  const text = ingredientText(item);
  if (textMatchesPatterns(text, ['broccoli', 'spinaci', 'zucchine', 'cavolo riccio', 'cetriol', 'asparagi', 'lattuga', 'rucola', 'valeriana', 'cicoria', 'piselli'])) return 'green';
  if (textMatchesPatterns(text, ['pomodoro', 'peperone rosso', 'ravanell', 'fragol', 'cilieg', 'melograno'])) return 'red';
  if (textMatchesPatterns(text, ['carot', 'zucca', 'peperone aranc', 'arancia', 'albicocc', 'pesca', 'mandarino'])) return 'orange';
  if (textMatchesPatterns(text, ['melanzan', 'cavolo viola', 'cipolla rossa', 'mirtill', 'frutti di bosco', 'uva', 'prugna'])) return 'purple';
  if (textMatchesPatterns(text, ['cavolfiore', 'funghi', 'finocchi', 'cipolla', 'pera', 'mela', 'banana'])) return 'white';
  return null;
}

function isPlantVarietyProduce(item = {}) {
  if (item.category === 'fruit') return true;
  if (item.category !== 'vegetable') return false;
  return !isDenseVegetableIngredient(item);
}

function isCruciferousItem(item = {}) {
  return itemHasAnyPattern(item, ['broccoli', 'cavolfiore', 'cavolo', 'cavoletti', 'bok choy']);
}

function isLeafyGreenItem(item = {}) {
  return itemHasAnyPattern(item, ['spinaci', 'lattuga', 'rucola', 'valeriana', 'cicoria', 'cavolo riccio']);
}

function isBerryItem(item = {}) {
  return itemHasAnyPattern(item, ['mirtilli', 'mirtillo', 'fragole', 'fragola', 'frutti di bosco', 'berry', 'berries', 'raspberry', 'blackberry']);
}

function buildPlantVarietyAudit(meals = []) {
  const items = meals.flatMap((meal) => (meal.ingredients || []).map((item) => ({ ...item, mealType: meal.mealType })));
  const produceItems = items.filter(isPlantVarietyProduce);
  const colors = [...new Set(produceItems.map(produceColor).filter(Boolean))];
  const vegetableServings = items
    .filter((item) => item.category === 'vegetable' && !isDenseVegetableIngredient(item))
    .reduce((sum, item) => sum + Math.max(0.5, Number(item.portionG || 0) / 120), 0);
  const fruitServings = items
    .filter((item) => item.category === 'fruit')
    .reduce((sum, item) => sum + Math.max(0.5, Number(item.portionG || 0) / 130), 0);
  const mainMealsWithoutVegetables = meals
    .filter((meal) => ['lunch', 'dinner'].includes(meal.mealType))
    .filter((meal) => !(meal.ingredients || []).some((item) => item.category === 'vegetable' && !isDenseVegetableIngredient(item)))
    .map((meal) => meal.mealType);

  const checks = {
    mainMealsHaveVegetables: mainMealsWithoutVegetables.length === 0,
    dailyVegetables: vegetableServings >= MEAL_GRAMMAR.plantVariety.vegetableServingsDailyTarget,
    dailyFruit: fruitServings >= MEAL_GRAMMAR.plantVariety.fruitServingsDailyTarget,
    dailyColors: colors.length >= MEAL_GRAMMAR.plantVariety.dailyColorMinimum
  };

  return {
    version: MEAL_GRAMMAR.version,
    source: MEAL_GRAMMAR.source,
    status: MEAL_GRAMMAR.status,
    passed: Object.values(checks).every(Boolean),
    colors,
    dailyColorMinimum: MEAL_GRAMMAR.plantVariety.dailyColorMinimum,
    dailyColorTarget: MEAL_GRAMMAR.plantVariety.dailyColorTarget,
    vegetableServings: Math.round(vegetableServings * 10) / 10,
    vegetableServingsTarget: MEAL_GRAMMAR.plantVariety.vegetableServingsDailyTarget,
    fruitServings: Math.round(fruitServings * 10) / 10,
    fruitServingsTarget: MEAL_GRAMMAR.plantVariety.fruitServingsDailyTarget,
    cruciferousCount: items.filter(isCruciferousItem).length,
    leafyGreensCount: items.filter(isLeafyGreenItem).length,
    berriesCount: items.filter(isBerryItem).length,
    mainMealsWithoutVegetables,
    checks
  };
}

function produceFallbackCandidates(ingredients = [], mealType, category = null, color = null) {
  return ingredients.filter((ingredient) => {
    if (!isPlantVarietyProduce(ingredient)) return false;
    if (category && ingredient.category !== category) return false;
    if (color && produceColor(ingredient) !== color) return false;
    if (isStandardExcludedIngredient(ingredient, mealType)) return false;

    const timings = normalizeDbArray(ingredient.meal_timing);
    return timings.length === 0 || timings.includes(mealType);
  });
}

function chooseProduceFallback(ingredients, mealType, category, color, dayTracker, mealTracker, rng, userProfile, date, tag) {
  const candidates = produceFallbackCandidates(ingredients, mealType, category, color);
  if (candidates.length === 0) return null;

  const selectionProfile = {
    ...userProfile,
    currentMealType: mealType,
    currentSlot: category === 'fruit' ? 'fruit' : 'vegetable'
  };
  const seed = `${userProfile.userId || 'anonymous'}:${date}:${mealType}:${category || 'produce'}:${color || 'any'}:${tag}`;
  return pickIngredient(candidates, dayTracker, mealTracker, rng, selectionProfile, seed)
    || candidates
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))[0]
    || null;
}

function addProduceFallbackToMeal(meal, ingredient, dayTracker, mealTracker, portionG = null) {
  if (!meal || !ingredient) return false;
  const slot = ingredient.category === 'fruit' ? 'fruit' : 'vegetable';
  const bounds = getPortionBoundsForIngredient(ingredient);
  const grams = portionG || Math.min(bounds.max, Math.max(bounds.min, bounds.typical));
  meal.ingredients.push(buildPlanItem(ingredient, slot, grams));
  recordVariety(ingredient, dayTracker, mealTracker);
  recomputeMealTotals(meal);
  return true;
}

function findMealForProduce(meals = [], preferredTypes = []) {
  for (const mealType of preferredTypes) {
    const meal = meals.find((entry) => entry.mealType === mealType);
    if (meal) return meal;
  }
  return meals.find((meal) => !meal.error) || null;
}

function enforcePlantVariety(meals, eligibleIngredients, dayTracker, rng, userProfile, date) {
  if (!Array.isArray(meals) || meals.length === 0) return meals;

  const mealTracker = { mainMeal: false, grainCount: 0 };
  let audit = buildPlantVarietyAudit(meals);
  const colorOrder = ['green', 'red', 'orange', 'purple', 'white'];

  for (let guard = 0; guard < 6 && !audit.checks.dailyColors; guard += 1) {
    const missingColor = colorOrder.find((color) => !audit.colors.includes(color));
    if (!missingColor) break;

    const fruitMeal = findMealForProduce(meals, ['snack', 'breakfast', 'pre_workout', 'post_workout']);
    const fruit = fruitMeal
      ? chooseProduceFallback(eligibleIngredients, fruitMeal.mealType, 'fruit', missingColor, dayTracker, mealTracker, rng, userProfile, date, 'color-fruit')
      : null;
    if (fruit && addProduceFallbackToMeal(fruitMeal, fruit, dayTracker, mealTracker)) {
      audit = buildPlantVarietyAudit(meals);
      continue;
    }

    const vegMeal = findMealForProduce(meals, ['lunch', 'dinner']);
    if (!vegMeal || (vegMeal.ingredients || []).filter((item) => item.category === 'vegetable' && !isDenseVegetableIngredient(item)).length >= 2) break;
    const vegetable = chooseProduceFallback(eligibleIngredients, vegMeal.mealType, 'vegetable', missingColor, dayTracker, mealTracker, rng, userProfile, date, 'color-veg');
    if (!vegetable || !addProduceFallbackToMeal(vegMeal, vegetable, dayTracker, mealTracker)) break;
    audit = buildPlantVarietyAudit(meals);
  }

  audit = buildPlantVarietyAudit(meals);

  for (let guard = 0; guard < 4 && !audit.checks.dailyFruit; guard += 1) {
    const meal = findMealForProduce(meals, ['snack', 'breakfast', 'pre_workout', 'post_workout']);
    if (!meal) break;
    const fruit = chooseProduceFallback(eligibleIngredients, meal.mealType, 'fruit', null, dayTracker, mealTracker, rng, userProfile, date, 'daily-fruit');
    if (!fruit || !addProduceFallbackToMeal(meal, fruit, dayTracker, mealTracker)) break;
    audit = buildPlantVarietyAudit(meals);
  }

  for (let guard = 0; guard < 4 && !audit.checks.dailyVegetables; guard += 1) {
    const meal = meals
      .filter((entry) => ['lunch', 'dinner'].includes(entry.mealType))
      .find((entry) => (entry.ingredients || []).filter((item) => item.category === 'vegetable' && !isDenseVegetableIngredient(item)).length < 2);
    if (!meal) break;
    const vegetable = chooseProduceFallback(eligibleIngredients, meal.mealType, 'vegetable', null, dayTracker, { mainMeal: true, grainCount: 0 }, rng, userProfile, date, 'daily-vegetable');
    if (!vegetable || !addProduceFallbackToMeal(meal, vegetable, dayTracker, { mainMeal: true, grainCount: 0 })) break;
    audit = buildPlantVarietyAudit(meals);
  }

  return meals;
}

function buildMealFloorAudit(meals, userProfile = {}, dailyCalTarget = null) {
  const proteinFloorG = proteinFloorForMeal(userProfile);
  const proteinCeilingG = proteinCeilingForMeal(userProfile);
  const calorieCeilingKcal = mealCalorieCeiling(dailyCalTarget);
  const vegetableFloorG = mainMealVegetableFloor(userProfile);
  const fiberFloorG = mainMealFiberFloor(userProfile);
  const dinnerFatFloorG = dinnerFatFloor(userProfile);

  return meals
    .map((meal) => {
      const isMainMeal = ['lunch', 'dinner'].includes(meal.mealType);
      const proteinG = Number(meal.totalMacros?.protein || 0);
      const fiberG = Number(meal.totalMacros?.fiber || 0);
      const fatG = Number(meal.totalMacros?.fat || 0);
      const vegetableG = vegetableGramsForMeal(meal);
      const checks = {
        proteinMin: !isMainMeal || proteinFloorG <= 0 || proteinG >= proteinFloorG,
        proteinMax: proteinCeilingG <= 0 || proteinG <= proteinCeilingG + 0.4,
        calorieMax: calorieCeilingKcal <= 0 || Number(meal.totalCalories || 0) <= calorieCeilingKcal + 5,
        fiber: !isMainMeal || fiberFloorG <= 0 || fiberG >= fiberFloorG,
        vegetables: !isMainMeal || vegetableFloorG <= 0 || vegetableG >= vegetableFloorG,
        dinnerFat: meal.mealType !== 'dinner' || dinnerFatFloorG <= 0 || fatG >= dinnerFatFloorG,
      };

      return {
        mealType: meal.mealType,
        calories: Math.round(Number(meal.totalCalories || 0)),
        calorieCeilingKcal,
        proteinG: Math.round(proteinG * 10) / 10,
        proteinFloorG: isMainMeal ? proteinFloorG : null,
        proteinCeilingG,
        fiberG: Math.round(fiberG * 10) / 10,
        fiberFloorG: isMainMeal ? fiberFloorG : null,
        vegetableG,
        vegetableFloorG: isMainMeal ? vegetableFloorG : null,
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

function displayIngredientName(item = {}, lang = 'it') {
  const raw = lang === 'en' ? (item.name_en || item.name) : (item.name || item.name_en);
  const name = String(raw || '').trim();
  if (!name) return '';
  const normalized = normalizeToken(name);
  if (normalized.includes('pane') || normalized.includes('bread')) {
    if (normalized.includes('fresco') || normalized.includes('fresh')) return name;
    if (lang === 'en') return name.toLowerCase().includes('fresh') ? name : `Fresh ${name}`;
    return `Pane fresco${normalized === 'pane' ? '' : ` ${name.replace(/^pane\s*/i, '').trim()}`}`.trim();
  }
  return name;
}

function mealContainsPattern(meal = {}, patterns = []) {
  return (meal.ingredients || []).some((item) => itemHasAnyPattern(item, patterns));
}

function mealMainDisplayIngredient(meal = {}, lang = 'it') {
  const protein = (meal.ingredients || []).find((item) => item.slot === 'protein')
    || (meal.ingredients || []).find(isProteinCandidate)
    || (meal.ingredients || [])[0];
  return displayIngredientName(protein || {}, lang) || (lang === 'en' ? 'planned ingredients' : 'ingredienti previsti');
}

function chooseMealAssemblyType(meal = {}, userProfile = {}) {
  const mealType = meal.mealType;
  if (mealType === 'breakfast') {
    const style = inferBreakfastStyleFromMeal(meal, userProfile);
    if (style === 'savory') {
      if (mealContainsPattern(meal, ['tofu'])) return 'tofu_scramble';
      if (mealContainsPattern(meal, ['uova', 'uovo', 'egg', 'albumi'])) return 'omelette';
      return 'fresh_bread_toast';
    }

    if (mealContainsPattern(meal, ['uova', 'albumi', 'egg']) && mealContainsPattern(meal, ['avena', 'oat'])) return 'pancake';
    if (mealContainsPattern(meal, ['avena', 'oat']) && mealContainsPattern(meal, ['latte', 'milk'])) return 'porridge';
    if (mealContainsPattern(meal, ['avena', 'oat'])) return 'overnight_oats';
    if (mealContainsPattern(meal, ['ricotta'])) return 'ricotta_bowl';
    if (mealContainsPattern(meal, ['pane', 'bread', 'toast'])) return 'fresh_bread_toast';
    return 'yogurt_bowl';
  }

  if (mealType === 'pre_workout') {
    if (mealContainsPattern(meal, ['pane', 'bread', 'toast'])) return 'fresh_bread_toast';
    return 'quick_carb_snack';
  }

  if (mealType === 'post_workout') return 'recovery_plate';

  if (isMainMeal(mealType)) {
    if (mealContainsPattern(meal, ['pasta'])) return 'pasta_plate';
    if (mealContainsPattern(meal, ['patate', 'potato', 'sweet potato'])) return 'potato_plate';
    if (mealContainsPattern(meal, ['ceci', 'lenticchie', 'fagioli', 'piselli', 'hummus'])) return 'legume_bowl';
    if (mealContainsPattern(meal, ['riso', 'rice', 'farro', 'orzo', 'barley', 'quinoa', 'cous cous', 'couscous'])) return 'grain_bowl';
    if ((meal.ingredients || []).filter(isPlantVarietyProduce).length >= 2) return 'salad_bowl';
    return 'grain_bowl';
  }

  if (mealContainsPattern(meal, ['yogurt', 'skyr', 'ricotta'])) return 'yogurt_bowl';
  if (mealContainsPattern(meal, ['pane', 'bread', 'toast'])) return 'fresh_bread_toast';
  return 'quick_carb_snack';
}

function fillAssemblyTemplate(template, meal, lang = 'it') {
  const main = mealMainDisplayIngredient(meal, lang);
  return String(template || '').replace(/\{main\}/g, main);
}

function annotateMealAssembly(meal = {}, userProfile = {}) {
  if (!meal || meal.error) return meal;
  const assemblyType = chooseMealAssemblyType(meal, userProfile);
  const config = MEAL_ASSEMBLY.assemblies[assemblyType] || MEAL_ASSEMBLY.assemblies.grain_bowl;
  const titleIt = fillAssemblyTemplate(config.titleIt, meal, 'it');
  const titleEn = fillAssemblyTemplate(config.titleEn, meal, 'en');

  meal.assembly = {
    version: MEAL_ASSEMBLY.version,
    source: MEAL_ASSEMBLY.source,
    status: MEAL_ASSEMBLY.status,
    type: assemblyType,
    style: config.style,
    served_as: config.servedAs,
    title: {
      it: titleIt,
      en: titleEn
    },
    instructions: {
      it: config.instructionsIt,
      en: config.instructionsEn
    }
  };
  meal.meal_title = titleIt;
  meal.mealTitle = {
    it: titleIt,
    en: titleEn
  };
  return meal;
}

function validateMealAssembly(meal = {}) {
  const issues = [];
  const ingredients = meal.ingredients || [];
  const assemblyType = meal.assembly?.type || null;

  for (const [component, rules] of Object.entries(MEAL_ASSEMBLY.orphanComponents)) {
    const present = ingredients.some((item) => itemHasAnyPattern(item, rules.patterns));
    if (!present) continue;
    if (Array.isArray(rules.standaloneMealTypes) && rules.standaloneMealTypes.includes(meal.mealType)) continue;

    const hasRequiredCompanion = rules.requiresAny.some((requirement) => {
      if (requirement === 'milk_base') return ingredients.some((item) => itemHasAnyPattern(item, ['latte', 'milk', 'bevanda di soia', 'soy milk']));
      if (requirement === 'yogurt_base') return ingredients.some((item) => itemHasAnyPattern(item, ['yogurt', 'skyr', 'kefir']));
      if (requirement === 'skyr') return ingredients.some((item) => itemHasAnyPattern(item, ['skyr']));
      if (requirement === 'ricotta') return ingredients.some((item) => itemHasAnyPattern(item, ['ricotta']));
      if (requirement === 'bread') return ingredients.some((item) => itemHasAnyPattern(item, ['pane', 'bread', 'toast']));
      if (requirement === 'honey') return ingredients.some((item) => itemHasAnyPattern(item, ['miele', 'honey']));
      if (requirement === 'jam') return ingredients.some((item) => itemHasAnyPattern(item, ['marmellata', 'jam']));
      if (requirement === 'fruit') return ingredients.some((item) => item.category === 'fruit');
      return assemblyType === requirement || mealContainsPattern(meal, [requirement]);
    });

    if (!hasRequiredCompanion) {
      issues.push({
        code: 'orphan_component',
        component,
        preferredAssemblies: [...rules.preferredAssemblies]
      });
    }
  }

  return {
    mealType: meal.mealType,
    assemblyType,
    passed: issues.length === 0,
    issues
  };
}

function buildMealAssemblyAudit(meals = []) {
  const mealAudits = meals.map(validateMealAssembly);
  return {
    version: MEAL_ASSEMBLY.version,
    source: MEAL_ASSEMBLY.source,
    status: MEAL_ASSEMBLY.status,
    passed: mealAudits.every((audit) => audit.passed),
    meals: mealAudits
  };
}

function serializeBreakfastOption(meal, style) {
  if (!meal || meal.error) return null;

  return {
    style,
    ingredients: (meal.ingredients || []).map((item) => ({
      name: item.name,
      name_en: item.name_en || null,
      portionG: item.portionG,
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
      source_id: item.source_id || null,
    })),
    totalMacros: {
      calories: Math.round(Number(meal.totalCalories || 0)),
      protein: Math.round(Number(meal.totalMacros?.protein || 0) * 10) / 10,
      carbs: Math.round(Number(meal.totalMacros?.carbs || 0) * 10) / 10,
      fat: Math.round(Number(meal.totalMacros?.fat || 0) * 10) / 10,
    },
  };
}

async function generateBreakfastOptions(pool, userProfile, targetDate) {
  const date = targetDate || new Date().toISOString().split('T')[0];
  const buildForStyle = async (style) => {
    const plan = await generateDayPlan(pool, {
      ...userProfile,
      breakfastChoice: style,
      breakfastChoiceReason: 'breakfast_options_preview',
    }, date);
    const breakfast = (plan.meals || []).find((meal) => meal.mealType === 'breakfast');
    return serializeBreakfastOption(breakfast, style);
  };

  const [sweet, savory] = await Promise.all([
    buildForStyle('sweet'),
    buildForStyle('savory'),
  ]);

  if (!sweet || !savory) {
    const error = new Error('breakfast_options_unavailable');
    error.code = 'breakfast_options_unavailable';
    throw error;
  }

  return { date, sweet, savory };
}

function publicWorkoutTargets(targets = null) {
  if (!targets) return null;
  return {
    carbs_g: targets.targetCarbsG || null,
    protein_g: targets.targetProteinG || null,
    fat_g_max: targets.maxFatG || null,
  };
}

function buildWorkoutBlockPayload(mealType, workoutContext, userProfile = {}) {
  const targets = getWorkoutBlockTargets(mealType, workoutContext, userProfile);
  if (!targets) return null;

  return {
    meal_type: mealType,
    role: targets.role,
    time_slot: workoutContext.timeSlot,
    raw_time_slot: workoutContext.rawTimeSlot,
    sport: workoutContext.sport || null,
    sport_group: workoutContext.sportGroup,
    sport_modifier: workoutContext.sportModifier?.label || 'balanced',
    resolved: workoutContext.resolved,
    defaulted: workoutContext.defaulted,
    timing: targets.timing || null,
    timing_window_min: targets.timingWindowMin || null,
    targets: publicWorkoutTargets(targets),
    source: WORKOUT_NUTRITION.source,
    version: WORKOUT_NUTRITION.version,
    status: WORKOUT_NUTRITION.validationStatus,
  };
}

function annotateWorkoutBlocks(meals, workoutContext, userProfile = {}) {
  if (!workoutContext?.active) return meals;

  for (const meal of meals) {
    const payload = buildWorkoutBlockPayload(meal.mealType, workoutContext, userProfile);
    if (!payload) continue;
    meal.workout_block = payload;
    meal.workoutBlock = payload;
  }

  return meals;
}

function buildWorkoutNutritionMetadata(meals, workoutContext, userProfile = {}) {
  if (!workoutContext?.active) {
    return {
      active: false,
      version: WORKOUT_NUTRITION.version,
      source: WORKOUT_NUTRITION.source,
    };
  }

  const blocks = {};
  for (const meal of meals) {
    if (meal.workout_block) blocks[meal.mealType] = meal.workout_block;
  }

  return {
    active: true,
    version: WORKOUT_NUTRITION.version,
    source: WORKOUT_NUTRITION.source,
    status: WORKOUT_NUTRITION.validationStatus,
    time_slot: workoutContext.timeSlot,
    raw_time_slot: workoutContext.rawTimeSlot,
    resolved: workoutContext.resolved,
    defaulted: workoutContext.defaulted,
    sport: workoutContext.sport || null,
    sport_group: workoutContext.sportGroup,
    sport_modifier: workoutContext.sportModifier?.label || 'balanced',
    structure: meals.map((meal) => meal.mealType),
    main_pre_meal: workoutContext.config?.mainPreMeal || null,
    blocks,
    science_note: WORKOUT_NUTRITION.scienceNotes.antiMyth,
    config: {
      time_slot_label: workoutContext.config?.label || null,
      defaulted_from: workoutContext.config?.defaultedFrom || null,
    },
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
  const workoutContext = resolveWorkoutNutritionContext(userProfile);
  const rng = createRng(`${userProfile.userId || 'anonymous'}:${date}:${workoutContext.timeSlot || userProfile.trainingTime || 'rest'}:${workoutContext.sportGroup}:${breakfastChoice || breakfastPref}`);
  const userPathologies = normalizeUserPathologies(userProfile.pathologies || []);
  const engineProfile = {
    ...userProfile,
    hasDiabeticNeed: pathologyCols.includes('ok_diabetic') || userPathologies.includes('diabetic'),
    workoutNutritionContext: workoutContext,
  };

  const rawEligibleIngredients = await loadEligibleIngredients(pool, dietCol, allergenCols);
  const seasonalityResult = applySeasonalityFilter(rawEligibleIngredients, date, engineProfile);
  const eligibleIngredients = seasonalityResult.ingredients;
  const safeIngredients = applyPathologyFilter(eligibleIngredients, userPathologies);
  const pathologyFilter = calcPathologyExclusions(eligibleIngredients, userPathologies);
  const trainingToday = isTrainingDay(userProfile, date);
  const mealTypes = trainingToday
    ? buildDayStructure(workoutContext.timeSlot || userProfile.trainingTime, { skipBreakfast, workoutContext })
    : buildDayStructure(null, { skipBreakfast });
  const totalFraction = mealTypes.reduce((sum, mealType) => sum + getMealFraction(mealType, workoutContext), 0);
  const dayTracker = buildVarietyTracker();
  const meals = [];

  for (const mealType of mealTypes) {
    const fraction = getMealFraction(mealType, workoutContext) / totalFraction;
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

  const adjustedMeals = enforceMealCeilings(
    enforceMainMealDistributionFloors(
      enforceProteinFloors(
        enforceWorkoutNutritionBlocks(
          adjustMacros(meals, dailyCal, dailyProtein, dailyCarbs, dailyFat),
          engineProfile
        ),
        engineProfile
      ),
      engineProfile
    ),
    engineProfile,
    dailyCal,
    dailyProtein
  );
  enforcePlantVariety(adjustedMeals, safeIngredients, dayTracker, rng, engineProfile, date);
  enforceMealCeilings(adjustedMeals, engineProfile, dailyCal, dailyProtein);
  adjustedMeals
    .filter((meal) => isMainMeal(meal.mealType))
    .forEach((meal) => {
      meal.plateStructure = validatePlateStructureForMeal(meal, engineProfile);
      meal.plate_structure = meal.plateStructure;
    });
  annotateWorkoutBlocks(adjustedMeals, workoutContext, engineProfile);
  adjustedMeals.forEach((meal) => annotateMealAssembly(meal, engineProfile));
  const generatedBreakfastStyle = adjustedMeals
    .find((meal) => meal.mealType === 'breakfast')
    ?.breakfast_style || null;

  return {
    userId: userProfile.userId,
    date,
    isTrainingDay: trainingToday,
    has_training: trainingToday,
    training_resolved: trainingToday ? workoutContext.resolved : false,
    training_defaulted: trainingToday ? workoutContext.defaulted : false,
    training_time_slot: trainingToday ? workoutContext.timeSlot : null,
    targetCalories: dailyCal,
    targetProtein: dailyProtein,
    targetCarbs: dailyCarbs,
    targetFat: dailyFat,
    breakfast: {
      preference: breakfastPref,
      choice: breakfastChoice,
      skipped: skipBreakfast,
      style: breakfastStyle,
      generated_style: generatedBreakfastStyle,
      reason: breakfastChoice ? (userProfile.breakfastChoiceReason || 'breakfast_choice') : null,
    },
    workoutNutrition: buildWorkoutNutritionMetadata(adjustedMeals, workoutContext, engineProfile),
    proteinFloor: {
      lunchDinnerG: proteinFloorForMeal(engineProfile),
      source: 'config/meal-floors.js',
    },
    mealFloors: {
      proteinPerMainMealG: proteinFloorForMeal(engineProfile),
      proteinMaxPerMealG: proteinCeilingForMeal(engineProfile),
      maxMealCaloriesKcal: mealCalorieCeiling(dailyCal),
      maxMealCalorieFraction: positiveConfigNumber(MEAL_FLOORS.max_meal_calorie_fraction, 0.4),
      mainMealFiberG: mainMealFiberFloor(engineProfile),
      mainMealVegetableG: mainMealVegetableFloor(engineProfile),
      dinnerFatG: dinnerFatFloor(engineProfile),
      denseVegetableMaxPortionG: positiveConfigNumber(MEAL_FLOORS.dense_vegetable_max_portion_g, 40),
      source: 'config/meal-floors.js',
      status: 'provisional_da_validare_col_nutrizionista',
    },
    mealFloorAudit: buildMealFloorAudit(adjustedMeals, engineProfile, dailyCal),
    plateStructureAudit: buildPlateStructureAudit(adjustedMeals, engineProfile),
    mealGrammarAudit: buildMealGrammarAudit(adjustedMeals, engineProfile),
    mealAssemblyAudit: buildMealAssemblyAudit(adjustedMeals),
    plantVarietyAudit: buildPlantVarietyAudit(adjustedMeals),
    meals: adjustedMeals,
    daySummary: buildDaySummary(adjustedMeals),
    gi_summary: calcDailyGiSummary(adjustedMeals),
    pathology_filter: pathologyFilter,
    seasonality_filter: seasonalityResult.audit,
    eligibleIngredientsCount: eligibleIngredients.length,
    eligibleIngredientsRawCount: rawEligibleIngredients.length,
    restrictionsApplied: {
      allergenCols,
      pathologyCols,
    },
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  generateDayPlan,
  generateBreakfastOptions,
  giScore,
  calcDailyGiSummary,
  applyPathologyFilter,
  calcPathologyExclusions
};
