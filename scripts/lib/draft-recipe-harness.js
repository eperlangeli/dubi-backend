const fs = require('fs');
const path = require('path');

const RECIPE_FILES = Object.freeze([
  'pilot-01.json',
  'pilot-02.json',
  'pilot-03.json',
  'pilot-04.json',
  'pilot-05.json',
  'pilot-06.json',
  'pilot-07.json',
]);

const ENGINE_PATH = 'local_draft_recipe_harness_v1';
const RECIPE_SOURCE = 'controlled_draft_corpus';
const SELECTION_STRATEGY = 'day_level_macro_optimizer_v1';
const EVENT_SHORTLIST_LIMIT = 32;
const BEAM_WIDTH = 2500;
const BLOCKING_ERROR_CODES = Object.freeze({
  corpusCountInvalid: 'HARNESS_CORPUS_COUNT_INVALID',
  duplicateRecipeKey: 'HARNESS_DUPLICATE_RECIPE_KEY',
  reviewRecordMissing: 'HARNESS_REVIEW_RECORD_MISSING',
  nonCleanIngredient: 'HARNESS_NON_CLEAN_INGREDIENT',
  noEligibleRecipe: 'NO_ELIGIBLE_DRAFT_RECIPE',
  varietyConstraintFailure: 'VARIETY_CONSTRAINT_FAILURE',
  ambiguousSchedule: 'AMBIGUOUS_MEAL_SCHEDULE',
});

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function parseNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function hashString(input) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededUnit(seed) {
  let value = hashString(seed) || 1;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return ((value >>> 0) % 1000000) / 1000000;
}

