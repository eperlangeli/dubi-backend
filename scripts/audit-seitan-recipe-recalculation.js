#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const TARGET_AUTHORING_KEYS = Object.freeze([
  'pilot03_lunch_dinner_seitan_rice_pasta_pak_choi_bowl',
  'pilot06_lunch_dinner_seitan_quinoa_pepper_bowl',
  'pilot07_lunch_dinner_seitan_buckwheat_arugula_salad',
]);

const CURRENT_SEITAN = Object.freeze({
  calories: 370,
  protein_g: 75,
  carbs_g: 14,
  fat_g: 1.9,
  fiber_g: 0.6,
});

const PROPOSED_SEITAN = Object.freeze({
  calories: 134,
  protein_g: 20.6,
  carbs_g: 6.7,
  fat_g: 2.5,
  fiber_g: 0.9,
});

const METRICS = Object.freeze(['calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g']);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function round(value) {
  return Math.round((Number(value) + Number.EPSILON) * 10) / 10;
}

function asNumber(value, label) {
  const numeric = Number(String(value).replace(',', '.'));
  assert(Number.isFinite(numeric), `${label} must be numeric`);
  return numeric;
}

function loadDraftRecipes() {
  const draftDir = path.join(ROOT, 'data', 'recipe-drafts');
  const recipes = [];
  for (const file of fs.readdirSync(draftDir).filter((name) => /^pilot-\d+\.json$/.test(name)).sort()) {
    const data = readJson(path.join('data', 'recipe-drafts', file));
    const records = Array.isArray(data) ? data : data.recipes;
    assert(Array.isArray(records), `${file} must contain recipe records`);
    for (const recipe of records) recipes.push({ ...recipe, source_file: file });
  }
  return recipes;
}

function loadReviewRecords() {
  const reviewPack = readJson(path.join('data', 'review-packs', 'recipe-nutrition-review-v1.json'));
  assert(Array.isArray(reviewPack.records), 'review pack records must be present');
  return reviewPack.records;
}

function getSeitanIngredient(recipe) {
  const matches = (recipe.ingredients || []).filter((ingredient) => (
    Number(ingredient.ingredient_id) === 16
    || String(ingredient.ingredient_name || '').trim().toLowerCase() === 'seitan'
  ));
  assert.strictEqual(matches.length, 1, `${recipe.authoring_key} must contain exactly one seitan ingredient`);
  return matches[0];
}

function contribution(values, quantityG) {
  const factor = quantityG / 100;
  return Object.fromEntries(METRICS.map((metric) => [metric, values[metric] * factor]));
}

function recalculate(record, quantityG) {
  const before = Object.fromEntries(METRICS.map((metric) => [metric, asNumber(record[metric], `${record.authoring_key}.${metric}`)]));
  const current = contribution(CURRENT_SEITAN, quantityG);
  const proposed = contribution(PROPOSED_SEITAN, quantityG);
  const after = {};
  const delta = {};
  for (const metric of METRICS) {
    after[metric] = round(before[metric] - current[metric] + proposed[metric]);
    delta[metric] = round(after[metric] - before[metric]);
    before[metric] = round(before[metric]);
  }
  return { before, after, delta };
}

