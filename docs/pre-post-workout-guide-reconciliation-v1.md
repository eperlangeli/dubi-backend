# DUBI Pre/Post Workout Guide Reconciliation v1

Status: REVIEW_ONLY  
Phase: 2E-A  
Created: 2026-08-25  
Source type: official professional nutritionist input  
Source identity: PRE & POST WORKOUT - Guida alimentare e logica decisionale per un'app di nutrizione assistita dall'AI

This document reconciles the official professional pre/post workout guide against the current DUBI codebase, schemas, fake profiles, and draft recipe corpus. It is not an implementation file and does not authorize DB writes, recipe imports, runtime behavior changes, clinical automation, or modifications to the frozen Recipe Architecture v1.0.

## Scope and Non-Goals

In scope:

- Capture the minimum workout decision inputs required by the professional guide.
- Capture pre-workout and post-workout decision logic.
- Reconcile sport groups, sport modifiers, carbohydrate need scoring, protein context, caffeine, hydration, sodium, allergy gates, and clinical gates.
- Audit the current implementation and the current pre/post draft corpus for readiness.
- Define blockers, future tests, and safe implementation order.

Out of scope:

- No schema migration.
- No Supabase write.
- No route, meal engine, onboarding, harness, fake profile, or recipe mutation.
- No definitive import.
- No clinical automation.
- No manual classification of the 30 workout recipes.

## Evidence Inspected

Primary local evidence:

- `config/workout-nutrition.js`
- `services/mealEngine.js`
- `supabase-schema.sql`
- `routes/onboarding.js`
- `routes/training.js`
- `routes/plan.js`
- `routes/ai-engine.js`
- `services/daily-adaptation.js`
- `data/test-profiles/fake-profiles-v1.json`
- `data/recipe-drafts/pilot-01.json` through `data/recipe-drafts/pilot-07.json`
- `data/review-packs/recipe-nutrition-review-v1.csv`
- `docs/nutritionist-review-reconciliation-v1.md`

Observed current workout implementation:

- `config/workout-nutrition.js` defines time slots `morning_fasted`, `afternoon`, `evening`, and `unset`.
- Pre-workout snacks are currently modeled as rapid carbohydrate snacks with static timing windows and low-fat/no-protein constraints.
- Afternoon/evening main pre-workout meal targets currently include `targetCarbsG: 90`, protein `30-40g`, and fat `10g`.
- Post-workout targets currently include `targetCarbsGPerKg: 1` and protein fixed at `25g` across workout time slots.
- Sport modifiers currently use generic groups: `endurance`, `team_sport`, `strength`, `low_intensity`, `mixed`, `none`.
- The meal engine can resolve a workout context from time slot and sport group and applies workout block targets to generated plans.
- The frozen DUBI meal-count rule remains important: pre/post workout can replace snack/meal slots and must not automatically increase the eating-event count.

## Required Decision Inputs

| Professional input | Required bands or semantics | Current source | Status | Reconciliation note |
| --- | --- | --- | --- | --- |
| Time since last meal | `<1h`, `1-2h`, `2-4h`, `>4h` | Fake profile `meal_schedule`; generated meal timing context may be inferable | SEMANTIC_MAPPING_REQUIRED | No explicit persisted field. Can be derived only when meal schedule and workout start time are available. |
| Session duration | `<45 min`, `45-75 min`, `75-120 min`, `>120 min` | `user_onboarding.workout_duration`; fake profile `training.duration_min`; `training_confirmations.detected_duration_min` | PARTIAL | Duration exists as text band or detected minutes, but professional bands are not implemented consistently. |
| Intensity/type | `easy`, `moderate`, `intense`, `competition` | `workout_intensity`; fake profile `training.intensity`; training status; sport group | PARTIAL | `competition` is not a first-class intensity class. Needs mapping from competition sport/date or explicit user input. |
| Body weight | kg | `user_onboarding.weight`; fake profile `weight_kg` | AVAILABLE | Needed for contextual carb/protein ranges. |
| Next session | `<4h`, `4-12h`, `>12h` | No direct field found | NOT_AVAILABLE | Weekly workout days do not provide a deterministic next-session recovery window. |
| Goal | `performance`, `maintenance`, `mass gain`, `fat loss` | `goal`; fake profile goal values | SEMANTIC_MAPPING_REQUIRED | Current values include app-specific labels such as `lean_gain`; needs canonical mapping. |
| Dietary preferences | Diet style and food preferences | `diet`, `diet_intensity`, fake profile `dietary_style`, preferences | PARTIAL | Enough for broad preference filtering, not enough for workout-specific suitability. |
| Allergies/intolerances | Allergy and intolerance constraints | `allergies` text; ingredient allergen/pathology flags; fake profile arrays | PARTIAL | Current data supports some filtering but product/cross-contact evidence and clinical contexts remain unresolved. |
| GI tolerance | sensitivity, fiber/volume/liquid preference | No explicit field found | NOT_AVAILABLE | Needed for low-fiber, low-volume, or liquid pre-workout choices. |
| Sweating/heat/salt losses | sweat level, heat, salt loss, rehydration context | `detected_strain`, `detected_active_kcal`, recipe `sodium_level` | PARTIAL / NOT_AVAILABLE | Sodium level exists at recipe level, but no sweat/heat/fluid/salt-loss decision model exists. |

