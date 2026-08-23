const fs = require('fs');
const path = require('path');

const RECIPE_FORMAT_CODES = Object.freeze([
  'plated_meal',
  'bowl',
  'salad',
  'sandwich_wrap',
  'soup_stew',
  'smoothie',
  'drink',
  'handheld',
]);

const CUISINE_FAMILY_CODES = Object.freeze([
  'italian',
  'mediterranean',
  'asian_inspired',
  'middle_eastern',
  'latin_inspired',
  'neutral',
]);

const MEAL_TYPES = Object.freeze([
  'breakfast',
  'snack',
  'lunch',
  'dinner',
  'pre_workout',
  'post_workout',
]);

const EQUIPMENT = Object.freeze([
  'stovetop',
  'oven',
  'microwave',
  'blender',
  'air_fryer',
  'none',
]);

const QUANTITY_UNITS = Object.freeze(['g', 'ml', 'piece', 'tbsp', 'tsp', 'cup', 'dL']);
const MEASUREMENT_BASES = Object.freeze(['raw', 'cooked', 'preserved']);
const DIFFICULTIES = Object.freeze(['easy', 'medium']);
const BREAKFAST_STYLES = Object.freeze(['sweet', 'savory', 'both', 'not_applicable']);
const REHEATING_METHODS = Object.freeze(['microwave', 'stovetop', 'oven', 'none']);
const BUDGET_TIERS = Object.freeze(['budget', 'moderate', 'premium']);
const CLEAN_WHITELIST_PATH = path.join(__dirname, '..', 'data', 'ingredient-whitelists', 'clean-v1.json');
const INGREDIENT_NOT_IN_CLEAN_WHITELIST = 'INGREDIENT_NOT_IN_CLEAN_WHITELIST';
const INGREDIENT_NOT_CLASSIFIED_IN_WHITELIST = 'INGREDIENT_NOT_CLASSIFIED_IN_WHITELIST';
const WHITELIST_CONFIGURATION_ERROR = 'WHITELIST_CONFIGURATION_ERROR';
const YIELD_CONVERSION_WARNING = 'YIELD_CONVERSION_NOT_CHECKED: measurement-basis compatibility and validated yield-conversion availability require ingredient metadata / DB audit';
const CULINARY_ROLES = Object.freeze([
  'protein_primary',
  'carb_primary',
  'fat',
  'vegetable',
  'fruit',
  'binding',
  'garnish',
  'bulking_agent',
  'flavor',
]);

const PROHIBITED_RECIPE_FIELDS = Object.freeze([
  'dietary_styles',
  'ingredient_count_excluding_water_spices',
  'total_time_min',
  'time_class',
  'base_has_blocked_policy',
  'base_has_unresolved_policy',
  'base_requires_clinical_review',
  'validation_status',
  'lifecycle_status',
  'recipe_version',
  'nutrition_reviewer',
  'nutrition_review_status',
  'nutrition_review_date',
  'nutrition_reviewed_version',
  'clinical_reviewer',
  'clinical_review_status',
  'clinical_review_date',
  'clinical_reviewed_version',
]);

