const fs = require('fs');
const path = require('path');

const DEFAULT_SNAPSHOT_PATH = path.join(
  __dirname,
  '..',
  'data',
  'test-fixtures',
  'ingredient-scaling-metadata-v1.json'
);

const RECIPE_DRAFTS_DIR = path.join(__dirname, '..', 'data', 'recipe-drafts');
const PILOT_FILE_RE = /^pilot-\d+\.json$/;
const REQUIRED_FIELDS = Object.freeze([
  'ingredient_id',
  'name',
  'serving_min_g',
  'serving_max_g',
  'serving_step_g',
  'typical_portion_g',
  'raw_or_cooked',
  'edible_portion_fraction',
]);
const OPTIONAL_FIELDS = Object.freeze(['freshness_form']);
const POSITIVE_OR_NULL_FIELDS = Object.freeze([
  'serving_min_g',
  'serving_max_g',
  'serving_step_g',
  'typical_portion_g',
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeRecipePackage(input) {
  if (Array.isArray(input)) return input;
  if (input && typeof input === 'object' && Array.isArray(input.recipes)) return input.recipes;
  return [];
}

function collectCorpusIngredientIds(recipeDraftsDir = RECIPE_DRAFTS_DIR) {
  const ids = new Set();
  const recipeFiles = fs.readdirSync(recipeDraftsDir)
    .filter((fileName) => PILOT_FILE_RE.test(fileName))
    .sort();

  recipeFiles.forEach((fileName) => {
    const recipes = normalizeRecipePackage(readJson(path.join(recipeDraftsDir, fileName)));
    recipes.forEach((recipe) => {
      (recipe.ingredients || []).forEach((ingredient) => {
        if (Number.isInteger(ingredient.ingredient_id)) ids.add(ingredient.ingredient_id);
      });
    });
  });

  return [...ids].sort((a, b) => a - b);
}

function isPositiveNumberOrNull(value) {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value > 0);
}

function isValidEdibleFraction(value) {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1);
}

function makeIssue(code, message, details = {}) {
  return { code, message, ...details };
}