Minimum implementation-ready input set for healthy adults:

- Training day and start time or time slot.
- Last planned meal time or derived time since last meal.
- Session duration band.
- Intensity band.
- Body weight.
- Goal mapping.
- Sport group mapping.
- Allergy/clinical hard-gate status.

Inputs that block full professional parity:

- Next-session timing.
- GI tolerance.
- Sweat/heat/salt-loss context.
- Caffeine contraindication and sleep context.
- Product-level allergen/cross-contact evidence.

## Pre-Workout Decision Tree

Professional rules to preserve:

- Easy sessions under roughly `45-60 min` do not require a mandatory snack when an adequate meal was eaten within about `3h`.
- Intense sessions or sessions longer than roughly `60-75 min`, especially when the last meal was more than `3-4h` ago, may need a carbohydrate-focused snack with light protein only when timing and tolerance support it.
- `2-4h` before exercise can support a fuller pre-workout meal.
- `30-90 min` before exercise should favor smaller, digestible, lower-fat and lower-fiber intake when fueling is needed.
- Morning sessions within about `60 min` of waking can use an optional light snack and breakfast after, instead of forcing a full pre-workout meal.
- GI sensitivity should lower fiber, lower volume, and optionally use liquid or semi-liquid choices.
- Pre-workout slots must be allowed to replace snack/meal slots. They must not automatically increase daily meal count.

Current alignment:

- `morning_fasted` currently uses a `0-60 min` pre-workout window and a light rapid-carb pattern.
- `afternoon` and `evening` currently use a `45-60 min` pre-workout snack window.
- The meal engine has workout block targets and low-fat near-workout rules.
- The harness/fake-profile design already expects pre/post replacement rather than automatic extra meals.

Current gaps and conflicts:

- No explicit `<1h`, `1-2h`, `2-4h`, `>4h` decision tree exists.
- No explicit "adequate meal within about 3h means no snack required" rule exists.
- Static pre-workout snack structures can over-prescribe in easy/short sessions.
- `mainPreMealTargets.targetCarbsG: 90` is too universal for the professional guide.
- Protein is currently zeroed in near-workout snacks, which is valid for some immediate low-GI-tolerance contexts but too rigid as a global rule.

Pre-workout status: PARTIALLY_IMPLEMENTED / PENDING_PROFESSIONAL_THRESHOLD / ARCHITECTURE_CHANGE_REQUEST_REQUIRED for persisted classification.

## Pre-Workout Carbohydrate Ranges

The professional guide allows carbohydrate logic across the broad range of `1-4g/kg` for a meal several hours before exercise, but this must not become a universal rule.

Deterministic now:

- DUBI can compute body-weight-relative ranges when body weight exists.
- DUBI can derive or map session duration/intensity in some contexts.
- DUBI can identify existing pre-workout recipes as carb-forward from recipe type and ingredient roles.

Requires professional threshold confirmation:

- Exact g/kg thresholds per sport group, intensity, duration, time to exercise, daily carb target, previous meal, goal, and GI tolerance.
- How to combine daily carbohydrate target with workout-specific portion guidance.
- Whether current `20-30g` snack range remains valid for any specific timing/intensity branch.
- Whether any fixed `90g` main pre-meal target should remain, and under which branch.