function quantile(sortedValues, q) {
  assert(sortedValues.length > 0, 'cannot compute quantile of empty values');
  const index = (sortedValues.length - 1) * q;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function summarizeCorpus(records, targetKeys) {
  const lunchDinner = records.filter((record) => String(record.meal_type || '').includes('lunch/dinner'));
  const comparison = lunchDinner.filter((record) => !targetKeys.includes(record.authoring_key));
  const summary = {};
  for (const metric of METRICS) {
    const values = comparison
      .map((record) => asNumber(record[metric], `${record.authoring_key}.${metric}`))
      .sort((a, b) => a - b);
    summary[metric] = {
      count: values.length,
      min: round(values[0]),
      p25: round(quantile(values, 0.25)),
      median: round(quantile(values, 0.5)),
      p75: round(quantile(values, 0.75)),
      max: round(values[values.length - 1]),
    };
  }
  return summary;
}

function auditPlausibility(after, corpusSummary) {
  const flags = {
    CALORIE_OUTLIER: after.calories > corpusSummary.calories.p75 && after.calories > 750,
    PROTEIN_OUTLIER: after.protein_g > corpusSummary.protein_g.p75 && after.protein_g > 45,
    MACRO_SUM_INCONSISTENCY: Math.abs(after.calories - (after.protein_g * 4 + after.carbs_g * 4 + after.fat_g * 9 + after.fiber_g * 2)) > 80,
    SERVING_SIZE_CONCERN: false,
  };
  return Object.fromEntries(Object.entries(flags).filter(([, value]) => value));
}

function loadImportBlocks() {
  const registry = readJson(path.join('data', 'review-packs', 'recipe-import-blocks-v1.json'));
  assert(Array.isArray(registry.blocks), 'import block registry blocks must be present');
  return registry.blocks;
}

function validateImportBlocks(blocks) {
  const activeSeitanKeys = blocks
    .filter((block) => block.status === 'ACTIVE' && block.block_code === 'SEITAN_SOURCE_UNRESOLVED')
    .map((block) => block.authoring_key)
    .sort();
  assert.deepStrictEqual(activeSeitanKeys, [...TARGET_AUTHORING_KEYS].sort(), 'active seitan blocks must remain unchanged');
  return activeSeitanKeys;
}

function validateSqlArtifact() {
  const sqlPath = path.join(ROOT, 'sql', 'recipe-phase2d-seitan-correction.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  assert(sql.includes('UPDATE public.ingredients'), 'SQL must update public.ingredients');
  assert(sql.includes('WHERE id = 16'), 'SQL must target id 16');
  assert(!/UPDATE\s+public\.recipes/i.test(sql), 'SQL must not update public.recipes');
  assert(!/UPDATE\s+recipes/i.test(sql), 'SQL must not update recipes');
  const updateMatches = sql.match(/UPDATE\s+public\.ingredients/gi) || [];
  assert.strictEqual(updateMatches.length, 1, 'SQL must contain exactly one ingredient update');
}

function main() {
  const drafts = loadDraftRecipes();
  const records = loadReviewRecords();
  const targetDrafts = drafts.filter((recipe) => TARGET_AUTHORING_KEYS.includes(recipe.authoring_key));
  const targetRecords = records.filter((record) => TARGET_AUTHORING_KEYS.includes(record.authoring_key));

  assert.strictEqual(targetDrafts.length, 3, 'exactly three affected draft recipes must be found');
  assert.strictEqual(targetRecords.length, 3, 'exactly three affected review-pack records must be found');

  const allSeitanDrafts = drafts.filter((recipe) => (
    recipe.ingredients || []
  ).some((ingredient) => Number(ingredient.ingredient_id) === 16 || String(ingredient.ingredient_name || '').trim().toLowerCase() === 'seitan'));
  assert.deepStrictEqual(
    allSeitanDrafts.map((recipe) => recipe.authoring_key).sort(),
    [...TARGET_AUTHORING_KEYS].sort(),
    'only the three known draft recipes may use seitan'
  );

  const corpusSummary = summarizeCorpus(records, TARGET_AUTHORING_KEYS);
  const byRecordKey = new Map(targetRecords.map((record) => [record.authoring_key, record]));
  const recalculations = targetDrafts
    .sort((a, b) => TARGET_AUTHORING_KEYS.indexOf(a.authoring_key) - TARGET_AUTHORING_KEYS.indexOf(b.authoring_key))
    .map((recipe) => {
      const seitan = getSeitanIngredient(recipe);
      const quantityG = asNumber(seitan.quantity_g, `${recipe.authoring_key}.seitan.quantity_g`);
      const record = byRecordKey.get(recipe.authoring_key);
      const totals = recalculate(record, quantityG);
      return {
        authoring_key: recipe.authoring_key,
        recipe_name: recipe.name,
        source_file: recipe.source_file,
        seitan_quantity_g: quantityG,
        before: totals.before,
        after_proposed: totals.after,
        delta: totals.delta,
        plausibility_flags: auditPlausibility(totals.after, corpusSummary),
        block_status_after_proposed_correction: 'BLOCK_REMAINS_ACTIVE_PENDING_REVIEW',
      };
    });

  const activeSeitanBlockKeys = validateImportBlocks(loadImportBlocks());
  validateSqlArtifact();

  const output = {
    status: 'PASS',
    mode: 'audit_only_no_db_no_draft_writes',
    proposed_source: {
      organization: 'ANSES Ciqual',
      source_version: 'Ciqual 2025; Table Ciqual 2025_FR_2025_11_03.xlsx; dataset V1',
      source_date: '2025-11-19',
      food_name: 'Seitan, preemballe',
      food_code: '25598',
      per_100g_basis: 'edible portion',
      values_per_100g: PROPOSED_SEITAN,
    },
    current_seitan_values: CURRENT_SEITAN,
    affected_recipe_count: recalculations.length,
    active_seitan_block_count: activeSeitanBlockKeys.length,
    active_seitan_block_keys: activeSeitanBlockKeys,
    lunch_dinner_corpus_excluding_affected: corpusSummary,
    recalculations,
  };

  console.log(JSON.stringify(output, null, 2));
}

main();
