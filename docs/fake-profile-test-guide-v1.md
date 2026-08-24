# DUBI Fake Profile Test Guide V1

This guide describes how the fake profile pack in `data/test-profiles/fake-profiles-v1.json` should be used for future meal-plan engine validation.

The profiles are deterministic fictional test inputs only. They are not real user data, and they must not be used to generate or save production plans.

## Current Gate Status

- Recipe Architecture v1.0 is frozen.
- Controlled draft corpus contains 130 recipes.
- Clean Ingredient Whitelist V1 is frozen.
- Professional nutrition review is pending externally.
- Allergen review is pending externally.
- Clinical and safety gates are not complete.
- Runtime cutover has not happened.

The 130 draft recipes are not runtime-ready until the required professional, allergen, clinical and import gates are complete.

## Future Plan-Generation Assertions

Future tests should validate the following areas for each fake profile.

### A. Calorie Adherence

Generated daily energy should remain near `target_kcal` within the policy tolerance defined by the meal-plan engine test suite.

### B. Protein Adherence

Protein should be prioritized against `target_macros.protein_g`, especially for fat-loss, recomposition, lean-gain and high-protein scenarios.

### C. Minimum Fat Target

Fat should not be driven below the minimum policy threshold while trying to satisfy protein and carbohydrate targets.

### D. Carbohydrate Remainder

After protein and fat constraints are satisfied, carbohydrate allocation should absorb the remaining kcal target without hard-coded workout carbohydrate rules.

### E. Meal-Count Compliance

Generated plans must respect `meal_count` and never exceed 6 total eating events.

### F. Meal-Time Compliance

Generated meals should align with `meal_schedule`, including morning, afternoon, evening and late-workout contexts.

### G. Pre/Post-Workout Logic

Tests should verify:

- no workout produces no forced workout meals;
- pre-workout may replace a snack;
- post-workout may be a full meal;
- dinner may serve as pre-workout only if completed at least 2 hours before training;
- if workout timing is closer, a light pre-workout structure should be used instead;
- a normal full meal eaten within about 1-2 hours after training may count as the post-workout meal;
- no fixed 90 g pre-workout carbohydrate rule is assumed;
- no automatic 1 g/kg post-workout carbohydrate rule is assumed.

### H. Recipe Eligibility

Future tests should ensure recipe eligibility respects meal type, dietary style, timing context, kitchen time, equipment and budget constraints where supported.

### I. Clean Ingredient And Validated Recipe Gates

When runtime gates are active, plans must use only ingredients and recipes that pass the relevant clean ingredient, professional nutrition, allergen and clinical validation gates.

Until those gates are complete, tests must not claim draft recipes are production-safe.

### J. Daily And Weekly Variety

Plans should avoid monotony inside a day and across a week while still satisfying nutrition and timing constraints.

### K. Recipe Weekly Frequency

No recipe should be used more than twice per week unless a future policy explicitly allows it.

### L. Minimum Distance Between Repeated Recipes

Repeated recipes should have at least a 3-day distance unless no valid alternative exists and the engine reports a controlled exception.

### M. No Silent Fallback To Invented Combinations

The engine must not silently fall back to invented ingredient combinations when a valid recipe/configuration cannot be found.

### N. Controlled Failure

If no valid configuration exists for a profile, the engine should fail in a controlled, explainable way rather than producing an invalid plan.

## Expected Use

1. Load the fake profile pack.
2. Validate profile schema and macro coherence.
3. Run future non-production plan generation against one profile at a time.
4. Compare generated behavior against each profile's `expected_plan_behavior`.
5. Do not save generated plans to `daily_plans`.
6. Do not use these profiles as real user data.

## Coverage Summary

The pack covers:

- rest day;
- morning workout;
- afternoon workout;
- evening workout;
- late workout;
- vegetarian profile;
- pescatarian profiles;
- high-calorie target;
- lower-calorie target;
- 5-6 meal profiles;
- very limited breakfast preparation time;
- endurance-oriented training;
- resistance training.