Required guardrail:

- No universal `90g` pre-workout carbohydrate target.
- No universal `1-4g/kg` pre-workout prescription independent of context.

## Post-Workout Decision Tree

Professional rules to preserve:

- Standard recovery can be a normal complete meal with protein and carbohydrate appropriate to workload.
- A full meal within `1-2h` can serve as recovery; a shake or extra snack is not mandatory.
- A second session within about `4h` creates urgent recovery needs.
- Short/light sessions can use the next normal meal.
- Long/intense sessions raise carbohydrate relevance and still require protein.
- Evening training can use a digestible meal, snack, or adjusted meal depending on time and appetite; there is no carb-at-night ban.
- Fat-loss goals should preserve recovery and protein while adjusting energy through planned portions.
- Wearable calories must not be exactly compensated with automatic extra food.

Current alignment:

- Post-workout meals are modeled as recovery meals containing protein and carbohydrate.
- Current recipe drafts include post-workout complete meals with protein-primary and carb-primary components.
- Daily target calories and macro targets remain part of plan generation.

Current gaps and conflicts:

- `targetCarbsGPerKg: 1` is applied broadly across all configured workout time slots.
- Fixed `25g` post-workout protein does not account for body weight, total daily protein, previous/next meal, sport type, or session type.
- No `next session within <4h` urgent recovery branch exists.
- No standard vs rapid recovery vs full-meal recovery vs late-evening recovery classification exists.
- No explicit "normal next meal is sufficient for short/light sessions" branch exists.

Post-workout status: PARTIALLY_IMPLEMENTED / PENDING_PROFESSIONAL_THRESHOLD.

## Rapid Recovery Carbohydrate Rule

Professional rule:

- Approximately `1.0-1.2g/kg/h` in early recovery is relevant when another session occurs within about `4h`.
- This is not the default post-workout rule.

Current conflict:

- `config/workout-nutrition.js` uses `targetCarbsGPerKg: 1` for post-workout targets in `morning_fasted`, `afternoon`, `evening`, and `unset`.
- `services/mealEngine.js` turns this value into a body-weight-based carb target when user weight is available.

Required correction path:

- Replace broad default `1g/kg` post-workout logic with a context-specific branch.
- Only activate rapid recovery when next-session timing and session workload justify it.
- If next-session timing is unknown, do not assume urgent recovery.

Status: NOT_IMPLEMENTED / CURRENT_CONFLICT.

## Protein Logic

Professional rule:

- Practical post-workout protein may often land around `0.25-0.40g/kg`, commonly `20-40g`, but DUBI must prioritize daily protein and energy context.
- DUBI must not enforce both a g/kg rule and a fixed gram range blindly.

Current implementation:

- Daily protein target exists in plan generation.
- Workout post target is currently fixed at `25g`.
- Main pre-workout meal target currently uses `30-40g`.
- Sport modifiers can adjust protein for strength group, but the post target itself remains context-limited.

Required reconciliation:

- Derive protein suggestions from body weight, daily protein target, meal distribution, previous/next meal, session type, and sport group.
- Confirm exact thresholds with professional review before runtime enforcement.
- Preserve daily protein priority over isolated workout-window optimization.

Status: PARTIALLY_IMPLEMENTED / PENDING_PROFESSIONAL_THRESHOLD.

## Sport Groups

Professional grouping:

| Professional group | Sports listed in guide |
| --- | --- |
| ENDURANCE | running, cycling, swimming, triathlon, rowing, canoe/kayak, cross-country skiing |
| TEAM_INTERMITTENT | football, basketball, volleyball, tennis, padel, rugby, hockey, handball, baseball, alpine skiing, surfing, fencing |
| STRENGTH_POWER_COMBAT | gym, CrossFit, powerlifting, climbing, boxing, martial arts, wrestling, judo, MMA, gymnastics, sprint |
| WELLNESS_TECHNICAL | yoga, pilates, golf, archery, equestrian, dance |

Current DUBI values observed:

- Config groups: `endurance`, `team_sport`, `strength`, `low_intensity`, `mixed`, `none`.
- Fake profile examples: `none`, `resistance_training`, `functional_training`, `pilates_strength`, `hypertrophy_training`, `mixed_training`, `endurance_running`.
- Schema stores `sport`, `sports`, `competition_sport`, and `training_sport` as text-like values rather than a strict enum.

Reconciliation:

| Current value | Professional mapping | Status |
| --- | --- | --- |
| `endurance` / `endurance_running` | ENDURANCE / running | SEMANTIC_MAPPING_REQUIRED |
| `team_sport` | TEAM_INTERMITTENT | SEMANTIC_MAPPING_REQUIRED |
| `strength`, `resistance_training`, `hypertrophy_training` | STRENGTH_POWER_COMBAT | SEMANTIC_MAPPING_REQUIRED |
| `functional_training` | likely STRENGTH_POWER_COMBAT if CrossFit-like, otherwise mixed | PROFESSIONAL_CONFIRMATION_REQUIRED |
| `pilates_strength` | WELLNESS_TECHNICAL or strength hybrid | PROFESSIONAL_CONFIRMATION_REQUIRED |
| `low_intensity` | likely WELLNESS_TECHNICAL branch, but not sport-specific | SEMANTIC_MAPPING_REQUIRED |
| `mixed_training`, `mixed` | multi-group or user-specific | SEMANTIC_MAPPING_REQUIRED |
| `none` | no sport modifier | IMPLEMENTED |

Required guardrail:

- Do not rename stored sport values or current enums silently.
- Add a mapping layer from current DUBI values to professional groups.

Status: PARTIALLY_IMPLEMENTED.

## Sport-Specific Modifiers

Professional modifiers to capture:

- Running and triathlon: higher GI-sensitivity relevance, especially before hard/long sessions.
- Cycling and cross-country skiing: high energy and carbohydrate relevance in long sessions.
- Swimming: early-morning light or liquid options may be useful.
- Rowing and canoe/kayak: endurance plus power demands.
- Tournaments and repeated matches: between-match timing variability and urgent recovery relevance.
- Strength and powerlifting: daily and distributed protein matter more than forcing a large isolated post-workout dose.
- CrossFit and sprint: higher carbohydrate relevance with high volume/density.
- Climbing: avoid both hunger and excessive fullness.
- Combat sports: no aggressive water cutting or unsafe weight-cut guidance.
- Yoga and pilates: lower volume before inversion/twisting.
- Long dance, golf, and equestrian sessions: may need more fueling than their low-intensity label suggests.

Current implementation:

- Generic carb/protein multipliers exist by broad sport group.
- No sport-specific GI, tournament, water-cutting, inversion/twisting, appetite, heat, or session-density modifiers exist.

Status: PARTIALLY_IMPLEMENTED / PENDING_METADATA / PENDING_CLINICAL_GATE for combat weight-cutting.

## Carbohydrate Need Score

Professional scoring:

- `+1` duration `>75 min`
- `+1` high intensity or competition
- `+1` endurance or intermittent sport
- `+1` fasting or last meal `>4h`
- `+1` second session within `8h`

Interpretation:

- `0-1`: low/moderate carbohydrate need.
- `2-3`: moderate/high carbohydrate need.
- `4-5`: high carbohydrate need.

Reconciliation:

- The score is suitable as a derived decision helper for portion selection.
- It must not replace daily carbohydrate targets.
- It must not directly force extra meals.
- It can fit the frozen architecture if computed at runtime from existing and future context without changing recipe semantics.
- Persisting recipe suitability tags or corpus-level carbohydrate-need tags requires an architecture change request or an approved metadata extension.

Current availability:

| Score component | Current status |
| --- | --- |
| Duration `>75 min` | PARTIAL |
| High intensity/competition | PARTIAL |
| Endurance/intermittent sport | SEMANTIC_MAPPING_REQUIRED |
| Fasting/last meal `>4h` | SEMANTIC_MAPPING_REQUIRED |
| Second session within `8h` | NOT_AVAILABLE |

Status: NOT_IMPLEMENTED / ARCHITECTURE_CHANGE_REQUEST_REQUIRED for persisted metadata.

## Caffeine

Professional requirement:

- Audit caffeine in mg, timing, body-weight dose if used, evening/sleep context, and contraindication gates.
- Caffeine must not be represented only by grams or milliliters of coffee, tea, or matcha.

Current implementation:

- Coffee, green tea, and matcha ingredients exist in drafts and whitelists.
- Pre-workout recipes include espresso or green tea in some cases.
- Existing review already identified caffeine mg as absent.
- No caffeine mg model, timing rule, body-weight dose rule, evening/sleep gate, pregnancy/minor gate, anxiety/cardiovascular gate, medication gate, or user caffeine tolerance field was found.

Status: NOT_IMPLEMENTED / PENDING_METADATA / PENDING_CLINICAL_GATE.

Required guardrail:

- Do not infer caffeine mg from ingredient grams without reviewed source data.
- Do not recommend caffeine automatically.
- Treat caffeine as optional and gated.

## Hydration and Sodium

Professional requirement:

- Consider fluid amount, sweating level, hot conditions, salt losses, sodium, rapid recovery, and rehydration context.

Current implementation:

- Recipes have `sodium_level`.
- Ingredient/source work includes sodium-related data in some pipelines.
- Training confirmation has `detected_strain`, `detected_duration_min`, and `detected_active_kcal`.
- Wearable data has `activity_kcal`, but no explicit sweat rate, heat exposure, fluid intake, or salt-loss field.

Implementation split:

| Area | Status |
| --- | --- |
| Recipe sodium label | PARTIALLY_IMPLEMENTED |
| Sodium mg complete recipe metadata | PENDING_METADATA |
| Sweat level input | NOT_AVAILABLE |
| Heat/humidity input | NOT_AVAILABLE |
| Fluid amount recommendation | PENDING_PROFESSIONAL_THRESHOLD |
| Rehydration after high sweat loss | PENDING_PROFESSIONAL_THRESHOLD |
| Clinical sodium restrictions | PENDING_CLINICAL_GATE |

Status: PARTIALLY_IMPLEMENTED / PENDING_METADATA / PENDING_PROFESSIONAL_THRESHOLD.

## Allergy and Clinical Gates

This workout reconciliation must preserve the broader nutritionist review rather than duplicate or weaken it.

General gates to preserve:

- EU14 allergens must be handled explicitly when ingredient/product evidence supports them.
- Milk allergy is not the same as lactose intolerance.
- Wheat/gluten is not the same as celiac suitability.
- Fish, crustaceans, and molluscs must remain distinct.
- Cross-contact evidence cannot be invented.
- Celiac suitability requires product-level or certified evidence where relevant.
- Diabetes context does not authorize insulin-dose advice or automatic clinical meal rules.
- GERD needs personalized triggers.
- IBS/FODMAP requires phase/context and cannot be inferred from a universal list.
- Histamine does not have a universal safe/unsafe food list.
- Gout depends on context, frequency, and clinical status.
- Renal disease must not receive automatic meal logic without clinical context.
- Systemic nickel requires a validated personal list and cannot use a universal exclusion list.
- Vegan preference is not a disease or clinical gate.

Workout-specific safety populations:

| Context | Required handling |
| --- | --- |
| Minors | DEDICATED_PATHWAY_REQUIRED |
| Pregnancy | DEDICATED_PATHWAY_REQUIRED |
| Eating disorder history or problematic restriction behavior | BLOCK / PROFESSIONAL_REVIEW_REQUIRED |
| Diabetes | PROFESSIONAL_REVIEW_REQUIRED |
| Kidney or metabolic disease | PROFESSIONAL_REVIEW_REQUIRED |
| Combat-sport weight cutting | BLOCK unsafe dehydration guidance / PROFESSIONAL_REVIEW_REQUIRED |

Status: PARTIALLY_IMPLEMENTED as general filters, PENDING_CLINICAL_GATE for workout-specific automation.

## Anti-Patterns Captured

The workout engine and future implementation must avoid:

