'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WHITELIST_PATH = path.join(ROOT, 'data', 'ingredient-whitelists', 'clean-v1.json');
const PILOT_PATH = path.join(ROOT, 'data', 'recipe-drafts', 'pilot-01.json');

const ALLOWED_EXCLUDED_CLASSIFICATIONS = new Set([
  'TEMPORARILY_EXCLUDE_METADATA_REVIEW',
  'TEMPORARILY_EXCLUDE_NUTRITION_BASIS_REVIEW',
  'TEMPORARILY_EXCLUDE_VARIABLE_OR_PRODUCT_SPECIFIC',
  'TEMPORARILY_EXCLUDE_REQUIRES_YIELD_OR_BASIS_DECISION',
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function collectIngredientIds(value, ids = new Set()) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectIngredientIds(item, ids));
    return ids;
  }

  if (value && typeof value === 'object') {
    if (Number.isInteger(value.ingredient_id)) ids.add(value.ingredient_id);
    Object.values(value).forEach((item) => collectIngredientIds(item, ids));
  }

  return ids;
}

function duplicates(values) {
  const seen = new Set();
  const dupes = new Set();
  for (const value of values) {
    if (seen.has(value)) dupes.add(value);
    seen.add(value);
  }
  return [...dupes].sort((a, b) => a - b);
}

function classifyIngredient(id, cleanIds, excludedById) {
  if (cleanIds.has(id)) return 'CLEAN_FOR_DRAFT_AUTHORING';
  return excludedById.get(id)?.classification || 'MISSING';
}

const whitelist = readJson(WHITELIST_PATH);
const pilot = readJson(PILOT_PATH);
const errors = [];

if (whitelist.whitelist_version !== '1.0') errors.push('whitelist_version must be 1.0');
if (whitelist.status !== 'frozen') errors.push('status must be frozen');
if (whitelist.purpose !== 'controlled_draft_recipe_authoring') {
  errors.push('purpose must be controlled_draft_recipe_authoring');
}
if (whitelist.total_ingredients_classified !== 199) errors.push('total_ingredients_classified must be 199');
if (whitelist.clean_count !== 161) errors.push('clean_count must be 161');
if (whitelist.excluded_count !== 38) errors.push('excluded_count must be 38');

if (!Array.isArray(whitelist.clean_ingredients)) errors.push('clean_ingredients must be an array');
if (!Array.isArray(whitelist.excluded_ingredients)) errors.push('excluded_ingredients must be an array');
if (!Array.isArray(whitelist.notes) || whitelist.notes.length < 8) {
  errors.push('notes must include the required safety caveats');
}

const cleanEntries = Array.isArray(whitelist.clean_ingredients) ? whitelist.clean_ingredients : [];
const excludedEntries = Array.isArray(whitelist.excluded_ingredients) ? whitelist.excluded_ingredients : [];
const cleanIds = new Set(cleanEntries.map((item) => item.ingredient_id));
const excludedById = new Map(excludedEntries.map((item) => [item.ingredient_id, item]));
const excludedIds = new Set(excludedById.keys());
const allIds = [...cleanIds, ...excludedIds];
const duplicateIds = duplicates([
  ...cleanEntries.map((item) => item.ingredient_id),
  ...excludedEntries.map((item) => item.ingredient_id),
]);
const overlapIds = [...cleanIds].filter((id) => excludedIds.has(id)).sort((a, b) => a - b);
const pilotIngredientIds = [...collectIngredientIds(pilot)].sort((a, b) => a - b);
const pilotMissingFromClean = pilotIngredientIds.filter((id) => !cleanIds.has(id));

if (cleanEntries.length !== 161) errors.push(`clean_ingredients length is ${cleanEntries.length}, expected 161`);
if (excludedEntries.length !== 38) errors.push(`excluded_ingredients length is ${excludedEntries.length}, expected 38`);
if (new Set(allIds).size !== 199) errors.push(`unique classified IDs is ${new Set(allIds).size}, expected 199`);
if (duplicateIds.length) errors.push(`duplicate ingredient IDs: ${duplicateIds.join(', ')}`);
if (overlapIds.length) errors.push(`clean/excluded overlap IDs: ${overlapIds.join(', ')}`);
if (!cleanIds.has(29)) errors.push('ingredient 29 must be clean');
if (!excludedIds.has(41)) errors.push('ingredient 41 must be excluded');
if (pilotMissingFromClean.length) {
  errors.push(`Pilot 01 ingredient IDs missing from clean whitelist: ${pilotMissingFromClean.join(', ')}`);
}

for (const item of excludedEntries) {
  if (!ALLOWED_EXCLUDED_CLASSIFICATIONS.has(item.classification)) {
    errors.push(`Invalid excluded classification for ingredient ${item.ingredient_id}: ${item.classification}`);
  }
}

const summary = {
  whitelist_path: path.relative(ROOT, WHITELIST_PATH).replace(/\\/g, '/'),
  clean_count: cleanEntries.length,
  excluded_count: excludedEntries.length,
  total_unique_ingredient_ids: new Set(allIds).size,
  duplicate_count: duplicateIds.length,
  overlap_count: overlapIds.length,
  pilot_01_ingredient_count: pilotIngredientIds.length,
  pilot_01_missing_from_clean_whitelist: pilotMissingFromClean,
  ingredient_29_classification: classifyIngredient(29, cleanIds, excludedById),
  ingredient_41_classification: classifyIngredient(41, cleanIds, excludedById),
  errors,
};

console.log(JSON.stringify(summary, null, 2));
process.exit(errors.length ? 1 : 0);