const CULINARY_CAPS = Object.freeze({
  breakfast: 5,
  snack: 3,
  lunch: 7,
  dinner: 7,
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPositiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function optionalNonEmptyString(value) {
  return value === undefined || value === null || isNonEmptyString(value);
}

function optionalBoolean(value) {
  return value === undefined || typeof value === 'boolean';
}

function optionalPositiveInteger(value) {
  return value === undefined || value === null || isPositiveInteger(value);
}

function optionalPositiveNumber(value) {
  return value === undefined || value === null || isPositiveNumber(value);
}

function validateStringArraySubset(value, allowed, field, errors, { required = false } = {}) {
  if (value === undefined || value === null) {
    if (required) errors.push(`${field} is required`);
    return;
  }
  if (!Array.isArray(value)) {
    errors.push(`${field} must be an array`);
    return;
  }
  if (required && value.length === 0) {
    errors.push(`${field} must contain at least one value`);
  }
  value.forEach((item, index) => {
    if (!allowed.includes(item)) {
      errors.push(`${field}[${index}] has invalid value ${JSON.stringify(item)}`);
    }
  });
}

function normalizePackage(input) {
  if (Array.isArray(input)) return { recipes: input };
  if (isPlainObject(input) && Array.isArray(input.recipes)) return input;
  return null;
}

function loadCleanWhitelist(filePath = CLEAN_WHITELIST_PATH) {
  const errors = [];
  let parsed;

  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return {
      valid: false,
      errors: [`${WHITELIST_CONFIGURATION_ERROR}: cannot load clean ingredient whitelist: ${error.message}`],
      cleanIngredientIds: new Set(),
      excludedIngredientLookup: new Map(),
    };
  }

  if (!isPlainObject(parsed)) {
    errors.push(`${WHITELIST_CONFIGURATION_ERROR}: clean ingredient whitelist root must be an object`);
  }
  if (!Array.isArray(parsed.clean_ingredients)) {
    errors.push(`${WHITELIST_CONFIGURATION_ERROR}: clean_ingredients must be an array`);
  }
  if (!Array.isArray(parsed.excluded_ingredients)) {
    errors.push(`${WHITELIST_CONFIGURATION_ERROR}: excluded_ingredients must be an array`);
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      cleanIngredientIds: new Set(),
      excludedIngredientLookup: new Map(),
    };
  }

  const cleanIngredientIds = new Set();
  const excludedIngredientLookup = new Map();
  const seenIds = new Map();

  function recordId(entry, section, index) {
    if (!isPlainObject(entry)) {
      errors.push(`${WHITELIST_CONFIGURATION_ERROR}: ${section}[${index}] must be an object`);
      return null;
    }
    if (!isPositiveInteger(entry.ingredient_id)) {
      errors.push(`${WHITELIST_CONFIGURATION_ERROR}: ${section}[${index}].ingredient_id must be an integer > 0`);
      return null;
    }

    const previousSection = seenIds.get(entry.ingredient_id);
    if (previousSection) {
      errors.push(`${WHITELIST_CONFIGURATION_ERROR}: ingredient_id ${entry.ingredient_id} appears in both/duplicate whitelist sections (${previousSection}, ${section})`);
    } else {
      seenIds.set(entry.ingredient_id, section);
    }
    return entry.ingredient_id;
  }

  parsed.clean_ingredients.forEach((entry, index) => {
    const ingredientId = recordId(entry, 'clean_ingredients', index);
    if (ingredientId !== null) cleanIngredientIds.add(ingredientId);
  });

  parsed.excluded_ingredients.forEach((entry, index) => {
    const ingredientId = recordId(entry, 'excluded_ingredients', index);
    if (ingredientId !== null) excludedIngredientLookup.set(ingredientId, entry);
  });

  return {
    valid: errors.length === 0,
    errors,
    cleanIngredientIds,
    excludedIngredientLookup,
  };
}