- Mandatory 30-minute anabolic window.
- Universal `90g` carbohydrate pre-workout meal.
- Universal `30-40g` protein independent of body weight, daily protein, and meal context.
- Universal fixed `25g` post-workout protein independent of context.
- Universal `1g/kg` post-workout carbohydrate default.
- Automatic separate full pre-workout and post-workout meals on top of the user's meal count.
- Claims that carbohydrate plus fat is inherently harmful or inherently causes fat gain.
- Automatic supplement recommendations.
- Assumption that faster absorption is always better.
- Same fueling strategy for `40 min` yoga and `3h` triathlon.
- Exact compensation of wearable calorie estimates.
- Caffeine prescription without mg, timing, tolerance, sleep, and contraindication context.
- Hydration or sodium prescription without sweat/heat/salt-loss and clinical context.

Current audit:

| Anti-pattern | Current status |
| --- | --- |
| Mandatory anabolic window | No direct implementation found |
| Universal `90g` pre-workout meal | CURRENT_CONFLICT in `mainPreMealTargets` |
| Universal post `1g/kg` carbohydrate | CURRENT_CONFLICT in post-workout config |
| Universal fixed protein | PARTIAL_CONFLICT: fixed `25g` post and `30-40g` main pre targets |
| Automatic extra meals | PARTIAL_RISK: structures include pre/post, but fake-profile policy preserves replacement |
| Carb plus fat myth | CURRENTLY_AVOIDED by science note |
| Supplement automation | No direct implementation found |
| Faster absorption always better | PARTIAL_RISK near-workout rapid-carb defaults |
| Same strategy for all sports | PARTIAL_RISK due broad modifiers |
| Wearable exact kcal compensation | No direct exact-compensation behavior confirmed in inspected code |

## Current Implementation Matrix

| Capability | Current status | Evidence | Required next action |
| --- | --- | --- | --- |
| Workout time slot | IMPLEMENTED | Workout config and meal engine context | Preserve, but add relation-to-meal semantics. |
| Time since last meal | SEMANTIC_MAPPING_REQUIRED | Fake profile meal schedules only | Add derived classifier. |
| Duration bands | PARTIALLY_IMPLEMENTED | Onboarding text, detected duration, fake profile minutes | Normalize to professional bands. |
| Intensity bands | PARTIALLY_IMPLEMENTED | Onboarding and fake profiles | Add `competition` mapping. |
| Body weight | IMPLEMENTED | Schema and fake profiles | Use carefully in contextual logic. |
| Next-session window | NOT_IMPLEMENTED | No direct field found | Add input or derived schedule model before rapid recovery. |
| Goal mapping | SEMANTIC_MAPPING_REQUIRED | App-specific goal values | Map to professional categories. |
| Sport grouping | PARTIALLY_IMPLEMENTED | Generic groups and free text | Add mapping layer. |
| Sport-specific modifiers | NOT_IMPLEMENTED | Only broad multipliers found | Add reviewed modifier rules. |
| Carb need score | NOT_IMPLEMENTED | No score found | Add derived score after threshold review. |
| Pre-workout branch tree | PARTIALLY_IMPLEMENTED | Static slots and snack targets | Replace static defaults with context branches. |
| Post-workout branch tree | PARTIALLY_IMPLEMENTED | Recovery target exists | Add standard/rapid/full-meal/late-evening branches. |
| Rapid recovery | NOT_IMPLEMENTED / CURRENT_CONFLICT | Broad `targetCarbsGPerKg: 1` | Restrict to second-session branch. |
| Protein context | PARTIALLY_IMPLEMENTED | Daily target plus fixed workout target | Reconcile daily and workout protein. |
| Caffeine mg | NOT_IMPLEMENTED | Coffee/tea/matcha as ingredient quantity only | Add reviewed caffeine metadata. |
| Hydration | NOT_IMPLEMENTED | No fluid/sweat/heat model | Add inputs and thresholds. |
| Sodium | PARTIALLY_IMPLEMENTED | Recipe `sodium_level` | Add sodium mg and rehydration context. |
| Allergy gates | PARTIALLY_IMPLEMENTED | Allergen/pathology filters | Preserve, add product-level evidence where needed. |
| Clinical workout gates | PENDING_CLINICAL_GATE | General clinical tags only | Add hard gates and dedicated pathways. |
| Recipe corpus timing suitability | PENDING_METADATA | 15 pre and 15 post drafts | Add reviewed tags only after metadata design approval. |
| Recipe Architecture v1.0 compatibility | ARCHITECTURE_CHANGE_REQUEST_REQUIRED for new persisted fields | Frozen architecture | Use derived runtime helpers until metadata extension is approved. |

