const fs = require('fs');
const path = require('path');
const {
  COMPONENT_ROLES,
  resolveComponentRole,
} = require('./component-role-policy');

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
const COMPONENT_SCALING_STRATEGY = 'component_aware_scaling_v1';
const COMPONENT_ROLE_ORDER = Object.freeze([
  COMPONENT_ROLES.STARCHY_CARB,
  COMPONENT_ROLES.PROTEIN,
  COMPONENT_ROLES.ADDED_FAT,
  COMPONENT_ROLES.FRUIT,
  COMPONENT_ROLES.VEGETABLE,
]);
const BLOCKING_ERROR_CODES = Object.freeze({
  corpusCountInvalid: 'HARNESS_CORPUS_COUNT_INVALID',
  duplicateRecipeKey: 'HARNESS_DUPLICATE_RECIPE_KEY',
  reviewRecordMissing: 'HARNESS_REVIEW_RECORD_MISSING',
  nonCleanIngredient: 'HARNESS_NON_CLEAN_INGREDIENT',
  noEligibleRecipe: 'NO_ELIGIBLE_DRAFT_RECIPE',
  varietyConstraintFailure: 'VARIETY_CONSTRAINT_FAILURE',
  ambiguousSchedule: 'AMBIGUOUS_MEAL_SCHEDULE',
  componentScalingInfeasible: 'COMPONENT_SCALING_INFEASIBLE',
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

function normalizeKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function loadIngredientScalingMetadata(rootDir) {
  const parsed = readJson(path.join(rootDir, 'data', 'test-fixtures', 'ingredient-scaling-metadata-v1.json'));
  const records = Array.isArray(parsed) ? parsed : parsed.ingredients;
  return new Map((records || []).map((record) => [Number(record.ingredient_id), record]));
}

function loadIngredientNutritionReferences(rootDir) {
  const parsed = readJson(path.join(rootDir, 'data', 'usda-ingredient-references.json'));
  const references = Array.isArray(parsed) ? parsed : parsed.references;
  const byName = new Map();
  (references || []).forEach((record) => {
    const nutrition = {
      calories: parseNumber(record.calories_per_100g),
      protein_g: parseNumber(record.protein_per_100g),
      carbs_g: parseNumber(record.carbs_per_100g),
      fat_g: parseNumber(record.fats_per_100g),
      fiber_g: parseNumber(record.fiber_per_100g),
    };
    byName.set(normalizeKey(record.display_name), nutrition);
    byName.set(normalizeKey(record.ingredient_key), nutrition);
  });
  return byName;
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
  const ingredientScalingMetadata = loadIngredientScalingMetadata(rootDir);
  const ingredientNutritionReferences = loadIngredientNutritionReferences(rootDir);
  const corpus = validateCorpus(recipes, review.lookup, whitelist);
  return {
    recipes,
    reviewRecords: review.records,
    reviewLookup: review.lookup,
    whitelist,
    profiles,
    ingredientScalingMetadata,
    ingredientNutritionReferences,
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

function scoreComponentReadiness(recipe, data) {
  const invalidBaseQuantityCount = (recipe.ingredients || []).filter((ingredient) => {
    const metadata = data.ingredientScalingMetadata.get(Number(ingredient.ingredient_id));
    return metadata && !withinBounds(Number(ingredient.quantity_g), metadata);
  }).length;
  const scalableResolved = (recipe.ingredients || []).filter((ingredient) => {
    const role = resolveComponentRole(ingredient);
    return ![COMPONENT_ROLES.SPICE_AROMATIC, COMPONENT_ROLES.FIXED_OTHER, COMPONENT_ROLES.UNRESOLVED].includes(role);
  });
  if (scalableResolved.length === 0) return 2 + invalidBaseQuantityCount * 10;
  const missing = scalableResolved.filter((ingredient) => (
    !data.ingredientNutritionReferences.get(normalizeKey(ingredient.ingredient_name))
  )).length;
  return (missing / scalableResolved.length) + invalidBaseQuantityCount * 10;
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

function rankedCandidatesForEvent(recipes, event, profile, reviewLookup, events, data) {
  const eligible = eligibleRecipesForEvent(recipes, event, profile, new Set());
  const target = mealMacroTarget(profile, events);
  return eligible
    .map((recipe) => {
      const baseMeal = buildBaseMeal(event, recipe, reviewLookup);
      const componentMeal = componentScaleMeal(baseMeal, profile, events, event.event_index, data);
      const macros = componentMeal.scaled_macros || baseMeal.scaled_macros;
      const nutrition = {
        calories: macros.kcal,
        protein_g: macros.protein_g,
        carbs_g: macros.carbs_g,
        fat_g: macros.fat_g,
        fiber_g: macros.fiber_g,
      };
      return {
        recipe,
        nutrition,
        score: scoreRecipe(recipe, nutrition, target) + scoreComponentReadiness(recipe, data),
      };
    })
    .sort((a, b) => a.score - b.score || a.recipe.authoring_key.localeCompare(b.recipe.authoring_key))
    .map((candidate, index) => ({
      ...candidate,
      localRank: index + 1,
    }));
}

function selectRecipesForDay(recipes, events, profile, reviewLookup, testDate, data) {
  const rankedByEvent = events.map((event) => rankedCandidatesForEvent(recipes, event, profile, reviewLookup, events, data));
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

function macroFromIngredientNutrition(nutrition, quantityG) {
  const factor = quantityG / 100;
  return {
    kcal: parseNumber(nutrition?.calories) * factor,
    protein_g: parseNumber(nutrition?.protein_g) * factor,
    carbs_g: parseNumber(nutrition?.carbs_g) * factor,
    fat_g: parseNumber(nutrition?.fat_g) * factor,
    fiber_g: parseNumber(nutrition?.fiber_g) * factor,
  };
}

function addMacros(left, right) {
  return {
    kcal: left.kcal + right.kcal,
    protein_g: left.protein_g + right.protein_g,
    carbs_g: left.carbs_g + right.carbs_g,
    fat_g: left.fat_g + right.fat_g,
    fiber_g: left.fiber_g + right.fiber_g,
  };
}

function subtractMacros(left, right) {
  return {
    kcal: left.kcal - right.kcal,
    protein_g: left.protein_g - right.protein_g,
    carbs_g: left.carbs_g - right.carbs_g,
    fat_g: left.fat_g - right.fat_g,
    fiber_g: left.fiber_g - right.fiber_g,
  };
}

function scoreMealMacros(macros, target) {
  const kcalDeviation = Math.abs(macros.kcal - target.kcal) / Math.max(target.kcal, 1);
  const proteinShortfall = Math.max(0, target.protein_g - macros.protein_g) / Math.max(target.protein_g, 1);
  const proteinExcess = Math.max(0, macros.protein_g - target.protein_g * 1.15) / Math.max(target.protein_g, 1);
  const fatShortfall = Math.max(0, target.fat_g * 0.75 - macros.fat_g) / Math.max(target.fat_g, 1);
  const fatDeviation = Math.abs(macros.fat_g - target.fat_g) / Math.max(target.fat_g, 1);
  const carbDeviation = Math.abs(macros.carbs_g - target.carbs_g) / Math.max(target.carbs_g, 1);
  return kcalDeviation * 10
    + proteinShortfall * 8
    + proteinExcess * 5
    + fatShortfall * 2
    + fatDeviation * 0.5
    + carbDeviation;
}

function scoreDayMacros(macros, target) {
  const kcalDeviation = Math.abs(macros.kcal - target.kcal) / Math.max(target.kcal, 1);
  const proteinShortfall = Math.max(0, target.protein_g - macros.protein_g) / Math.max(target.protein_g, 1);
  const proteinExcess = Math.max(0, macros.protein_g - target.protein_g * 1.15) / Math.max(target.protein_g, 1);
  const fatShortfall = Math.max(0, target.fat_g * 0.85 - macros.fat_g) / Math.max(target.fat_g, 1);
  const fatDeviation = Math.abs(macros.fat_g - target.fat_g) / Math.max(target.fat_g, 1);
  const carbDeviation = Math.abs(macros.carbs_g - target.carbs_g) / Math.max(target.carbs_g, 1);
  return kcalDeviation * 12
    + proteinShortfall * 28
    + proteinExcess * 8
    + fatShortfall * 3
    + fatDeviation
    + carbDeviation;
}

function withinBounds(quantity, metadata) {
  if (!metadata) return false;
  return quantity >= Number(metadata.serving_min_g) && quantity <= Number(metadata.serving_max_g);
}

function followsStepFromBase(quantity, baseQuantity, metadata) {
  const step = Number(metadata?.serving_step_g || 0);
  if (!Number.isFinite(step) || step <= 0) return false;
  const increments = (quantity - baseQuantity) / step;
  return Math.abs(increments - Math.round(increments)) < 1e-9;
}

function candidateQuantities(baseQuantity, metadata, componentRole, hasNutrition) {
  if (!metadata || !hasNutrition) return [baseQuantity];
  if ([COMPONENT_ROLES.SPICE_AROMATIC, COMPONENT_ROLES.FIXED_OTHER, COMPONENT_ROLES.UNRESOLVED].includes(componentRole)) {
    return [baseQuantity];
  }
  if (!withinBounds(baseQuantity, metadata)) return [];

  const step = Number(metadata.serving_step_g);
  const min = Number(metadata.serving_min_g);
  const max = Number(metadata.serving_max_g);
  const offsetsByRole = {
    [COMPONENT_ROLES.STARCHY_CARB]: [-4, -3, -2, -1, 0, 1, 2, 3, 4],
    [COMPONENT_ROLES.PROTEIN]: [-3, -2, -1, 0, 1, 2, 3],
    [COMPONENT_ROLES.ADDED_FAT]: [-2, -1, 0, 1, 2],
    [COMPONENT_ROLES.FRUIT]: [-2, -1, 0, 1, 2],
    [COMPONENT_ROLES.VEGETABLE]: [-1, 0, 1],
  };
  const offsets = offsetsByRole[componentRole] || [0];
  const candidates = new Set([baseQuantity, min, max]);
  offsets.forEach((offset) => {
    const next = baseQuantity + offset * step;
    if (next >= min && next <= max) candidates.add(next);
  });
  return [...candidates]
    .filter((quantity) => withinBounds(quantity, metadata))
    .filter((quantity) => followsStepFromBase(quantity, baseQuantity, metadata))
    .sort((a, b) => Math.abs(a - baseQuantity) - Math.abs(b - baseQuantity) || a - b);
}

function mealTargetForIndex(profile, meals, index) {
  const count = Math.max(meals.length, 1);
  return {
    kcal: profile.target_kcal / count,
    protein_g: profile.target_macros.protein_g / count,
    carbs_g: profile.target_macros.carbs_g / count,
    fat_g: profile.target_macros.fat_g / count,
  };
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
      culinary_role: ingredient.culinary_role || null,
      base_quantity_g: ingredient.quantity_g,
      scaled_quantity_g: ingredient.quantity_g,
    })),
    workout_relation: event.workout_relation,
    selection_rank_within_event: selectionRankWithinEvent,
  };
}

function enrichIngredientsForComponentScaling(meal, data) {
  return meal.ingredients.map((ingredient) => {
    const metadata = data.ingredientScalingMetadata.get(Number(ingredient.ingredient_id)) || null;
    const nutrition = data.ingredientNutritionReferences.get(normalizeKey(ingredient.ingredient_name)) || null;
    const componentRole = resolveComponentRole(ingredient);
    return {
      ...ingredient,
      selected_quantity_g: ingredient.selected_quantity_g ?? ingredient.base_quantity_g,
      scaled_quantity_g: ingredient.selected_quantity_g ?? ingredient.scaled_quantity_g ?? ingredient.base_quantity_g,
      component_role: componentRole,
      serving_min_g: metadata ? metadata.serving_min_g : null,
      serving_max_g: metadata ? metadata.serving_max_g : null,
      serving_step_g: metadata ? metadata.serving_step_g : null,
      nutrition_reference_available: Boolean(nutrition),
      component_scaling_locked: !nutrition || [COMPONENT_ROLES.SPICE_AROMATIC, COMPONENT_ROLES.FIXED_OTHER, COMPONENT_ROLES.UNRESOLVED].includes(componentRole),
      _metadata: metadata,
      _nutrition: nutrition,
    };
  });
}

function recomputeMealFromIngredientDeltas(baseMacros, ingredients) {
  return ingredients.reduce((macros, ingredient) => {
    if (!ingredient._nutrition) return macros;
    const baseContribution = macroFromIngredientNutrition(ingredient._nutrition, ingredient.base_quantity_g);
    const selectedContribution = macroFromIngredientNutrition(ingredient._nutrition, ingredient.selected_quantity_g);
    return addMacros(subtractMacros(macros, baseContribution), selectedContribution);
  }, { ...baseMacros });
}

function stripInternalIngredientFields(ingredient) {
  const {
    _metadata,
    _nutrition,
    ...publicIngredient
  } = ingredient;
  return publicIngredient;
}

function componentScaleMeal(meal, profile, meals, mealIndex, data) {
  let ingredients = enrichIngredientsForComponentScaling(meal, data);
  if (ingredients.some((ingredient) => ingredient._metadata === null)) {
    return {
      ...meal,
      component_scaling_status: 'CONTROLLED_INFEASIBLE',
      component_scaling_failures: ingredients
        .filter((ingredient) => ingredient._metadata === null)
        .map((ingredient) => ({
          code: 'INGREDIENT_SCALING_METADATA_MISSING',
          ingredient_id: ingredient.ingredient_id,
          ingredient_name: ingredient.ingredient_name,
        })),
      ingredients: ingredients.map(stripInternalIngredientFields),
    };
  }

  const target = mealTargetForIndex(profile, meals, mealIndex);
  let selectedMacros = {
    kcal: meal.base_recipe_macros.kcal,
    protein_g: meal.base_recipe_macros.protein_g,
    carbs_g: meal.base_recipe_macros.carbs_g,
    fat_g: meal.base_recipe_macros.fat_g,
    fiber_g: meal.base_recipe_macros.fiber_g,
  };

  // Bounded greedy search: each role is considered in professional priority order,
  // candidates always include base/min/max and nearby step increments, and no
  // ingredient can be added, removed, or moved outside its existing metadata bounds.
  COMPONENT_ROLE_ORDER.forEach((role) => {
    ingredients
      .map((ingredient, index) => ({ ingredient, index }))
      .filter(({ ingredient }) => ingredient.component_role === role && !ingredient.component_scaling_locked)
      .forEach(({ ingredient, index }) => {
        const candidates = candidateQuantities(
          ingredient.base_quantity_g,
          ingredient._metadata,
          ingredient.component_role,
          ingredient.nutrition_reference_available
        );
        if (candidates.length === 0) return;
        let bestQuantity = ingredient.selected_quantity_g;
        let bestMacros = selectedMacros;
        let bestScore = scoreMealMacros(selectedMacros, target);
        candidates.forEach((quantity) => {
          const nextIngredients = ingredients.map((item, itemIndex) => (
            itemIndex === index ? { ...item, selected_quantity_g: quantity, scaled_quantity_g: quantity } : item
          ));
          const nextMacros = recomputeMealFromIngredientDeltas(meal.base_recipe_macros, nextIngredients);
          const nextScore = scoreMealMacros(nextMacros, target);
          if (nextScore < bestScore - 1e-9) {
            bestScore = nextScore;
            bestQuantity = quantity;
            bestMacros = nextMacros;
          }
        });
        ingredients[index] = {
          ...ingredients[index],
          selected_quantity_g: bestQuantity,
          scaled_quantity_g: bestQuantity,
        };
        selectedMacros = bestMacros;
      });
  });

  const componentAdjustments = ingredients.filter((ingredient) => (
    round(ingredient.selected_quantity_g, 4) !== round(ingredient.base_quantity_g, 4)
  )).length;
  const unresolvedComponentRoles = ingredients.filter((ingredient) => ingredient.component_role === COMPONENT_ROLES.UNRESOLVED).length;
  const invalidBoundStepCount = ingredients.filter((ingredient) => {
    if (!ingredient._metadata) return true;
    if (!withinBounds(ingredient.selected_quantity_g, ingredient._metadata)) return true;
    if (!followsStepFromBase(ingredient.selected_quantity_g, ingredient.base_quantity_g, ingredient._metadata)) return true;
    return false;
  }).length;

  return {
    ...meal,
    scale_factor: null,
    component_scaling_strategy: COMPONENT_SCALING_STRATEGY,
    component_scaling_status: 'SUCCESS',
    component_adjustment_count: componentAdjustments,
    unresolved_component_role_count: unresolvedComponentRoles,
    invalid_bound_step_count: invalidBoundStepCount,
    scaled_macros: {
      kcal: round(selectedMacros.kcal),
      protein_g: round(selectedMacros.protein_g),
      carbs_g: round(selectedMacros.carbs_g),
      fat_g: round(selectedMacros.fat_g),
      fiber_g: round(selectedMacros.fiber_g),
    },
    ingredients: ingredients.map(stripInternalIngredientFields),
  };
}

function prepareMealForDayPass(meal, data) {
  return {
    ...meal,
    ingredients: enrichIngredientsForComponentScaling(meal, data),
  };
}

function refreshMealMacros(meal) {
  const selectedMacros = recomputeMealFromIngredientDeltas(meal.base_recipe_macros, meal.ingredients);
  return {
    ...meal,
    scaled_macros: {
      kcal: round(selectedMacros.kcal),
      protein_g: round(selectedMacros.protein_g),
      carbs_g: round(selectedMacros.carbs_g),
      fat_g: round(selectedMacros.fat_g),
      fiber_g: round(selectedMacros.fiber_g),
    },
  };
}

function componentOrderPenalty(role) {
  if (role === COMPONENT_ROLES.STARCHY_CARB) return 0;
  if (role === COMPONENT_ROLES.PROTEIN) return 0.0001;
  if (role === COMPONENT_ROLES.ADDED_FAT) return 0.0005;
  if (role === COMPONENT_ROLES.FRUIT) return 0.001;
  if (role === COMPONENT_ROLES.VEGETABLE) return 0.01;
  return 1;
}

function applyDayLevelComponentPass(meals, profile) {
  const target = {
    kcal: profile.target_kcal,
    protein_g: profile.target_macros.protein_g,
    carbs_g: profile.target_macros.carbs_g,
    fat_g: profile.target_macros.fat_g,
  };
  let nextMeals = meals;
  for (let iteration = 0; iteration < 200; iteration += 1) {
    const currentTotals = nutritionTotals(nextMeals);
    let bestScore = scoreDayMacros(currentTotals, target);
    let bestMeals = nextMeals;

    nextMeals.forEach((meal, mealIndex) => {
      meal.ingredients.forEach((ingredient, ingredientIndex) => {
        if (ingredient.component_scaling_locked) return;
        const candidates = candidateQuantities(
          ingredient.base_quantity_g,
          ingredient._metadata,
          ingredient.component_role,
          ingredient.nutrition_reference_available
        ).filter((quantity) => quantity !== ingredient.selected_quantity_g);
        candidates.forEach((quantity) => {
          const trialMeals = nextMeals.map((candidateMeal, candidateMealIndex) => {
            if (candidateMealIndex !== mealIndex) return candidateMeal;
            const trialIngredients = candidateMeal.ingredients.map((candidateIngredient, candidateIngredientIndex) => (
              candidateIngredientIndex === ingredientIndex
                ? { ...candidateIngredient, selected_quantity_g: quantity, scaled_quantity_g: quantity }
                : candidateIngredient
            ));
            return refreshMealMacros({ ...candidateMeal, ingredients: trialIngredients });
          });
          const trialScore = scoreDayMacros(nutritionTotals(trialMeals), target)
            + componentOrderPenalty(ingredient.component_role);
          if (trialScore < bestScore - 1e-9) {
            bestScore = trialScore;
            bestMeals = trialMeals;
          }
        });
      });
    });

    if (bestMeals === nextMeals) break;
    nextMeals = bestMeals;
  }
  return nextMeals;
}

function applyComponentAwareDayScaling(meals, profile, warnings, data) {
  warnings.push('LOCAL_COMPONENT_AWARE_RECIPE_SCALING_V1');
  warnings.push('SAFETY_GATE_INCOMPLETE');
  const perMealScaled = meals.map((meal, index) => componentScaleMeal(meal, profile, meals, index, data));
  const prepared = perMealScaled.map((meal) => (
    meal.component_scaling_status === 'SUCCESS' ? prepareMealForDayPass(meal, data) : meal
  ));
  return applyDayLevelComponentPass(prepared, profile).map((meal) => {
    if (meal.component_scaling_status !== 'SUCCESS') return meal;
    const componentAdjustments = meal.ingredients.filter((ingredient) => (
      round(ingredient.selected_quantity_g, 4) !== round(ingredient.base_quantity_g, 4)
    )).length;
    const unresolvedComponentRoles = meal.ingredients.filter((ingredient) => ingredient.component_role === COMPONENT_ROLES.UNRESOLVED).length;
    const invalidBoundStepCount = meal.ingredients.filter((ingredient) => {
      if (!ingredient._metadata) return true;
      if (!withinBounds(ingredient.selected_quantity_g, ingredient._metadata)) return true;
      if (!followsStepFromBase(ingredient.selected_quantity_g, ingredient.base_quantity_g, ingredient._metadata)) return true;
      return false;
    }).length;
    return {
      ...meal,
      component_adjustment_count: componentAdjustments,
      unresolved_component_role_count: unresolvedComponentRoles,
      invalid_bound_step_count: invalidBoundStepCount,
      ingredients: meal.ingredients.map(stripInternalIngredientFields),
    };
  });
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
    ? selectRecipesForDay(data.recipes, events, profile, data.reviewLookup, testDate, data)
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

  const scaledMeals = applyComponentAwareDayScaling(meals, profile, warnings, data);
  scaledMeals
    .filter((meal) => meal.component_scaling_status === 'CONTROLLED_INFEASIBLE')
    .forEach((meal) => {
      failures.push({
        code: BLOCKING_ERROR_CODES.componentScalingInfeasible,
        authoring_key: meal.authoring_key,
        failures: meal.component_scaling_failures || [],
      });
    });
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
      component_aware_scaling_v1_runtime_only: true,
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
  COMPONENT_SCALING_STRATEGY,
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
