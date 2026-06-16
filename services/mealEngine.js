'use strict';

/**
 * DUBI Meal Engine v2
 * Generates a personalized daily meal plan from the ingredients table.
 * No OpenAI dependency: pure nutritional logic.
 */

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
  diabete: 'ok_diabetic',
  diabetico: 'ok_diabetic',
  gerd: 'ok_gerd',
  reflusso: 'ok_gerd',
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
  breakfast: 0.25,
  pre_workout: 0.12,
  post_workout: 0.18,
  lunch: 0.30,
  snack: 0.08,
  dinner: 0.25,
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

function buildDayStructure(trainingTime) {
  const base = ['breakfast', 'lunch', 'snack', 'dinner'];
  if (!trainingTime) return base;

  const time = normalizeToken(trainingTime);
  if (['morning', 'mattina', 'mattino'].includes(time)) {
    return ['pre_workout', 'post_workout', 'breakfast', 'lunch', 'snack', 'dinner'];
  }
  if (['afternoon', 'pomeriggio'].includes(time)) {
    return ['breakfast', 'lunch', 'pre_workout', 'post_workout', 'snack', 'dinner'];
  }
  if (['evening', 'sera'].includes(time)) {
    return ['breakfast', 'lunch', 'snack', 'pre_workout', 'post_workout', 'dinner'];
  }
  return base;
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

function giScore(giNumeric, userProfile = {}) {
  const gi = Number(giNumeric);
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

async function loadEligibleIngredients(pool, dietCol, allergenCols, pathologyCols) {
  const conditions = ['i.is_active = true', `i.${dietCol} = true`];

  for (const col of allergenCols) conditions.push(`i.${col} = false`);
  for (const col of pathologyCols) conditions.push(`i.${col} = true`);

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
        giScore(candidate.gi_numeric, rankingProfile),
    }))
    .sort((a, b) => b.score - a.score || String(a.candidate.name).localeCompare(String(b.candidate.name)))
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
    gi_numeric: Number.isFinite(Number(ingredient.gi_numeric)) ? Number(ingredient.gi_numeric) : null,
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

function recomputeMealTotals(meal) {
  meal.totalCalories = Math.round(meal.ingredients.reduce((sum, item) => sum + (item.calories || 0), 0));
  meal.totalMacros = {
    protein: Math.round(meal.ingredients.reduce((sum, item) => sum + (item.protein || 0), 0) * 10) / 10,
    carbs: Math.round(meal.ingredients.reduce((sum, item) => sum + (item.carbs || 0), 0) * 10) / 10,
    fat: Math.round(meal.ingredients.reduce((sum, item) => sum + (item.fat || 0), 0) * 10) / 10,
    fiber: Math.round(meal.ingredients.reduce((sum, item) => sum + (item.fiber || 0), 0) * 10) / 10,
  };
}

function calcDailyGiSummary(mealPlan) {
  const meals = Array.isArray(mealPlan) ? mealPlan : [];
  const allIngredients = meals.flatMap((meal) => Array.isArray(meal.ingredients) ? meal.ingredients : []);
  const totalIngredients = allIngredients.length;
  const ingredientsWithGi = allIngredients.filter((item) => Number.isFinite(Number(item.gi_numeric))).length;

  if (ingredientsWithGi === 0) {
    return {
      avgGi: null,
      giCategory: 'unknown',
      ingredientsWithGi,
      totalIngredients,
    };
  }

  const coverage = totalIngredients > 0 ? ingredientsWithGi / totalIngredients : 0;
  const weighted = allIngredients.reduce((acc, item) => {
    const gi = Number(item.gi_numeric);
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

  return {
    avgGi,
    giCategory,
    ingredientsWithGi,
    totalIngredients,
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

    if (candidates.length === 0) {
      if (config && config.required) {
        console.error(`[mealEngine] No eligible ingredients for required slot "${slot}" in "${mealType}"`);
      }
      continue;
    }

    const count = Number(config && config.count) || 1;
    for (let index = 0; index < count; index++) {
      const chosen = pickIngredient(
        candidates,
        dayTracker,
        mealTracker,
        rng,
        { ...userProfile, currentMealType: mealType },
        `${userProfile.userId || 'anonymous'}:${date}:${mealType}:${slot}:${index}`
      );
      if (!chosen) break;

      recordVariety(chosen, dayTracker, mealTracker);
      const portionG = calcPortion(chosen, caloriesPerSlot);
      meal.ingredients.push(buildPlanItem(chosen, slot, portionG));
    }
  }

  recomputeMealTotals(meal);
  return meal;
}

function adjustItemPortion(item, ratio) {
  const bounds = getPortionBounds(item.category);
  const nextPortion = Math.round(Math.max(bounds.min, Math.min(bounds.max, item.portionG * ratio)));
  if (nextPortion === item.portionG) return;

  item.portionG = nextPortion;
  const macros = macrosForPortion(item, nextPortion);
  item.calories = macros.calories;
  item.protein = macros.protein;
  item.carbs = macros.carbs;
  item.fat = macros.fat;
  item.fiber = macros.fiber;
}

function adjustMacros(meals, dailyCalTarget, dailyProteinTarget) {
  const actualCal = meals.reduce((sum, meal) => sum + (meal.totalCalories || 0), 0);
  const actualProtein = meals.reduce((sum, meal) => sum + (meal.totalMacros?.protein || 0), 0);
  const calRatio = dailyCalTarget / (actualCal || 1);
  const proteinRatio = dailyProteinTarget / (actualProtein || 1);

  if (Math.abs(calRatio - 1) < 0.1 && Math.abs(proteinRatio - 1) < 0.15) {
    return meals;
  }

  const boundedProteinRatio = Math.max(0.75, Math.min(1.35, proteinRatio));
  const boundedCalRatio = Math.max(0.75, Math.min(1.35, calRatio));

  for (const meal of meals) {
    if (!['lunch', 'dinner', 'post_workout'].includes(meal.mealType)) continue;

    for (const item of meal.ingredients) {
      if (['protein_animal', 'protein_plant', 'legume'].includes(item.category)) {
        adjustItemPortion(item, boundedProteinRatio);
      } else if (item.category === 'grain') {
        adjustItemPortion(item, boundedCalRatio);
      }
    }

    recomputeMealTotals(meal);
  }

  return meals;
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
  const rng = createRng(`${userProfile.userId || 'anonymous'}:${date}:${userProfile.trainingTime || 'rest'}`);
  const userPathologies = normalizeUserPathologies(userProfile.pathologies || []);
  const engineProfile = {
    ...userProfile,
    hasDiabeticNeed: pathologyCols.includes('ok_diabetic') || userPathologies.includes('diabetic'),
  };

  const eligibleIngredients = await loadEligibleIngredients(pool, dietCol, allergenCols, pathologyCols);
  const safeIngredients = applyPathologyFilter(eligibleIngredients, userPathologies);
  const pathologyFilter = calcPathologyExclusions(eligibleIngredients, userPathologies);
  const trainingToday = isTrainingDay(userProfile, date);
  const mealTypes = trainingToday ? buildDayStructure(userProfile.trainingTime) : buildDayStructure(null);
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

  const adjustedMeals = adjustMacros(meals, dailyCal, dailyProtein);

  return {
    userId: userProfile.userId,
    date,
    isTrainingDay: trainingToday,
    targetCalories: dailyCal,
    targetProtein: dailyProtein,
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