## Pre/Post Corpus Readiness

Current count:

- Pre-workout draft recipes: 15.
- Post-workout draft recipes: 15.
- Total pre/post workout draft corpus: 30.

Pre-workout authoring keys:

- `pilot01_pre_workout_cream_of_rice_banana_honey`
- `pilot02_pre_workout_dates_banana_rice_cream`
- `pilot03_pre_workout_oat_banana_honey_bar`
- `pilot03_pre_workout_jasmine_rice_pineapple_cup`
- `pilot03_pre_workout_oat_flour_date_pancake`
- `pilot04_pre_workout_white_rice_banana_honey_cup`
- `pilot04_pre_workout_date_banana_green_tea_plate`
- `pilot04_pre_workout_oat_banana_espresso_bowl`
- `pilot05_pre_workout_basmati_dates_honey_bowl`
- `pilot05_pre_workout_banana_peach_honey_plate`
- `pilot05_pre_workout_jasmine_rice_date_espresso_cup`
- `pilot06_pre_workout_cream_rice_peach_honey_bowl`
- `pilot06_pre_workout_white_rice_apple_cinnamon_bowl`
- `pilot06_pre_workout_dates_orange_green_tea_plate`
- `pilot07_pre_workout_coffee_cream_of_rice_honey_bowl`

Post-workout authoring keys:

- `pilot01_post_workout_chicken_basmati_pineapple_bowl`
- `pilot02_post_workout_turkey_jasmine_mango_bowl`
- `pilot02_post_workout_cod_potato_green_bean_plate`
- `pilot03_post_workout_shrimp_basmati_papaya_bowl`
- `pilot03_post_workout_tofu_jasmine_pineapple_bowl`
- `pilot03_post_workout_egg_potato_spinach_plate`
- `pilot04_post_workout_salmon_white_rice_melon_plate`
- `pilot04_post_workout_beef_jasmine_carrot_bowl`
- `pilot05_post_workout_tuna_jasmine_pineapple_cucumber_bowl`
- `pilot05_post_workout_cod_basmati_carrot_plate`
- `pilot06_post_workout_branzino_quinoa_mango_plate`
- `pilot06_post_workout_tempeh_sweet_potato_pineapple_bowl`
- `pilot06_post_workout_mackerel_couscous_papaya_plate`
- `pilot07_post_workout_egg_white_rice_pineapple_bowl`
- `pilot07_post_workout_chicken_rice_noodle_carrot_bowl`

Deterministic corpus facts now:

- Meal type can identify pre vs post workout.
- Ingredient roles can identify many pre recipes as carbohydrate-forward.
- Post recipes generally include protein-primary plus carb-primary structures.
- Espresso and green tea presence can be detected by ingredient identity.
- Sodium label exists only as coarse recipe metadata, not workout-specific hydration logic.

Not safely classifiable yet:

- `30-60 min`, `1-2h`, or `2-4h` pre-workout suitability.
- Standard post recovery vs rapid recovery.
- Full-meal recovery vs snack recovery.
- Late-evening recovery suitability.
- Sport-group suitability.
- GI sensitivity suitability.
- Carbohydrate need score level.
- Caffeine mg or body-weight caffeine dose.
- Hydration/sodium rehydration suitability.

Corpus status: AUDITED / PENDING_METADATA / DO_NOT_ASSIGN_CLASSIFICATIONS_YET.

## Test Plan for Future Implementation

Core healthy-adult tests:

- Easy `<45-60 min` session plus meal within about `3h` does not force a pre-workout snack.
- Intense or `>60-75 min` session plus last meal `>3-4h` can select a carb-focused pre option.
- `2-4h` pre-workout branch can select a fuller meal without also adding an extra snack.
- `30-90 min` pre-workout branch keeps low fat, lower fiber, and smaller volume where appropriate.
- Morning fasted branch allows optional light snack and breakfast after.
- Post short/light session can use normal next meal.
- Long/intense post branch raises carbohydrate relevance without defaulting to rapid recovery.
- Second session `<4h` activates rapid recovery branch.
- Fat-loss goal preserves protein/recovery while adjusting total energy by planned portions.
- Wearable calories are not exactly compensated.
- Carb need score components produce expected `0-5` scores.
- Sport mapping does not rename stored user values.
- Pre/post replacement preserves meal-count ceilings.