function validateIngredient(ingredient, index, recipeWarnings, whitelist, authoringKey) {
  const errors = [];

  if (!isPlainObject(ingredient)) {
    return { errors: [`ingredients[${index}] must be an object`] };
  }

  if (!isPositiveInteger(ingredient.ingredient_id)) {
    errors.push(`ingredients[${index}].ingredient_id must be an integer > 0`);
  } else if (whitelist.cleanIngredientIds.has(ingredient.ingredient_id)) {
    // Static authoring guardrail only: this does not imply allergy or clinical approval.
  } else if (whitelist.excludedIngredientLookup.has(ingredient.ingredient_id)) {
    const excluded = whitelist.excludedIngredientLookup.get(ingredient.ingredient_id);
    errors.push(
      `${INGREDIENT_NOT_IN_CLEAN_WHITELIST}: authoring_key=${JSON.stringify(authoringKey)}, ingredient_id=${ingredient.ingredient_id}, ingredient_name=${JSON.stringify(ingredient.ingredient_name || excluded.name || null)}, classification=${JSON.stringify(excluded.classification || null)}, reason=${JSON.stringify(excluded.reason || null)}`
    );
  } else {
    errors.push(
      `${INGREDIENT_NOT_CLASSIFIED_IN_WHITELIST}: authoring_key=${JSON.stringify(authoringKey)}, ingredient_id=${ingredient.ingredient_id}, ingredient_name=${JSON.stringify(ingredient.ingredient_name || null)}`
    );
  }

  if (ingredient.ingredient_name !== undefined && !optionalNonEmptyString(ingredient.ingredient_name)) {
    errors.push(`ingredients[${index}].ingredient_name must be a non-empty string when provided`);
  }

  if (!isPositiveNumber(ingredient.quantity_g)) {
    errors.push(`ingredients[${index}].quantity_g must be > 0`);
  }

  if (!QUANTITY_UNITS.includes(ingredient.quantity_unit)) {
    errors.push(`ingredients[${index}].quantity_unit has invalid value ${JSON.stringify(ingredient.quantity_unit)}`);
  }

  if (!MEASUREMENT_BASES.includes(ingredient.measurement_basis)) {
    errors.push(`ingredients[${index}].measurement_basis has invalid value ${JSON.stringify(ingredient.measurement_basis)}`);
  }

  if (!CULINARY_ROLES.includes(ingredient.culinary_role)) {
    errors.push(`ingredients[${index}].culinary_role has invalid value ${JSON.stringify(ingredient.culinary_role)}`);
  }

  if (!optionalBoolean(ingredient.is_scalable)) {
    errors.push(`ingredients[${index}].is_scalable must be boolean when provided`);
  }

  if (!optionalPositiveNumber(ingredient.scalable_min_g)) {
    errors.push(`ingredients[${index}].scalable_min_g must be > 0 when provided`);
  }
  if (!optionalPositiveNumber(ingredient.scalable_max_g)) {
    errors.push(`ingredients[${index}].scalable_max_g must be > 0 when provided`);
  }
  if (!optionalPositiveNumber(ingredient.scalable_step_g)) {
    errors.push(`ingredients[${index}].scalable_step_g must be > 0 when provided`);
  }

  const min = ingredient.scalable_min_g;
  const max = ingredient.scalable_max_g;
  const step = ingredient.scalable_step_g;
  if (min !== undefined && min !== null && max !== undefined && max !== null && isPositiveNumber(min) && isPositiveNumber(max)) {
    if (max < min) {
      errors.push(`ingredients[${index}].scalable_max_g must be >= scalable_min_g`);
    } else if (
      step !== undefined
      && step !== null
      && isPositiveNumber(step)
      && min !== max
      && step > max - min
    ) {
      errors.push(`ingredients[${index}].scalable_step_g must be <= scalable_max_g - scalable_min_g unless min equals max`);
    }
  }

  if (!optionalBoolean(ingredient.is_optional_culinary_metadata)) {
    errors.push(`ingredients[${index}].is_optional_culinary_metadata must be boolean when provided`);
  }

  if (!optionalNonEmptyString(ingredient.fixed_or_scalable_reason)) {
    errors.push(`ingredients[${index}].fixed_or_scalable_reason must be a non-empty string when provided`);
  }
  if (!optionalNonEmptyString(ingredient.notes)) {
    errors.push(`ingredients[${index}].notes must be a non-empty string when provided`);
  }

  Object.keys(ingredient).forEach((key) => {
    if (/^(allergen_|ok_|clinical_|safe_|nutrition_review|clinical_review)/.test(key)) {
      errors.push(`ingredients[${index}].${key} is not an authoring source field`);
    }
  });

  return { errors };
}

