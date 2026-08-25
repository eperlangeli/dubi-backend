const fs = require('fs');
const path = require('path');

const DEFAULT_REGISTRY_PATH = path.join(
  __dirname,
  '..',
  'data',
  'review-packs',
  'recipe-import-blocks-v1.json'
);
const RECIPE_DRAFTS_DIR = path.join(__dirname, '..', 'data', 'recipe-drafts');
const VALID_SCHEMA_VERSION = '1.0';
const VALID_STATUSES = Object.freeze(['ACTIVE', 'RESOLVED']);
const VALID_SCOPES = Object.freeze(['DEFINITIVE_IMPORT', 'PRODUCTION']);
const SEITAN_BLOCK_CODE = 'SEITAN_SOURCE_UNRESOLVED';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNonBlankString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function makeIssue(code, message, context = {}) {
  return { code, message, ...context };
}

function loadRecipeCorpus(draftsDir = RECIPE_DRAFTS_DIR) {
  const files = fs.readdirSync(draftsDir)
    .filter((file) => file.endsWith('.json') && file !== 'template.json')
    .sort();

  const recipes = [];
  for (const file of files) {
    const raw = readJson(path.join(draftsDir, file));
    const items = Array.isArray(raw) ? raw : raw.recipes;
    if (!Array.isArray(items)) continue;
    for (const recipe of items) {
      recipes.push({ ...recipe, source_file: file });
    }
  }

  return recipes;
}

function collectCorpusIndex(recipes = loadRecipeCorpus()) {
  const recipesByKey = new Map();
  const seitanRecipeKeys = [];

  for (const recipe of recipes) {
    if (isNonBlankString(recipe.authoring_key)) {
      recipesByKey.set(recipe.authoring_key, recipe);
    }

    const usesSeitan = (recipe.ingredients || []).some((ingredient) => (
      ingredient.ingredient_id === 16
      || String(ingredient.ingredient_name || '').trim().toLowerCase() === 'seitan'
    ));
    if (usesSeitan) seitanRecipeKeys.push(recipe.authoring_key);
  }

  seitanRecipeKeys.sort();
  return { recipes, recipesByKey, seitanRecipeKeys };
}