Metadata tests:

- Caffeine ingredient quantity alone does not satisfy caffeine mg requirement.
- Sodium level alone does not satisfy rehydration recommendation requirement.
- Recipes without reviewed workout timing metadata cannot be selected by timing-specific classifiers.
- Product-level allergen/celiac evidence is required before allergy-sensitive workout selection.

Clinical/safety tests:

- Minors route to dedicated pathway.
- Pregnancy routes to dedicated pathway.
- Eating disorder/problematic restriction context blocks automated fueling advice.
- Diabetes does not receive insulin-dose or automated rapid-carb correction advice.
- Renal/metabolic disease routes to professional review.
- Combat-sport weight-cut context blocks dehydration guidance.

Regression tests:

- No universal `90g` pre-workout carb rule.
- No universal `1g/kg` post-workout carb rule.
- No universal fixed `25g` or `30-40g` protein rule independent of context.
- No mandatory anabolic window wording.
- No automatic supplement recommendation.
- No carb-at-night ban.

## Blockers

Blocking items before full professional parity:

- Professional threshold confirmation for pre-workout carbohydrate ranges by branch.
- Professional threshold confirmation for post-workout protein and carbohydrate branch logic.
- Replacement of broad post-workout `targetCarbsGPerKg: 1` default.
- Removal or gating of universal `90g` main pre-workout carbohydrate target.
- Explicit next-session window input or derivation.
- GI tolerance input.
- Sport value mapping layer.
- Caffeine mg metadata and contraindication gates.
- Hydration, heat, sweat, fluid, sodium, and rehydration metadata.
- Product-level allergen/cross-contact/celiac evidence.
- Clinical hard-gate design for special populations.
- Approved architecture path for persisted workout recipe metadata.

## Implementation Order

CORE_HEALTHY_ADULT_WORKOUT_ENGINE:

1. Add a design note or architecture change request for a derived workout context model that preserves Recipe Architecture v1.0.
2. Implement a read-only classifier for time since last meal, duration band, intensity band, sport group, goal group, and available next-session context.
3. Add carbohydrate need score as a derived helper, not as a replacement for daily targets.
4. Replace broad default `1g/kg` post-workout carbohydrate behavior with branch-specific logic after professional threshold confirmation.
5. Replace or gate universal `90g` main pre-workout carbohydrate target.
6. Add standard post, rapid recovery, full-meal recovery, and late-evening recovery branches.
7. Preserve meal-count replacement semantics and max-meal ceilings.
8. Add deterministic tests for the healthy adult branches.

ALLERGY_DEPENDENT:

1. Extend reviewed metadata for EU14 allergens, milk vs lactose, wheat/gluten/celiac, fish/crustaceans/molluscs, and cross-contact.
2. Add product-level celiac/cross-contact evidence requirements where needed.
3. Gate workout recipe selection on reviewed allergy evidence.
4. Add regression tests proving unreviewed allergy-sensitive selections are blocked.

CLINICAL_DEPENDENT:

1. Define hard gates and dedicated pathways for minors, pregnancy, eating disorder/problematic restriction behavior, diabetes, renal/metabolic disease, and combat-sport weight cutting.
2. Preserve non-automation for diabetes insulin dosing, renal disease, histamine, IBS/FODMAP phase, gout, GERD, and systemic nickel unless professional pathway data exists.
3. Add tests proving clinical contexts do not receive generic workout fueling automation.

## Review Conclusion

The professional guide is ingested and reconciled as a read-only checkpoint. DUBI currently has a partial workout nutrition engine, but the current implementation is more static than the official guide allows. The most important conflicts are the broad post-workout `1g/kg` carbohydrate target and the universal-looking `90g` main pre-workout carbohydrate target. The current 15 pre-workout and 15 post-workout draft recipes are present and auditable, but they are not yet ready for deterministic timing, sport, GI, caffeine, hydration, sodium, or rapid-recovery classification without additional reviewed metadata and threshold decisions.

No DB changes, runtime changes, imports, fake-profile changes, harness changes, or recipe-data changes are authorized by this document.