function summarizeMetadata(rows) {
  const countWhere = (predicate) => rows.filter(predicate).length;
  const rawOrCookedCounts = rows.reduce((acc, row) => {
    const key = row.raw_or_cooked === null ? 'null' : String(row.raw_or_cooked);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return {
    serving_min_g_non_null: countWhere((row) => row.serving_min_g !== null),
    serving_max_g_non_null: countWhere((row) => row.serving_max_g !== null),
    serving_step_g_non_null: countWhere((row) => row.serving_step_g !== null),
    all_min_max_step_non_null: countWhere((row) => (
      row.serving_min_g !== null
      && row.serving_max_g !== null
      && row.serving_step_g !== null
    )),
    typical_portion_g_non_null: countWhere((row) => row.typical_portion_g !== null),
    raw_or_cooked_non_null: countWhere((row) => row.raw_or_cooked !== null),
    edible_portion_fraction_non_null: countWhere((row) => row.edible_portion_fraction !== null),
    partial_patterns: {
      min_without_max: countWhere((row) => row.serving_min_g !== null && row.serving_max_g === null),
      max_without_min: countWhere((row) => row.serving_max_g !== null && row.serving_min_g === null),
      step_without_min: countWhere((row) => row.serving_step_g !== null && row.serving_min_g === null),
      step_without_max: countWhere((row) => row.serving_step_g !== null && row.serving_max_g === null),
      bounds_without_step: countWhere((row) => row.serving_min_g !== null && row.serving_max_g !== null && row.serving_step_g === null),
      step_with_both_bounds: countWhere((row) => row.serving_step_g !== null && row.serving_min_g !== null && row.serving_max_g !== null),
    },
    raw_or_cooked_counts: rawOrCookedCounts,
  };
}

function validateSnapshot(snapshot, corpusIds) {
  const errors = [];

  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    errors.push(makeIssue('SNAPSHOT_ROOT_INVALID', 'snapshot root must be an object'));
    return { valid: false, errors, summary: {} };
  }

  if (snapshot.schema_version !== '1.0') {
    errors.push(makeIssue('SNAPSHOT_SCHEMA_VERSION_INVALID', 'schema_version must be 1.0'));
  }
  if (snapshot.source !== 'public.ingredients') {
    errors.push(makeIssue('SNAPSHOT_SOURCE_INVALID', 'source must be public.ingredients'));
  }
  if (snapshot.scope !== 'ingredients_used_by_recipe_draft_corpus_v1') {
    errors.push(makeIssue('SNAPSHOT_SCOPE_INVALID', 'scope must identify recipe draft corpus v1'));
  }
  if (!Array.isArray(snapshot.ingredients)) {
    errors.push(makeIssue('SNAPSHOT_INGREDIENTS_INVALID', 'ingredients must be an array'));
    return { valid: false, errors, summary: {} };
  }
  if (snapshot.ingredient_count !== snapshot.ingredients.length) {
    errors.push(makeIssue('SNAPSHOT_INGREDIENT_COUNT_INVALID', 'ingredient_count must equal ingredients.length', {
      ingredient_count: snapshot.ingredient_count,
      actual: snapshot.ingredients.length,
    }));
  }

  const seen = new Set();
  const snapshotIds = [];
  let previousId = null;

  snapshot.ingredients.forEach((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      errors.push(makeIssue('INGREDIENT_ROW_INVALID', 'ingredient row must be an object', { index }));
      return;
    }

    [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS].forEach((field) => {
      if (!Object.prototype.hasOwnProperty.call(row, field)) {
        errors.push(makeIssue('INGREDIENT_FIELD_MISSING', `${field} must be present to preserve nulls explicitly`, {
          index,
          ingredient_id: row.ingredient_id,
          field,
        }));
      }
    });

    if (!Number.isInteger(row.ingredient_id) || row.ingredient_id <= 0) {
      errors.push(makeIssue('INGREDIENT_ID_INVALID', 'ingredient_id must be a positive integer', {
        index,
        ingredient_id: row.ingredient_id,
      }));
    } else {
      snapshotIds.push(row.ingredient_id);
      if (seen.has(row.ingredient_id)) {
        errors.push(makeIssue('INGREDIENT_ID_DUPLICATE', 'ingredient_id appears more than once', {
          ingredient_id: row.ingredient_id,
        }));
      }
      seen.add(row.ingredient_id);

      if (previousId !== null && row.ingredient_id <= previousId) {
        errors.push(makeIssue('SNAPSHOT_NOT_SORTED', 'ingredients must be sorted by ingredient_id ascending', {
          previous_ingredient_id: previousId,
          ingredient_id: row.ingredient_id,
        }));
      }
      previousId = row.ingredient_id;
    }

    if (typeof row.name !== 'string' || row.name.trim() === '') {
      errors.push(makeIssue('INGREDIENT_NAME_INVALID', 'name must be a non-empty string', {
        index,
        ingredient_id: row.ingredient_id,
      }));
    }

    POSITIVE_OR_NULL_FIELDS.forEach((field) => {
      if (!isPositiveNumberOrNull(row[field])) {
        errors.push(makeIssue('INGREDIENT_POSITIVE_FIELD_INVALID', `${field} must be null or a positive number`, {
          ingredient_id: row.ingredient_id,
          field,
          value: row[field],
        }));
      }
    });

    if (row.serving_min_g !== null && row.serving_max_g !== null && row.serving_min_g > row.serving_max_g) {
      errors.push(makeIssue('INGREDIENT_MIN_GT_MAX', 'serving_min_g must be <= serving_max_g when both are present', {
        ingredient_id: row.ingredient_id,
        serving_min_g: row.serving_min_g,
        serving_max_g: row.serving_max_g,
      }));
    }

    if (!isValidEdibleFraction(row.edible_portion_fraction)) {
      errors.push(makeIssue('INGREDIENT_EDIBLE_PORTION_INVALID', 'edible_portion_fraction must be null or > 0 and <= 1', {
        ingredient_id: row.ingredient_id,
        value: row.edible_portion_fraction,
      }));
    }

    ['raw_or_cooked', 'freshness_form'].forEach((field) => {
      if (row[field] !== null && typeof row[field] !== 'string') {
        errors.push(makeIssue('INGREDIENT_TEXT_OR_NULL_INVALID', `${field} must be null or a string`, {
          ingredient_id: row.ingredient_id,
          field,
          value: row[field],
        }));
      }
    });
  });

  const expectedSet = new Set(corpusIds);
  const snapshotSet = new Set(snapshotIds);
  const missingIds = corpusIds.filter((id) => !snapshotSet.has(id));
  const extraIds = snapshotIds.filter((id) => !expectedSet.has(id));

  missingIds.forEach((ingredientId) => {
    errors.push(makeIssue('CORPUS_INGREDIENT_ID_MISSING_FROM_SNAPSHOT', 'corpus ingredient id is missing from snapshot', {
      ingredient_id: ingredientId,
    }));
  });
  extraIds.forEach((ingredientId) => {
    errors.push(makeIssue('SNAPSHOT_INGREDIENT_ID_NOT_IN_CORPUS', 'snapshot ingredient id is not used by the draft corpus', {
      ingredient_id: ingredientId,
    }));
  });

  const summary = {
    corpus_unique_ids: corpusIds.length,
    snapshot_records: snapshot.ingredients.length,
    missing_ids: missingIds.length,
    extra_ids: extraIds.length,
    duplicate_ids: snapshotIds.length - snapshotSet.size,
    ...summarizeMetadata(snapshot.ingredients),
  };

  return {
    valid: errors.length === 0,
    errors,
    summary,
  };
}

function validateFile(snapshotPath = DEFAULT_SNAPSHOT_PATH, recipeDraftsDir = RECIPE_DRAFTS_DIR) {
  const corpusIds = collectCorpusIngredientIds(recipeDraftsDir);
  const snapshot = readJson(snapshotPath);
  return validateSnapshot(snapshot, corpusIds);
}

function main() {
  const snapshotPath = process.argv[2] || DEFAULT_SNAPSHOT_PATH;
  const recipeDraftsDir = process.argv[3] || RECIPE_DRAFTS_DIR;
  try {
    const report = validateFile(snapshotPath, recipeDraftsDir);
    console.log(JSON.stringify(report, null, 2));
    if (!report.valid) process.exit(1);
  } catch (error) {
    console.error(JSON.stringify({
      valid: false,
      errors: [makeIssue('SNAPSHOT_VALIDATOR_RUNTIME_ERROR', error.message)],
    }, null, 2));
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_SNAPSHOT_PATH,
  RECIPE_DRAFTS_DIR,
  collectCorpusIngredientIds,
  summarizeMetadata,
  validateFile,
  validateSnapshot,
};
