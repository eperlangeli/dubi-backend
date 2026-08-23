const assert = require('assert');
const { validateDraftPackage } = require('./validate-recipe-drafts');

function validDraft(overrides = {}) {
  return {
    authoring_key: 'placeholder_valid_draft',
    name: 'Placeholder draft recipe',
    description: 'Non-definitive validator fixture.',
    recipe_format_code: 'bowl',
    cuisine_family_code: 'neutral',
    eligible_meal_types: ['lunch'],
    difficulty: 'easy',
    prep_time_min: 10,
    cook_time_min: 0,
    instructions_steps: ['Prepare the base.', 'Add the ingredients.', 'Serve for review.'],
    equipment: ['none'],
    transportable: false,
    ingredients: [
      {
        ingredient_id: 1,
        ingredient_name: 'Placeholder ingredient',
        quantity_g: 100,
        quantity_unit: 'g',
        measurement_basis: 'raw',
        culinary_role: 'carb_primary',
      },
    ],
    ...overrides,
  };
}

function firstErrors(packageInput) {
  return validateDraftPackage(packageInput).recipes.flatMap((recipe) => recipe.errors);
}

function assertInvalidWith(packageInput, expectedText) {
  const report = validateDraftPackage(packageInput);
  assert.strictEqual(report.valid, false);
  assert(
    report.recipes.some((recipe) => recipe.errors.some((error) => error.includes(expectedText))),
    `Expected error containing ${expectedText}, got ${JSON.stringify(report.recipes, null, 2)}`
  );
}

{
  const report = validateDraftPackage({ recipes: [validDraft()] });
  assert.strictEqual(report.valid, true);
  assert.strictEqual(report.summary.total_recipes, 1);
  assert.strictEqual(report.summary.valid_recipes, 1);
}

assertInvalidWith({
  recipes: [
    validDraft({ authoring_key: 'duplicate_key' }),
    validDraft({ authoring_key: 'duplicate_key', name: 'Second placeholder draft' }),
  ],
}, 'duplicate authoring_key');

assertInvalidWith({
  recipes: [validDraft({ eligible_meal_types: ['brunch'] })],
}, 'eligible_meal_types[0] has invalid value');

assertInvalidWith({
  recipes: [validDraft({
    ingredients: [
      {
        ingredient_id: 1,
        quantity_g: 0,
        quantity_unit: 'g',
        measurement_basis: 'raw',
        culinary_role: 'carb_primary',
      },
    ],
  })],
}, 'quantity_g must be > 0');

assertInvalidWith({
  recipes: [validDraft({
    ingredients: [
      {
        ingredient_id: 1,
        quantity_g: 100,
        quantity_unit: 'g',
        measurement_basis: 'raw',
        culinary_role: 'carb_primary',
        scalable_min_g: 120,
        scalable_max_g: 100,
      },
    ],
  })],
}, 'scalable_max_g must be >= scalable_min_g');

assertInvalidWith({
  recipes: [validDraft({ instructions_steps: ['Only one.', 'Only two.'] })],
}, 'instructions_steps must contain between 3 and 5 steps');

assertInvalidWith({
  recipes: [validDraft({ instructions_steps: ['One.', 'Two.', 'Three.', 'Four.', 'Five.', 'Six.'] })],
}, 'instructions_steps must contain between 3 and 5 steps');

assertInvalidWith({
  recipes: [validDraft({ equipment: ['none', 'oven'] })],
}, 'equipment containing none');

{
  const report = validateDraftPackage({
    recipes: [
      validDraft({
        ingredients: [
          {
            ingredient_id: 1,
            ingredient_name: 'Same placeholder ingredient as base',
            quantity_g: 80,
            quantity_unit: 'g',
            measurement_basis: 'raw',
            culinary_role: 'carb_primary',
          },
          {
            ingredient_id: 1,
            ingredient_name: 'Same placeholder ingredient as garnish',
            quantity_g: 5,
            quantity_unit: 'g',
            measurement_basis: 'raw',
            culinary_role: 'garnish',
          },
        ],
      }),
    ],
  });
  assert.strictEqual(report.valid, true, firstErrors({ recipes: [validDraft()] }).join('\n'));
}

console.log('recipe draft validator tests passed');