function validateRecipe(recipe, index, seenKeys, whitelist) {
  const errors = [];
  const warnings = new Set([
    'INGREDIENT_ID_EXISTENCE_NOT_CHECKED: requires DB/export metadata',
    'ALLERGEN_STATE_NOT_CHECKED: recipe safety must derive from ingredient data later',
    'PROFESSIONAL_REVIEW_NOT_CHECKED: draft authoring cannot approve recipes',
    'INGREDIENT_SERVING_BOUNDS_NOT_CHECKED: requires DB/export metadata',
    YIELD_CONVERSION_WARNING,
  ]);

  if (!isPlainObject(recipe)) {
    return {
      authoring_key: null,
      errors: [`recipes[${index}] must be an object`],
      warnings: Array.from(warnings),
    };
  }

  const authoringKey = recipe.authoring_key;
  if (!isNonEmptyString(authoringKey)) {
    errors.push('authoring_key is required and must be a non-empty string');
  } else if (seenKeys.has(authoringKey)) {
    errors.push(`duplicate authoring_key ${JSON.stringify(authoringKey)}`);
  } else {
    seenKeys.add(authoringKey);
  }

  if (!isNonEmptyString(recipe.name)) errors.push('name is required and must be non-empty');
  if (!optionalNonEmptyString(recipe.description)) errors.push('description must be non-empty when provided');
  if (!RECIPE_FORMAT_CODES.includes(recipe.recipe_format_code)) {
    errors.push(`recipe_format_code has invalid value ${JSON.stringify(recipe.recipe_format_code)}`);
  }
  if (recipe.cuisine_family_code !== undefined && recipe.cuisine_family_code !== null && !CUISINE_FAMILY_CODES.includes(recipe.cuisine_family_code)) {
    errors.push(`cuisine_family_code has invalid value ${JSON.stringify(recipe.cuisine_family_code)}`);
  }
  validateStringArraySubset(recipe.eligible_meal_types, MEAL_TYPES, 'eligible_meal_types', errors, { required: true });

  if (!DIFFICULTIES.includes(recipe.difficulty)) errors.push(`difficulty has invalid value ${JSON.stringify(recipe.difficulty)}`);
  if (!isNonNegativeInteger(recipe.prep_time_min)) errors.push('prep_time_min must be an integer >= 0');
  if (!isNonNegativeInteger(recipe.cook_time_min)) errors.push('cook_time_min must be an integer >= 0');

  if (!Array.isArray(recipe.instructions_steps)) {
    errors.push('instructions_steps must be an array');
  } else {
    if (recipe.instructions_steps.length < 3 || recipe.instructions_steps.length > 5) {
      errors.push('instructions_steps must contain between 3 and 5 steps');
    }
    recipe.instructions_steps.forEach((step, stepIndex) => {
      if (!isNonEmptyString(step)) errors.push(`instructions_steps[${stepIndex}] must be a non-empty string`);
    });
  }

  validateStringArraySubset(recipe.equipment, EQUIPMENT, 'equipment', errors);
  if (Array.isArray(recipe.equipment) && recipe.equipment.includes('none') && recipe.equipment.length !== 1) {
    errors.push('equipment containing none must not contain any other value');
  }

  if (!optionalBoolean(recipe.transportable)) errors.push('transportable must be boolean when provided');
  if (recipe.breakfast_style !== undefined && recipe.breakfast_style !== null && !BREAKFAST_STYLES.includes(recipe.breakfast_style)) {
    errors.push(`breakfast_style has invalid value ${JSON.stringify(recipe.breakfast_style)}`);
  }
  if (!optionalBoolean(recipe.meal_prep_compatible)) errors.push('meal_prep_compatible must be boolean when provided');
  if (!optionalPositiveInteger(recipe.storage_fridge_days)) errors.push('storage_fridge_days must be a positive integer when provided');
  if (!optionalPositiveInteger(recipe.storage_freezer_days)) errors.push('storage_freezer_days must be a positive integer when provided');
  if (recipe.reheating_method !== undefined && recipe.reheating_method !== null && !REHEATING_METHODS.includes(recipe.reheating_method)) {
    errors.push(`reheating_method has invalid value ${JSON.stringify(recipe.reheating_method)}`);
  }
  if (recipe.budget_tier !== undefined && recipe.budget_tier !== null && !BUDGET_TIERS.includes(recipe.budget_tier)) {
    errors.push(`budget_tier has invalid value ${JSON.stringify(recipe.budget_tier)}`);
  }
  if (!optionalNonEmptyString(recipe.notes)) errors.push('notes must be non-empty when provided');

  PROHIBITED_RECIPE_FIELDS.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(recipe, field)) {
      errors.push(`${field} is not an authoring source field`);
    }
  });

  if (!Array.isArray(recipe.ingredients)) {
    errors.push('ingredients must be a non-empty array');
  } else if (recipe.ingredients.length === 0) {
    errors.push('ingredients must contain at least one row');
  } else {
    recipe.ingredients.forEach((ingredient, ingredientIndex) => {
      validateIngredient(ingredient, ingredientIndex, warnings, whitelist, authoringKey).errors.forEach((error) => errors.push(error));
    });
  }

  if (Array.isArray(recipe.eligible_meal_types)) {
    const cappedMealTypes = recipe.eligible_meal_types.filter((mealType) => CULINARY_CAPS[mealType]);
    if (cappedMealTypes.length > 0) {
      warnings.add('NEEDS_DB_METADATA: culinary ingredient-count caps exclude water/spices and cannot be proven from ingredient_id alone');
    }
  }

  return {
    authoring_key: isNonEmptyString(authoringKey) ? authoringKey : null,
    errors,
    warnings: Array.from(warnings).sort(),
  };
}

