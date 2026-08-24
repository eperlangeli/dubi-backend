const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  BEAM_WIDTH,
  ENGINE_PATH,
  EVENT_SHORTLIST_LIMIT,
  SELECTION_STRATEGY,
  generateDraftRecipeDay,
  loadHarnessData,
  validateCorpus,
} = require('./lib/draft-recipe-harness');

const rootDir = path.resolve(__dirname, '..');

function profileById(data, profileId) {
  const profile = data.profiles.find((item) => item.profile_id === profileId);
  assert(profile, `Missing test profile ${profileId}`);
  return profile;
}

function selectedKeys(result) {
  return result.meals.map((meal) => meal.authoring_key);
}

function run() {
  const data = loadHarnessData(rootDir);

  assert.strictEqual(data.corpus.valid, true, 'corpus should be valid');
  assert.strictEqual(data.corpus.recipes_loaded, 130, 'corpus loads exactly 130 recipes');
  assert.strictEqual(data.corpus.unique_authoring_keys, 130, 'corpus has 130 unique recipe keys');

  const profile01 = profileById(data, 'fake_profile_01');
  const profile02 = profileById(data, 'fake_profile_02');

  const first = generateDraftRecipeDay(profile01, { rootDir, testDate: '2026-09-01', data });
  const second = generateDraftRecipeDay(profile01, { rootDir, testDate: '2026-09-01', data });
  assert.deepStrictEqual(selectedKeys(second), selectedKeys(first), 'same profile + date should be deterministic');
  assert.deepStrictEqual(second.optimizer, first.optimizer, 'optimizer diagnostics should be deterministic');

  const differentDate = generateDraftRecipeDay(profile01, { rootDir, testDate: '2026-09-02', data });
  assert.strictEqual(differentDate.selection_strategy, SELECTION_STRATEGY, 'different dates still use deterministic optimizer selection');

  const badRecipes = data.recipes.map((recipe, index) => {
    if (index !== 0) return recipe;
    return {
      ...recipe,
      ingredients: [
        ...recipe.ingredients,
        {
          ingredient_id: 41,
          ingredient_name: 'Gallette di riso',
          quantity_g: 20,
          quantity_unit: 'g',
          measurement_basis: 'raw',
          culinary_role: 'carb_primary',
          is_scalable: true,
        },
      ],
    };
  });
  const badCorpus = validateCorpus(badRecipes, data.reviewLookup, data.whitelist);
  assert.strictEqual(badCorpus.valid, false, 'excluded recipe ingredient should block corpus load');
  assert(
    badCorpus.failures.some((failure) => failure.code === 'HARNESS_NON_CLEAN_INGREDIENT' && failure.ingredient_id === 41),
    'excluded ingredient 41 should produce HARNESS_NON_CLEAN_INGREDIENT'
  );

  const impossibleProfile = {
    ...profile01,
    profile_id: 'fake_profile_impossible',
    equipment: ['none'],
    kitchen_time: {
      breakfast_max_min: 0,
      lunch_max_min: 0,
      dinner_max_min: 0,
    },
  };
  const noEligible = generateDraftRecipeDay(impossibleProfile, { rootDir, testDate: '2026-09-01', data });
  assert.strictEqual(noEligible.generation_status, 'CONTROLLED_FAILURE', 'no eligible recipe should controlled-fail');
  assert(noEligible.failures.some((failure) => failure.code === 'NO_ELIGIBLE_DRAFT_RECIPE'), 'no eligible recipe failure should be explicit');

  assert.strictEqual(first.engine_path, ENGINE_PATH, 'output engine_path identifies local harness');
  assert.strictEqual(first.selection_strategy, SELECTION_STRATEGY, 'output identifies day-level optimizer strategy');
  assert(first.optimizer && first.optimizer.combinations_evaluated > 0, 'optimizer diagnostics include evaluated combinations');
  assert(first.optimizer.candidates_per_event.every((event) => event.shortlist <= EVENT_SHORTLIST_LIMIT), 'event candidate search is bounded');
  assert.strictEqual(first.optimizer.beam_width, BEAM_WIDTH, 'optimizer reports bounded beam width');
  assert(first.meals.every((meal) => Number.isInteger(meal.selection_rank_within_event)), 'selected meals include rank within event');
  assert.strictEqual(first.meal_count_actual, profile01.meal_count, 'simple rest profile respects meal count');
  assert.strictEqual(first.assertions.meal_count_pass, true, 'simple rest profile meal count assertion passes');

  const training = generateDraftRecipeDay(profile02, { rootDir, testDate: '2026-09-01', data });
  assert(training.meals.some((meal) => meal.workout_relation === 'explicit_pre_workout'), 'evening-training profile has explicit pre-workout structure');
  assert(training.meals.some((meal) => meal.workout_relation === 'post_workout_full_meal'), 'evening-training profile has post-workout full-meal structure');
  assert(training.meals.every((meal) => meal.source === 'controlled_draft_corpus'), 'optimizer never falls back to freeform recipes');

  const profile03 = profileById(data, 'fake_profile_03');
  const optimizedProtein = generateDraftRecipeDay(profile03, { rootDir, testDate: '2026-09-01', data });
  assert.strictEqual(optimizedProtein.assertions.protein_target_pass, true, 'day-level optimizer should fix profile 03 protein target from existing corpus');

  const profile04 = profileById(data, 'fake_profile_04');
  const optimizedComparable = generateDraftRecipeDay(profile04, { rootDir, testDate: '2026-09-01', data });
  assert.strictEqual(optimizedComparable.assertions.protein_target_pass, true, 'optimizer keeps profile 04 protein target passing');

  const profile09 = profileById(data, 'fake_profile_09');
  const corpusGap = generateDraftRecipeDay(profile09, { rootDir, testDate: '2026-09-01', data });
  assert.strictEqual(corpusGap.generation_status, 'CONTROLLED_FAILURE', 'profile 09 remains controlled corpus-gap failure');
  assert(corpusGap.failures.some((failure) => failure.code === 'NO_ELIGIBLE_DRAFT_RECIPE'), 'profile 09 is not bypassed by optimizer');

  const sourceText = [
    fs.readFileSync(path.join(rootDir, 'scripts', 'lib', 'draft-recipe-harness.js'), 'utf8'),
    fs.readFileSync(path.join(rootDir, 'scripts', 'run-draft-recipe-harness.js'), 'utf8'),
  ].join('\n');
  [
    'daily_plans',
    'generateDayPlan',
    'routes/plan',
    'public.recipes',
    '@supabase',
    'pg',
    'fetch(',
    'http://',
    'https://',
  ].forEach((forbidden) => {
    assert.strictEqual(sourceText.includes(forbidden), false, `harness source must not contain ${forbidden}`);
  });

  console.log(JSON.stringify({
    valid: true,
    tests: 20,
    corpus_recipes: data.corpus.recipes_loaded,
    deterministic_selection_confirmed: true,
    day_level_optimizer_confirmed: true,
    no_legacy_recipe_path_used: true,
    no_db_or_network_write_path: true,
  }, null, 2));
}

run();
