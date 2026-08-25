const assert = require('assert');
const fs = require('fs');
const {
  DEFAULT_REGISTRY_PATH,
  SEITAN_BLOCK_CODE,
  collectCorpusIndex,
  validateRegistry,
} = require('./validate-recipe-import-blocks');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertInvalidWith(registry, corpusIndex, expectedCode) {
  const report = validateRegistry(registry, corpusIndex);
  assert.strictEqual(report.valid, false, `Expected invalid registry for ${expectedCode}`);
  assert(
    report.errors.some((error) => error.code === expectedCode),
    `Expected ${expectedCode}, got ${JSON.stringify(report.errors, null, 2)}`
  );
}

const corpusIndex = collectCorpusIndex();
const canonicalRegistry = JSON.parse(fs.readFileSync(DEFAULT_REGISTRY_PATH, 'utf8'));

{
  const report = validateRegistry(canonicalRegistry, corpusIndex);
  assert.strictEqual(report.valid, true, JSON.stringify(report.errors, null, 2));
  assert.strictEqual(report.summary.recipe_count, 130);
  assert.strictEqual(report.summary.seitan_recipe_count, 3);
  assert.strictEqual(report.summary.active_seitan_block_count, 3);
}

{
  const registry = clone(canonicalRegistry);
  registry.blocks[0].authoring_key = 'unknown_recipe_key';
  assertInvalidWith(registry, corpusIndex, 'AUTHORING_KEY_UNKNOWN');
}

{
  const registry = clone(canonicalRegistry);
  registry.blocks.splice(1, 0, clone(registry.blocks[0]));
  assertInvalidWith(registry, corpusIndex, 'DUPLICATE_ACTIVE_BLOCK');
}

{
  const registry = clone(canonicalRegistry);
  registry.blocks[0].status = 'PENDING';
  assertInvalidWith(registry, corpusIndex, 'STATUS_INVALID');
}

{
  const registry = clone(canonicalRegistry);
  registry.blocks[0].scope = 'RUNTIME';
  assertInvalidWith(registry, corpusIndex, 'SCOPE_INVALID');
}

{
  const registry = clone(canonicalRegistry);
  registry.blocks[0].reason = '';
  assertInvalidWith(registry, corpusIndex, 'REASON_MISSING');
}

{
  const registry = clone(canonicalRegistry);
  registry.blocks[0].resolution_required = [];
  assertInvalidWith(registry, corpusIndex, 'RESOLUTION_REQUIRED_MISSING');
}

{
  const registry = clone(canonicalRegistry);
  registry.blocks = registry.blocks.slice(1);
  assertInvalidWith(registry, corpusIndex, 'SEITAN_RECIPE_ACTIVE_BLOCK_MISSING');
}

{
  const registry = clone(canonicalRegistry);
  registry.blocks[0].status = 'RESOLVED';
  assertInvalidWith(registry, corpusIndex, 'SEITAN_RECIPE_ACTIVE_BLOCK_MISSING');
}

{
  const sourceText = fs.readFileSync(require.resolve('./validate-recipe-import-blocks'), 'utf8');
  [
    '@supabase',
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

{
  const registry = clone(canonicalRegistry);
  registry.blocks[0].block_code = 'OTHER_SEITAN_CODE';
  assertInvalidWith(registry, corpusIndex, 'ACTIVE_SEITAN_BLOCK_CODE_INVALID');
}

{
  const activeSeitanKeys = canonicalRegistry.blocks
    .filter((block) => block.status === 'ACTIVE' && block.block_code === SEITAN_BLOCK_CODE)
    .map((block) => block.authoring_key)
    .sort();
  assert.deepStrictEqual(activeSeitanKeys, corpusIndex.seitanRecipeKeys);
}

console.log('recipe import block validator tests passed');