function validateDraftPackage(input, options = {}) {
  const normalized = normalizePackage(input);
  if (!normalized) {
    return {
      valid: false,
      summary: {
        total_recipes: 0,
        valid_recipes: 0,
        invalid_recipes: 0,
        errors: 1,
        warnings: 0,
      },
      recipes: [
        {
          authoring_key: null,
          errors: ['Root must be an array of recipes or an object with a recipes array'],
          warnings: [],
        },
      ],
    };
  }

  const whitelist = options.whitelist || loadCleanWhitelist(options.whitelistPath);
  if (!whitelist.valid) {
    return {
      valid: false,
      summary: {
        total_recipes: normalized.recipes.length,
        valid_recipes: 0,
        invalid_recipes: normalized.recipes.length,
        errors: whitelist.errors.length,
        warnings: 0,
      },
      recipes: [
        {
          authoring_key: null,
          errors: whitelist.errors,
          warnings: [],
        },
      ],
    };
  }

  const seenKeys = new Set();
  const recipeReports = normalized.recipes.map((recipe, index) => validateRecipe(recipe, index, seenKeys, whitelist));
  const errors = recipeReports.reduce((sum, report) => sum + report.errors.length, 0);
  const warnings = recipeReports.reduce((sum, report) => sum + report.warnings.length, 0);
  const validRecipes = recipeReports.filter((report) => report.errors.length === 0).length;

  return {
    valid: errors === 0,
    summary: {
      total_recipes: recipeReports.length,
      valid_recipes: validRecipes,
      invalid_recipes: recipeReports.length - validRecipes,
      errors,
      warnings,
    },
    recipes: recipeReports,
  };
}

function validateFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  return validateDraftPackage(parsed);
}

if (require.main === module) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node scripts/validate-recipe-drafts.js <recipe-drafts.json>');
    process.exit(2);
  }

  try {
    const report = validateFile(filePath);
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.valid ? 0 : 1);
  } catch (error) {
    console.error(JSON.stringify({
      valid: false,
      summary: {
        total_recipes: 0,
        valid_recipes: 0,
        invalid_recipes: 0,
        errors: 1,
        warnings: 0,
      },
      recipes: [
        {
          authoring_key: null,
          errors: [error.message],
          warnings: [],
        },
      ],
    }, null, 2));
    process.exit(1);
  }
}

module.exports = {
  loadCleanWhitelist,
  validateDraftPackage,
  validateFile,
  constants: {
    RECIPE_FORMAT_CODES,
    CUISINE_FAMILY_CODES,
    MEAL_TYPES,
    EQUIPMENT,
    QUANTITY_UNITS,
    MEASUREMENT_BASES,
    CULINARY_ROLES,
    INGREDIENT_NOT_IN_CLEAN_WHITELIST,
    INGREDIENT_NOT_CLASSIFIED_IN_WHITELIST,
    WHITELIST_CONFIGURATION_ERROR,
  },
};
