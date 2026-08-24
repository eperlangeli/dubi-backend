# DUBI Recipe Nutrition Review Guide V1

This guide supports professional nutrition review of the 130 controlled draft recipes in `data/review-packs/recipe-nutrition-review-v1.csv`.

These recipes are controlled drafts only. They are not professionally nutrition validated, allergy-safe, clinically validated, definitive-import ready, or runtime ready.

## Review Scope

The nutritionist should review recipe-level nutrition and portion coherence. This guide does not ask the reviewer to validate clinical disease policies, medication-specific policies, allergen safety, or cross-contact safety.

## A. Nutritional Coherence

For every recipe, assess calories, protein, carbohydrates, fats, fiber, and the overall balance for the declared meal role.

## B. Portion Coherence

Assess ingredient quantities, practical serving size, realism of the gram amounts, and whether any portion should change.

## C. Meal-Role Coherence

Assess whether the recipe is coherent for its declared role: breakfast, snack, lunch/dinner, pre-workout, or post-workout.

## D. Workout Nutrition

For pre-workout recipes, assess timing compatibility, digestibility, carbohydrate structure, and excessive fat or fiber where relevant. Do not apply a fixed 90 g carbohydrate assumption.

For post-workout recipes, assess meal structure and protein/carbohydrate coherence. A full meal may count as a recovery meal. Do not automatically require 1 g/kg carbohydrate.

## E. Recipe-Level Nutrition Decision

For nutrition, portion, and workout timing where applicable, use only:

- `APPROVED`
- `APPROVED_WITH_CHANGES`
- `REJECTED`

For workout timing on non-workout recipes, `NOT_APPLICABLE` is allowed.

For final nutrition status, use only:

- `PENDING`
- `APPROVED`
- `CHANGES_REQUIRED`
- `REJECTED`

Do not pre-approve a recipe because ingredient metadata exists. Recipe approval must be explicit.

## Allergen Separation

Ingredient allergen review is a separate workflow. Do not mark a recipe allergy-safe from this review pack. Do not infer unknown granular allergens as false. Do not make cross-contact claims.

## Clinical Separation

Clinical validation is a separate later gate. Do not validate pathology, disease, medication, pregnancy, pediatric, renal, hepatic, eating-disorder, or other clinical policies in this file.
