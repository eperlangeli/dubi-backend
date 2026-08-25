const assert = require('assert');
const fs = require('fs');
const {
  DEFAULT_SNAPSHOT_PATH,
  collectCorpusIngredientIds,
  validateSnapshot,
} = require('./validate-ingredient-scaling-metadata');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertInvalidWith(snapshot, corpusIds, expectedCode) {
  const report = validateSnapshot(snapshot, corpusIds);
  assert.strictEqual(report.valid, false, `Expected invalid snapshot for ${expectedCode}`);
  assert(
    report.errors.some((error) => error.code === expectedCode),
    `Expected ${expectedCode}, got ${JSON.stringify(report.errors, null, 2)}`
  );
}

const corpusIds = collectCorpusIngredientIds();
const canonicalSnapshot = JSON.parse(fs.readFileSync(DEFAULT_SNAPSHOT_PATH, 'utf8'));

{
  const report = validateSnapshot(canonicalSnapshot, corpusIds);
  assert.strictEqual(report.valid, true, JSON.stringify(report.errors, null, 2));
  assert.strictEqual(report.summary.corpus_unique_ids, 154);
  assert.strictEqual(report.summary.snapshot_records, 154);
  assert.strictEqual(report.summary.missing_ids, 0);
  assert.strictEqual(report.summary.extra_ids, 0);
  assert.strictEqual(report.summary.duplicate_ids, 0);
}

{
  const snapshot = clone(canonicalSnapshot);
  snapshot.ingredients = snapshot.ingredients.slice(0, -1);
  snapshot.ingredient_count = snapshot.ingredients.length;
  assertInvalidWith(snapshot, corpusIds, 'CORPUS_INGREDIENT_ID_MISSING_FROM_SNAPSHOT');
}

{
  const snapshot = clone(canonicalSnapshot);
  snapshot.ingredients.push({
    ...snapshot.ingredients[snapshot.ingredients.length - 1],
    ingredient_id: 999999,
    name: 'Extra ingredient fixture',
  });
  snapshot.ingredient_count = snapshot.ingredients.length;
  assertInvalidWith(snapshot, corpusIds, 'SNAPSHOT_INGREDIENT_ID_NOT_IN_CORPUS');
}

{
  const snapshot = clone(canonicalSnapshot);
  snapshot.ingredients[1] = { ...snapshot.ingredients[0] };
  assertInvalidWith(snapshot, corpusIds, 'INGREDIENT_ID_DUPLICATE');
}

{
  const snapshot = clone(canonicalSnapshot);
  snapshot.ingredients[0].serving_min_g = 100;
  snapshot.ingredients[0].serving_max_g = 50;
  assertInvalidWith(snapshot, corpusIds, 'INGREDIENT_MIN_GT_MAX');
}

{
  const snapshot = clone(canonicalSnapshot);
  snapshot.ingredients[0].serving_step_g = 0;
  assertInvalidWith(snapshot, corpusIds, 'INGREDIENT_POSITIVE_FIELD_INVALID');
}

{
  const snapshot = clone(canonicalSnapshot);
  snapshot.ingredients[0].edible_portion_fraction = 1.1;
  assertInvalidWith(snapshot, corpusIds, 'INGREDIENT_EDIBLE_PORTION_INVALID');
}

{
  const snapshot = clone(canonicalSnapshot);
  snapshot.ingredients[0].serving_min_g = null;
  snapshot.ingredients[0].serving_max_g = null;
  snapshot.ingredients[0].serving_step_g = null;
  snapshot.ingredients[0].typical_portion_g = null;
  snapshot.ingredients[0].raw_or_cooked = null;
  snapshot.ingredients[0].freshness_form = null;
  snapshot.ingredients[0].edible_portion_fraction = null;
  const report = validateSnapshot(snapshot, corpusIds);
  assert.strictEqual(report.valid, true, JSON.stringify(report.errors, null, 2));
}

{
  const snapshot = clone(canonicalSnapshot);
  const first = snapshot.ingredients[0];
  snapshot.ingredients[0] = snapshot.ingredients[1];
  snapshot.ingredients[1] = first;
  assertInvalidWith(snapshot, corpusIds, 'SNAPSHOT_NOT_SORTED');
}

{
  const sourceText = fs.readFileSync(require.resolve('./validate-ingredient-scaling-metadata'), 'utf8');
  [
    '@supabase',
    'DATABASE_URL',
    'SUPABASE_',
    'createClient',
    'fetch(',
    'new Client',
    "require('pg')",
    'require(\"pg\")',
  ].forEach((forbidden) => {
    assert(
      !sourceText.includes(forbidden),
      `Validator must not contain DB/network dependency marker: ${forbidden}`
    );
  });
}

console.log('ingredient scaling metadata validator tests passed');