function minutesFromTime(time) {
  if (typeof time !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function normalizeMealType(scheduleKey) {
  if (scheduleKey === 'snack_1' || scheduleKey === 'snack_2') return 'snack';
  return scheduleKey;
}

function mealTimeLimit(profile, mealType) {
  const limits = profile.kitchen_time || {};
  if (mealType === 'breakfast') return limits.breakfast_max_min;
  if (mealType === 'lunch') return limits.lunch_max_min;
  if (mealType === 'dinner') return limits.dinner_max_min;
  return null;
}

function loadDraftRecipes(rootDir) {
  return RECIPE_FILES.flatMap((fileName) => {
    const fullPath = path.join(rootDir, 'data', 'recipe-drafts', fileName);
    const parsed = readJson(fullPath);
    const recipes = Array.isArray(parsed) ? parsed : parsed.recipes;
    if (!Array.isArray(recipes)) return [];
    return recipes.map((recipe) => ({ ...recipe, _source_file: fileName }));
  });
}

function loadReviewRecords(rootDir) {
  const parsed = readJson(path.join(rootDir, 'data', 'review-packs', 'recipe-nutrition-review-v1.json'));
  const records = Array.isArray(parsed) ? parsed : parsed.records;
  const lookup = new Map();
  records.forEach((record) => {
    lookup.set(record.authoring_key, {
      authoring_key: record.authoring_key,
      calories: parseNumber(record.calories),
      protein_g: parseNumber(record.protein_g),
      carbs_g: parseNumber(record.carbs_g),
      fat_g: parseNumber(record.fat_g),
      fiber_g: parseNumber(record.fiber_g),
      final_nutrition_status: record.final_nutrition_status,
    });
  });
  return { records, lookup };
}

function loadCleanWhitelist(rootDir) {
  const parsed = readJson(path.join(rootDir, 'data', 'ingredient-whitelists', 'clean-v1.json'));
  const cleanIds = new Set((parsed.clean_ingredients || []).map((entry) => entry.ingredient_id));
  const excludedById = new Map((parsed.excluded_ingredients || []).map((entry) => [entry.ingredient_id, entry]));
  return { raw: parsed, cleanIds, excludedById };
}

function loadFakeProfiles(rootDir) {
  const parsed = readJson(path.join(rootDir, 'data', 'test-profiles', 'fake-profiles-v1.json'));
  return Array.isArray(parsed) ? parsed : parsed.profiles;
}

function validateCorpus(recipes, reviewLookup, whitelist) {
  const failures = [];
  const keys = new Set();
  const names = new Set();

  if (recipes.length !== 130) {
    failures.push({ code: BLOCKING_ERROR_CODES.corpusCountInvalid, message: `recipes loaded = ${recipes.length}, expected 130` });
  }

  recipes.forEach((recipe) => {
    if (keys.has(recipe.authoring_key)) {
      failures.push({ code: BLOCKING_ERROR_CODES.duplicateRecipeKey, authoring_key: recipe.authoring_key });
    }
    keys.add(recipe.authoring_key);

    const normalizedName = String(recipe.name || '').trim().toLowerCase();
    if (names.has(normalizedName)) {
      failures.push({ code: BLOCKING_ERROR_CODES.duplicateRecipeKey, authoring_key: recipe.authoring_key, message: `duplicate recipe name ${recipe.name}` });
    }
    names.add(normalizedName);

    if (!reviewLookup.has(recipe.authoring_key)) {
      failures.push({ code: BLOCKING_ERROR_CODES.reviewRecordMissing, authoring_key: recipe.authoring_key });
    }

    (recipe.ingredients || []).forEach((ingredient) => {
      if (!whitelist.cleanIds.has(ingredient.ingredient_id)) {
        const excluded = whitelist.excludedById.get(ingredient.ingredient_id);
        failures.push({
          code: BLOCKING_ERROR_CODES.nonCleanIngredient,
          authoring_key: recipe.authoring_key,
          ingredient_id: ingredient.ingredient_id,
          ingredient_name: ingredient.ingredient_name,
          classification: excluded ? excluded.classification : 'UNCLASSIFIED',
          reason: excluded ? excluded.reason : 'Ingredient is not present in clean or excluded whitelist sections',
        });
      }
    });
  });

  return {
    valid: failures.length === 0,
    recipes_loaded: recipes.length,
    unique_authoring_keys: keys.size,
    review_records: reviewLookup.size,
    failures,
  };
}

function loadHarnessData(rootDir = process.cwd()) {
  const recipes = loadDraftRecipes(rootDir);
  const review = loadReviewRecords(rootDir);
  const whitelist = loadCleanWhitelist(rootDir);
  const profiles = loadFakeProfiles(rootDir);
  const corpus = validateCorpus(recipes, review.lookup, whitelist);
  return {
    recipes,
    reviewRecords: review.records,
    reviewLookup: review.lookup,
    whitelist,
    profiles,
    corpus,
  };
}

function adaptProfile(profile) {
  return {
    profile_id: profile.profile_id,
    target_kcal: profile.target_kcal,
    target_macros: profile.target_macros,
    dietary_style: profile.dietary_style,
    preferences: profile.preferences || [],
    excluded_food_preferences: profile.excluded_food_preferences || [],
    meal_count: profile.meal_count,
    meal_schedule: profile.meal_schedule || {},
    training: profile.training || {},
    breakfast_preference: profile.breakfast_preference,
    kitchen_time: profile.kitchen_time || {},
    equipment: profile.equipment || [],
    budget_level: profile.budget_level,
    unsupported_fields: [
      'preferences',
      'excluded_food_preferences',
      'budget_level',
      'allergies',
      'intolerances',
    ],
  };
}

function workoutRelationForEvent(event, profile) {
  const training = profile.training || {};
  if (!training.training_day || !training.start_time) return 'rest_day_no_workout_relation';

  const start = minutesFromTime(training.start_time);
  const duration = Number(training.duration_min || 0);
  const end = start === null ? null : start + duration;
  const eventTime = minutesFromTime(event.scheduled_time);
  if (start === null || end === null || eventTime === null) return 'workout_timing_ambiguous';

  if (event.meal_type === 'pre_workout') {
    return eventTime < start ? 'explicit_pre_workout' : 'pre_workout_after_training_warning';
  }
  if (event.meal_type === 'post_workout') {
    return eventTime >= end ? 'explicit_post_workout' : 'post_workout_before_training_end_warning';
  }
  if ((event.meal_type === 'lunch' || event.meal_type === 'dinner') && eventTime >= end && eventTime - end <= 120) {
    return 'post_workout_full_meal';
  }
  if ((event.meal_type === 'lunch' || event.meal_type === 'dinner') && start - eventTime >= 120 && eventTime < start) {
    return 'pre_workout_full_meal_2h_plus';
  }
  return 'no_direct_workout_relation';
}

function buildDayStructure(profile) {
  const failures = [];
  const schedule = profile.meal_schedule || {};
  const events = Object.entries(schedule).map(([key, scheduledTime]) => ({
    source_key: key,
    meal_type: normalizeMealType(key),
    scheduled_time: scheduledTime,
    scheduled_minutes: minutesFromTime(scheduledTime),
  }));

  if (events.some((event) => event.scheduled_minutes === null)) {
    failures.push({ code: BLOCKING_ERROR_CODES.ambiguousSchedule, message: 'One or more scheduled times are invalid or missing' });
  }
  if (events.length > 6) {
    failures.push({ code: BLOCKING_ERROR_CODES.ambiguousSchedule, message: `meal events = ${events.length}, max allowed is 6` });
  }
  if (events.length !== profile.meal_count) {
    failures.push({ code: BLOCKING_ERROR_CODES.ambiguousSchedule, message: `meal_schedule count = ${events.length}, meal_count = ${profile.meal_count}` });
  }

  events.sort((a, b) => a.scheduled_minutes - b.scheduled_minutes);
  events.forEach((event, index) => {
    event.event_index = index;
    event.workout_relation = workoutRelationForEvent(event, profile);
  });

  return { events, failures };
}

function hasCompatibleEquipment(recipe, profile) {
  const recipeEquipment = Array.isArray(recipe.equipment) ? recipe.equipment : [];
  const profileEquipment = new Set(profile.equipment || []);
  if (recipeEquipment.length === 0 || recipeEquipment.includes('none')) return true;
  if (profileEquipment.has('none')) return false;
  return recipeEquipment.every((item) => profileEquipment.has(item));
}

function hasCompatibleTime(recipe, profile, mealType) {
  const limit = mealTimeLimit(profile, mealType);
  if (!Number.isFinite(limit)) return true;
  return Number(recipe.prep_time_min || 0) + Number(recipe.cook_time_min || 0) <= limit;
}

function normalizedText(recipe) {
  return [
    recipe.name,
    recipe.description,
    recipe.recipe_format_code,
    ...(recipe.ingredients || []).map((ingredient) => ingredient.ingredient_name),
  ].join(' ').toLowerCase();
}

function deterministicPreferenceAllowed(recipe, profile) {
  const text = normalizedText(recipe);
  const exclusions = profile.excluded_food_preferences || [];

  const exclusionRules = [
    { pattern: /mushroom|funghi|shiitake/i, phrases: ['no mushrooms'] },
    { pattern: /pollo|tacchino|manzo|bresaola|prosciutto|sardine|merluzzo|tonno|salmone|gamber/i, phrases: ['no meat', 'no fish'] },
    { pattern: /pollo|tacchino|chicken|turkey/i, phrases: ['no chicken'] },
    { pattern: /manzo|bresaola|red meat/i, phrases: ['no red meat'] },
    { pattern: /drink|smoothie/i, phrases: ['no sweet drinks'] },
  ];

  return !exclusionRules.some((rule) => (
    exclusions.some((phrase) => phrase.toLowerCase() === rule.phrases[0])
    && rule.pattern.test(text)
  ));
}

function hasCompatibleDietaryStyle(recipe, profile) {
  const style = String(profile.dietary_style || 'omnivore').toLowerCase();
  if (style === 'omnivore') return true;
  const text = normalizedText(recipe);
  const meat = /pollo|tacchino|manzo|bresaola|prosciutto|chicken|turkey|beef/i;
  const fish = /sardine|merluzzo|tonno|salmone|gamber|fish|cod|tuna|salmon/i;
  const eggsDairy = /uovo|yogurt|ricotta|mozzarella|fiocchi di latte|latte|skyr|parmigiano|feta/i;
  if (style === 'pescatarian') return !meat.test(text);
  if (style === 'vegetarian') return !meat.test(text) && !fish.test(text);
  if (style === 'vegan') return !meat.test(text) && !fish.test(text) && !eggsDairy.test(text);
  return true;
}

function hasCompatibleBreakfastStyle(recipe, profile, mealType) {
  if (mealType !== 'breakfast') return true;
  const preference = String(profile.breakfast_preference || '').toLowerCase();
  if (!preference || preference === 'balanced') return true;
  if (preference === 'savory') return recipe.breakfast_style === 'savory' || recipe.breakfast_style === 'both';
  if (preference === 'sweet') return recipe.breakfast_style === 'sweet' || recipe.breakfast_style === 'both';
  return true;
}

function eligibleRecipesForEvent(recipes, event, profile, usedKeys) {
  return recipes
    .filter((recipe) => Array.isArray(recipe.eligible_meal_types) && recipe.eligible_meal_types.includes(event.meal_type))
    .filter((recipe) => !usedKeys.has(recipe.authoring_key))
    .filter((recipe) => hasCompatibleEquipment(recipe, profile))
    .filter((recipe) => hasCompatibleTime(recipe, profile, event.meal_type))
    .filter((recipe) => deterministicPreferenceAllowed(recipe, profile))
    .filter((recipe) => hasCompatibleDietaryStyle(recipe, profile))
    .filter((recipe) => hasCompatibleBreakfastStyle(recipe, profile, event.meal_type));
}

function mealMacroTarget(profile, events) {
  const count = Math.max(events.length, 1);
  return {
    kcal: profile.target_kcal / count,
    protein_g: profile.target_macros.protein_g / count,
    carbs_g: profile.target_macros.carbs_g / count,
    fat_g: profile.target_macros.fat_g / count,
  };
}

function scoreRecipe(recipe, nutrition, target) {
  const kcalScore = Math.abs(nutrition.calories - target.kcal) / Math.max(target.kcal, 1);
  const proteinScore = Math.abs(nutrition.protein_g - target.protein_g) / Math.max(target.protein_g, 1);
  const fatScore = Math.abs(nutrition.fat_g - target.fat_g) / Math.max(target.fat_g, 1);
  const targetProteinRatio = target.protein_g / Math.max(target.kcal, 1);
  const recipeProteinRatio = nutrition.protein_g / Math.max(nutrition.calories, 1);
  const proteinDensityShortfall = Math.max(0, targetProteinRatio - recipeProteinRatio)
    / Math.max(targetProteinRatio, 0.001);
  return kcalScore + proteinScore * 0.8 + fatScore * 0.2 + proteinDensityShortfall;
}

function scoreDayCombination(items, profile, testDate) {
  const target = {
    kcal: profile.target_kcal,
    protein_g: profile.target_macros.protein_g,
    carbs_g: profile.target_macros.carbs_g,
    fat_g: profile.target_macros.fat_g,
  };
  const totals = items.reduce((acc, item) => {
    const nutrition = item.nutrition;
    acc.kcal += nutrition.calories;
    acc.protein_g += nutrition.protein_g;
    acc.carbs_g += nutrition.carbs_g;
    acc.fat_g += nutrition.fat_g;
    return acc;
  }, { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });

  if (totals.kcal <= 0) {
    return {
      score: Number.POSITIVE_INFINITY,
      totals,
      estimatedScale: 1,
      estimatedScaled: { protein_g: 0, carbs_g: 0, fat_g: 0 },
    };
  }

  const estimatedScale = target.kcal / totals.kcal;
  const estimatedScaled = {
    protein_g: totals.protein_g * estimatedScale,
    carbs_g: totals.carbs_g * estimatedScale,
    fat_g: totals.fat_g * estimatedScale,
  };
  const proteinDeficit = Math.max(0, target.protein_g - estimatedScaled.protein_g) / Math.max(target.protein_g, 1);
  const proteinExcess = Math.max(0, estimatedScaled.protein_g - target.protein_g) / Math.max(target.protein_g, 1);
  const proteinOvershoot = Math.max(0, estimatedScaled.protein_g - target.protein_g * 1.15) / Math.max(target.protein_g, 1);
  const fatDeviation = Math.abs(estimatedScaled.fat_g - target.fat_g) / Math.max(target.fat_g, 1);
  const carbDeviation = Math.abs(estimatedScaled.carbs_g - target.carbs_g) / Math.max(target.carbs_g, 1);
  const scaleDistance = Math.abs(estimatedScale - 1);
  const aggressiveScalePenalty = estimatedScale > 1.5
    ? (estimatedScale - 1.5) * 8
    : estimatedScale < 0.7
      ? (0.7 - estimatedScale) * 8
      : 0;
  const localRankPenalty = items.reduce((sum, item) => sum + item.localRank, 0) * 0.0005;
  const tieSeed = `${profile.profile_id}:${testDate}:${items.map((item) => item.recipe.authoring_key).join('|')}`;
  const deterministicTieBreak = seededUnit(tieSeed) * 0.000001;

  return {
    score: proteinDeficit * 12
      + proteinExcess * 4
      + proteinOvershoot * 12
      + fatDeviation * 1.5
      + carbDeviation
      + scaleDistance * 2
      + aggressiveScalePenalty
      + localRankPenalty
      + deterministicTieBreak,
    totals,
    estimatedScale,
    estimatedScaled,
  };
}

function rankedCandidatesForEvent(recipes, event, profile, reviewLookup, events) {
  const eligible = eligibleRecipesForEvent(recipes, event, profile, new Set());
  const target = mealMacroTarget(profile, events);
  return eligible
    .map((recipe) => ({
      recipe,
      nutrition: reviewLookup.get(recipe.authoring_key),
      score: scoreRecipe(recipe, reviewLookup.get(recipe.authoring_key), target),
    }))
    .sort((a, b) => a.score - b.score || a.recipe.authoring_key.localeCompare(b.recipe.authoring_key))
    .map((candidate, index) => ({
      ...candidate,
      localRank: index + 1,
    }));
}

function selectRecipesForDay(recipes, events, profile, reviewLookup, testDate) {
  const rankedByEvent = events.map((event) => rankedCandidatesForEvent(recipes, event, profile, reviewLookup, events));
  const zeroIndex = rankedByEvent.findIndex((ranked) => ranked.length === 0);
  if (zeroIndex !== -1) {
    const event = events[zeroIndex];
    return {
      failure: {
        code: BLOCKING_ERROR_CODES.noEligibleRecipe,
        event_index: event.event_index,
        meal_type: event.meal_type,
        scheduled_time: event.scheduled_time,
      },
      diagnostics: {
        selection_strategy: SELECTION_STRATEGY,
        optimizer: {
          candidates_per_event: rankedByEvent.map((ranked, index) => ({
            event_index: events[index].event_index,
            meal_type: events[index].meal_type,
            candidates: ranked.length,
          })),
          combinations_evaluated: 0,
        },
      },
    };
  }

  const shortlists = rankedByEvent.map((ranked) => ranked.slice(0, Math.min(EVENT_SHORTLIST_LIMIT, ranked.length)));
  let combinationsEvaluated = 0;
  let beam = [{
    items: [],
    usedKeys: new Set(),
    partialScore: 0,
  }];

  shortlists.forEach((shortlist) => {
    const next = [];
    beam.forEach((state) => {
      shortlist.forEach((candidate) => {
        if (state.usedKeys.has(candidate.recipe.authoring_key)) return;
        const items = [...state.items, candidate];
        const usedKeys = new Set(state.usedKeys);
        usedKeys.add(candidate.recipe.authoring_key);
        const evaluation = scoreDayCombination(items, profile, testDate);
        combinationsEvaluated += 1;
        next.push({
          items,
          usedKeys,
          partialScore: evaluation.score,
        });
      });
    });
    next.sort((a, b) => {
      if (a.partialScore !== b.partialScore) return a.partialScore - b.partialScore;
      return a.items.map((item) => item.recipe.authoring_key).join('|')
        .localeCompare(b.items.map((item) => item.recipe.authoring_key).join('|'));
    });
    beam = next.slice(0, BEAM_WIDTH);
  });

  const rankedFinal = beam
    .map((state) => ({
      ...state,
      evaluation: scoreDayCombination(state.items, profile, testDate),
    }))
    .sort((a, b) => {
      if (a.evaluation.score !== b.evaluation.score) return a.evaluation.score - b.evaluation.score;
      return a.items.map((item) => item.recipe.authoring_key).join('|')
        .localeCompare(b.items.map((item) => item.recipe.authoring_key).join('|'));
    });
  const winner = rankedFinal[0];

  return {
    selected: winner.items.map((item, index) => ({
      event: events[index],
      recipe: item.recipe,
      selection_rank_within_event: item.localRank,
    })),
    diagnostics: {
      selection_strategy: SELECTION_STRATEGY,
      optimizer: {
        candidates_per_event: rankedByEvent.map((ranked, index) => ({
          event_index: events[index].event_index,
          meal_type: events[index].meal_type,
          candidates: ranked.length,
          shortlist: Math.min(EVENT_SHORTLIST_LIMIT, ranked.length),
        })),
        combinations_evaluated: combinationsEvaluated,
        winning_score: round(winner.evaluation.score, 6),
        base_day_kcal: round(winner.evaluation.totals.kcal),
        base_day_protein_g: round(winner.evaluation.totals.protein_g),
        base_day_carbs_g: round(winner.evaluation.totals.carbs_g),
        base_day_fat_g: round(winner.evaluation.totals.fat_g),
        estimated_global_scale: round(winner.evaluation.estimatedScale, 4),
        estimated_scaled_protein_g: round(winner.evaluation.estimatedScaled.protein_g),
        beam_width: BEAM_WIDTH,
        event_shortlist_limit: EVENT_SHORTLIST_LIMIT,
      },
    },
  };
}

function nutritionTotals(meals) {
  return meals.reduce((totals, meal) => {
    totals.kcal += meal.scaled_macros.kcal;
    totals.protein_g += meal.scaled_macros.protein_g;
    totals.carbs_g += meal.scaled_macros.carbs_g;
    totals.fat_g += meal.scaled_macros.fat_g;
    totals.fiber_g += meal.scaled_macros.fiber_g;
    return totals;
  }, { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 });
}

function buildBaseMeal(event, recipe, reviewLookup, selectionRankWithinEvent = null) {
  const nutrition = reviewLookup.get(recipe.authoring_key);
  return {
    event_index: event.event_index,
    meal_type: event.meal_type,
    scheduled_time: event.scheduled_time,
    authoring_key: recipe.authoring_key,
    recipe_name: recipe.name,
    recipe_format: recipe.recipe_format_code,
    source: RECIPE_SOURCE,
    base_recipe_macros: {
      kcal: round(nutrition.calories),
      protein_g: round(nutrition.protein_g),
      carbs_g: round(nutrition.carbs_g),
      fat_g: round(nutrition.fat_g),
      fiber_g: round(nutrition.fiber_g),
    },
    scale_factor: 1,
    scaled_macros: {
      kcal: round(nutrition.calories),
      protein_g: round(nutrition.protein_g),
      carbs_g: round(nutrition.carbs_g),
      fat_g: round(nutrition.fat_g),
      fiber_g: round(nutrition.fiber_g),
    },
    ingredients: (recipe.ingredients || []).map((ingredient) => ({
      ingredient_id: ingredient.ingredient_id,
      ingredient_name: ingredient.ingredient_name,
      measurement_basis: ingredient.measurement_basis,
      base_quantity_g: ingredient.quantity_g,
      scaled_quantity_g: ingredient.quantity_g,
    })),
    workout_relation: event.workout_relation,
    selection_rank_within_event: selectionRankWithinEvent,
  };
}

function applyUniformDayScaling(meals, profile, warnings) {
  const baseTotals = nutritionTotals(meals);
  if (baseTotals.kcal <= 0) {
    warnings.push('SCALING_SKIPPED_BASE_CALORIES_ZERO');
    return meals;
  }

  const scaleFactor = profile.target_kcal / baseTotals.kcal;
  warnings.push('LOCAL_UNIFORM_RECIPE_SCALING_ONLY');
  warnings.push('SAFETY_GATE_INCOMPLETE');

  return meals.map((meal) => ({
    ...meal,
    scale_factor: round(scaleFactor, 4),
    scaled_macros: {
      kcal: round(meal.base_recipe_macros.kcal * scaleFactor),
      protein_g: round(meal.base_recipe_macros.protein_g * scaleFactor),
      carbs_g: round(meal.base_recipe_macros.carbs_g * scaleFactor),
      fat_g: round(meal.base_recipe_macros.fat_g * scaleFactor),
      fiber_g: round(meal.base_recipe_macros.fiber_g * scaleFactor),
    },
    ingredients: meal.ingredients.map((ingredient) => ({
      ...ingredient,
      scaled_quantity_g: round(ingredient.base_quantity_g * scaleFactor),
    })),
  }));
}

function recipeEligibleForAssignedEvent(meal, recipesByKey) {
  const recipe = recipesByKey.get(meal.authoring_key);
  return Boolean(recipe && recipe.eligible_meal_types.includes(meal.meal_type));
}

function buildAssertions(result, profile, recipesByKey) {
  const kcalDeltaPct = Math.abs(result.delta.kcal_pct);
  return {
    calorie_target_pass: kcalDeltaPct <= 10,
    protein_target_pass: result.actual.protein_g >= profile.target_macros.protein_g * 0.9
      && result.actual.protein_g <= profile.target_macros.protein_g * 1.15,
    meal_count_pass: result.meal_count_actual === result.meal_count_target,
    timing_pass: result.failures.every((failure) => failure.code !== BLOCKING_ERROR_CODES.ambiguousSchedule)
      && result.meals.every((meal) => !meal.workout_relation.endsWith('_warning')),
    recipe_eligibility_pass: result.meals.every((meal) => recipeEligibleForAssignedEvent(meal, recipesByKey)),
    no_freeform_fallback_pass: result.meals.every((meal) => meal.source === RECIPE_SOURCE),
    variety_day_pass: new Set(result.meals.map((meal) => meal.authoring_key)).size === result.meals.length,
  };
}

function buildUnsupportedWarnings(profile) {
  return adaptProfile(profile).unsupported_fields.map((field) => ({
    code: 'NOT_ENFORCED_IN_PHASE_3B',
    field,
  }));
}

function generateDraftRecipeDay(profileInput, options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const testDate = options.testDate || options.date || '2026-09-01';
  const data = options.data || loadHarnessData(rootDir);
  const profile = adaptProfile(profileInput);
  const warnings = buildUnsupportedWarnings(profileInput);
  const failures = [...data.corpus.failures];

  if (!data.corpus.valid) {
    return {
      profile_id: profile.profile_id,
      test_date: testDate,
      engine_path: ENGINE_PATH,
      generation_status: 'BLOCKED_CORPUS_INVALID',
      failures,
      warnings,
    };
  }

  const { events, failures: structureFailures } = buildDayStructure(profile);
  failures.push(...structureFailures);

  const daySelection = failures.length === 0
    ? selectRecipesForDay(data.recipes, events, profile, data.reviewLookup, testDate)
    : {
      selected: [],
      diagnostics: {
        selection_strategy: SELECTION_STRATEGY,
        optimizer: {
          candidates_per_event: [],
          combinations_evaluated: 0,
        },
      },
    };
  if (daySelection.failure) {
    failures.push(daySelection.failure);
  }
  const meals = (daySelection.selected || []).map((selection) => (
    buildBaseMeal(selection.event, selection.recipe, data.reviewLookup, selection.selection_rank_within_event)
  ));

  const scaledMeals = applyUniformDayScaling(meals, profile, warnings);
  const actualRaw = nutritionTotals(scaledMeals);
  const actual = {
    kcal: round(actualRaw.kcal),
    protein_g: round(actualRaw.protein_g),
    carbs_g: round(actualRaw.carbs_g),
    fat_g: round(actualRaw.fat_g),
    fiber_g: round(actualRaw.fiber_g),
  };
  const target = {
    kcal: profile.target_kcal,
    protein_g: profile.target_macros.protein_g,
    carbs_g: profile.target_macros.carbs_g,
    fat_g: profile.target_macros.fat_g,
  };
  const delta = {
    kcal: round(actual.kcal - target.kcal),
    kcal_pct: round(((actual.kcal - target.kcal) / target.kcal) * 100, 2),
    protein_g: round(actual.protein_g - target.protein_g),
    carbs_g: round(actual.carbs_g - target.carbs_g),
    fat_g: round(actual.fat_g - target.fat_g),
  };

  const result = {
    profile_id: profile.profile_id,
    test_date: testDate,
    engine_path: ENGINE_PATH,
    selection_strategy: SELECTION_STRATEGY,
    optimizer: daySelection.diagnostics.optimizer,
    generation_status: failures.length === 0 ? 'SUCCESS' : 'CONTROLLED_FAILURE',
    target,
    actual,
    delta,
    meal_count_target: profile.meal_count,
    meal_count_actual: scaledMeals.length,
    meals: scaledMeals,
    assertions: {},
    limitations: {
      professional_review_pending: true,
      allergen_review_pending: true,
      clinical_gate_pending: true,
      dietary_style_structured_gate_pending: true,
      step_aware_scaling_not_implemented: true,
      bounds_aware_scaling_not_implemented: true,
      weekly_variety_not_tested: true,
      production_runtime_not_tested: true,
      runtime_configuration_gate_not_tested: true,
    },
    warnings: [
      ...warnings,
      { code: 'WEEKLY_VARIETY_NOT_TESTED' },
    ],
    failures,
  };

  const recipesByKey = new Map(data.recipes.map((recipe) => [recipe.authoring_key, recipe]));
  result.assertions = buildAssertions(result, profile, recipesByKey);
  return result;
}

function summarizeHarnessResult(result) {
  return {
    profile_id: result.profile_id,
    generation_status: result.generation_status,
    target_kcal: result.target && result.target.kcal,
    actual_kcal: result.actual && result.actual.kcal,
    kcal_delta_pct: result.delta && result.delta.kcal_pct,
    target_protein_g: result.target && result.target.protein_g,
    actual_protein_g: result.actual && result.actual.protein_g,
    meal_count: `${result.meal_count_actual}/${result.meal_count_target}`,
    meal_types: (result.meals || []).map((meal) => meal.meal_type),
    workout_relations: (result.meals || []).map((meal) => meal.workout_relation),
    assertions: result.assertions,
    warnings: result.warnings,
    failures: result.failures,
  };
}

module.exports = {
  BLOCKING_ERROR_CODES,
  BEAM_WIDTH,
  ENGINE_PATH,
  EVENT_SHORTLIST_LIMIT,
  RECIPE_FILES,
  RECIPE_SOURCE,
  SELECTION_STRATEGY,
  adaptProfile,
  buildDayStructure,
  generateDraftRecipeDay,
  loadHarnessData,
  summarizeHarnessResult,
  validateCorpus,
};