function validateRegistry(registry, corpusIndex = collectCorpusIndex()) {
  const errors = [];
  const activeKeys = new Set();
  const activeSeitanKeys = new Set();

  if (!isObject(registry)) {
    return {
      valid: false,
      errors: [makeIssue('REGISTRY_NOT_OBJECT', 'registry must be an object')],
      summary: {},
    };
  }

  if (registry.schema_version !== VALID_SCHEMA_VERSION) {
    errors.push(makeIssue('SCHEMA_VERSION_INVALID', 'schema_version must be 1.0', {
      value: registry.schema_version,
    }));
  }

  if (!Array.isArray(registry.blocks)) {
    errors.push(makeIssue('BLOCKS_NOT_ARRAY', 'blocks must be an array'));
  }

  const blocks = Array.isArray(registry.blocks) ? registry.blocks : [];

  blocks.forEach((block, index) => {
    if (!isObject(block)) {
      errors.push(makeIssue('BLOCK_NOT_OBJECT', 'block must be an object', { index }));
      return;
    }

    const {
      authoring_key: authoringKey,
      block_code: blockCode,
      status,
      scope,
      reason,
      resolution_required: resolutionRequired,
    } = block;

    if (!isNonBlankString(authoringKey)) {
      errors.push(makeIssue('AUTHORING_KEY_MISSING', 'authoring_key is required', { index }));
    } else if (!corpusIndex.recipesByKey.has(authoringKey)) {
      errors.push(makeIssue('AUTHORING_KEY_UNKNOWN', 'authoring_key must exist in recipe corpus', {
        index,
        authoring_key: authoringKey,
      }));
    }

    if (!isNonBlankString(blockCode)) {
      errors.push(makeIssue('BLOCK_CODE_MISSING', 'block_code is required', { index, authoring_key: authoringKey }));
    }

    if (!VALID_STATUSES.includes(status)) {
      errors.push(makeIssue('STATUS_INVALID', 'status must be ACTIVE or RESOLVED', {
        index,
        authoring_key: authoringKey,
        status,
      }));
    }

    if (!VALID_SCOPES.includes(scope)) {
      errors.push(makeIssue('SCOPE_INVALID', 'scope must be DEFINITIVE_IMPORT or PRODUCTION', {
        index,
        authoring_key: authoringKey,
        scope,
      }));
    }

    if (!isNonBlankString(reason)) {
      errors.push(makeIssue('REASON_MISSING', 'reason is required', { index, authoring_key: authoringKey }));
    }

    if (!Array.isArray(resolutionRequired) || resolutionRequired.length === 0) {
      errors.push(makeIssue('RESOLUTION_REQUIRED_MISSING', 'resolution_required must contain at least one item', {
        index,
        authoring_key: authoringKey,
      }));
    } else {
      resolutionRequired.forEach((item, itemIndex) => {
        if (!isNonBlankString(item)) {
          errors.push(makeIssue('RESOLUTION_REQUIRED_ITEM_INVALID', 'resolution_required items must be nonblank strings', {
            index,
            item_index: itemIndex,
            authoring_key: authoringKey,
          }));
        }
      });
    }

    if (status === 'ACTIVE') {
      const uniqueKey = `${authoringKey}::${blockCode}`;
      if (activeKeys.has(uniqueKey)) {
        errors.push(makeIssue('DUPLICATE_ACTIVE_BLOCK', 'authoring_key must be unique per active block_code', {
          index,
          authoring_key: authoringKey,
          block_code: blockCode,
        }));
      }
      activeKeys.add(uniqueKey);

      if (corpusIndex.seitanRecipeKeys.includes(authoringKey)) {
        if (blockCode !== SEITAN_BLOCK_CODE) {
          errors.push(makeIssue('ACTIVE_SEITAN_BLOCK_CODE_INVALID', 'active seitan block must use SEITAN_SOURCE_UNRESOLVED', {
            index,
            authoring_key: authoringKey,
            block_code: blockCode,
          }));
        } else {
          activeSeitanKeys.add(authoringKey);
        }
      }
    }
  });

  const sortedBlocks = [...blocks].sort((a, b) => {
    const left = `${a.authoring_key || ''}::${a.block_code || ''}::${a.status || ''}::${a.scope || ''}`;
    const right = `${b.authoring_key || ''}::${b.block_code || ''}::${b.status || ''}::${b.scope || ''}`;
    return left.localeCompare(right);
  });

  if (JSON.stringify(blocks) !== JSON.stringify(sortedBlocks)) {
    errors.push(makeIssue('BLOCKS_NOT_SORTED', 'blocks must be sorted deterministically by authoring_key, block_code, status and scope'));
  }

  for (const authoringKey of corpusIndex.seitanRecipeKeys) {
    if (!activeSeitanKeys.has(authoringKey)) {
      errors.push(makeIssue('SEITAN_RECIPE_ACTIVE_BLOCK_MISSING', 'each unresolved seitan recipe must have an active SEITAN_SOURCE_UNRESOLVED block', {
        authoring_key: authoringKey,
      }));
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    summary: {
      recipe_count: corpusIndex.recipes.length,
      seitan_recipe_count: corpusIndex.seitanRecipeKeys.length,
      block_count: blocks.length,
      active_block_count: blocks.filter((block) => block.status === 'ACTIVE').length,
      active_seitan_block_count: activeSeitanKeys.size,
    },
  };
}

function main() {
  const registryPath = process.argv[2] || DEFAULT_REGISTRY_PATH;
  const registry = readJson(registryPath);
  const report = validateRegistry(registry);
  console.log(JSON.stringify(report, null, 2));
  if (!report.valid) process.exit(1);
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_REGISTRY_PATH,
  SEITAN_BLOCK_CODE,
  collectCorpusIndex,
  loadRecipeCorpus,
  validateRegistry,
};
