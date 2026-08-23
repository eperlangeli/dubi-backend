# DUBI Draft Recipe DB-Audit Policy V1

This policy applies only to controlled draft recipe authoring.

It does not make recipes professionally validated, allergy-safe, clinically validated, runtime eligible, or configuration validated.

## Status Levels

- `PASS`: no issue under this draft-audit policy.
- `WARNING`: non-blocking issue that should remain visible for later review.
- `REVIEW_REQUIRED`: non-blocking issue that needs metadata, policy, or professional review before stricter runtime/configuration use.
- `BLOCK`: measurement-basis or identity issue that makes controlled draft authoring unsafe until resolved.

## Serving Bounds

`serving_min_g` and `serving_max_g` remain meaningful.

- Quantity inside bounds: `PASS`.
- Quantity outside bounds: `REVIEW_REQUIRED_BOUNDS`, unless another deterministic reason makes it a true authoring error.

For draft authoring, a bounds violation does not automatically require rewriting the recipe because ingredient metadata may itself require review. Runtime and configuration validation remain stricter later.

## Serving Step

`serving_step_g` is not a blocking draft-authoring rule.

- Quantity inside min/max but off step: `REVIEW_REQUIRED_STEP`.
- Do not change quantity.
- Do not change ingredient metadata.
- Do not mark a recipe invalid solely because of `serving_step_g`.

Step mismatches must remain visible in reports for later portion-policy review.

## Post-Workout Full Meal Rule

A normal full meal eaten within approximately 1-2 hours after training may count as the post-workout meal.

For a `post_workout` recipe that is clearly a full meal, ingredient-level `meal_timing` does not need to explicitly contain `post_workout` for every ingredient.

Full-meal status is detected conservatively:

- `recipe_format_code` is `bowl` or `plated_meal`.
- The recipe contains a meaningful protein component through `culinary_role` `protein_primary` or ingredient `template_slots` containing `protein`.
- The recipe contains a meaningful carbohydrate component through `culinary_role` `carb_primary` or ingredient `template_slots` containing `carb`, `carb_complex`, `carb fast`, or `carb_fast`.

When this rule applies, post-workout ingredient-level timing mismatches are reported as `POST_WORKOUT_FULL_MEAL_TIMING_OVERRIDE`.

This is an audit-policy override only. It does not mutate `ingredient.meal_timing`.

## Secondary Ingredient Meal Timing

`meal_timing` is an authoring taxonomy aid, not a clinical safety flag.

For clearly secondary culinary roles, a meal-type mismatch is non-blocking when the use is culinarily coherent.

Secondary roles include:

- `vegetable`
- `fat`
- `garnish`
- `binding`
- `bulking_agent`
- `flavor`
- `fruit` when used as a secondary component
- seasoning, spice, herb, condiment, or cooking fat roles from ingredient metadata

Secondary timing mismatches are reported as `REVIEW_REQUIRED_SECONDARY_TIMING`.

For primary protein and primary carbohydrate components, timing review remains stricter unless another explicit policy applies, such as `POST_WORKOUT_FULL_MEAL_TIMING_OVERRIDE`.

## Measurement Basis

Measurement-basis checks remain strict.

A real raw/cooked/dried or measurement-basis ambiguity may still be `BLOCK`.

No universal yield conversion is assumed. No conversion is invented during draft audit.

## Ingredient Name Matching

The same `ingredient_id` with a harmless shortened display name is not an identity failure.

Canonical draft data should still prefer the exact database name. Such cases are reported as `CANONICAL_NAME_FIX`.

Example:

- DB: `Basilico fresco`
- Draft: `Basilico`

## Reporting

Draft DB audits must not hide unresolved issues simply because they are non-blocking.

Reports should preserve:

- serving bound review items
- serving step review items
- meal-timing overrides and review items
- strict measurement-basis blocks
- canonical name fixes

This policy is reusable for draft recipe batches before later definitive recipe validation exists.
