# DUBI Nutritionist Review Reconciliation v1

Date: 2026-08-25  
Repository scope: `dubi-backend-git`  
Official professional source: `DUBI | Revisione tecnica della libreria ricette`  
Official source date: 2026-08-24  
Corpus reviewed: 130 controlled draft recipes

## Source And Professional Verdict

The official nutritionist review has now been supplied through the Phase 2D-A2 authoritative handoff. This corrects the earlier source-access limitation: professional requirements are considered ingested for this reconciliation.

Professional verdict captured: the recipe library is a useful controlled base, but it is not ready as a clinically personalized production library. The 130 recipes are controlled drafts pending correction, validation, and release gates. This does not mean all recipes are approved, allergen-safe, clinically validated, or production-ready.

No database writes, migrations, runtime edits, recipe edits, ingredient edits, fake-profile edits, review-pack edits, staging, commits, or pushes were performed.

## Professional Requirement Register

| Area | Official requirement | Current classification |
|---|---|---|
| Seitan | Block the three anomalous recipes; verify ingredient ID, brand/source, per-100g basis, state/form; recalculate afterward. | PARTIALLY_IMPLEMENTED / BLOCKER_BEFORE_DEFINITIVE_IMPORT |
| EU allergens | Manage all 14 EU allergens and keep molluscs/crustaceans, milk/lactose, celiac/wheat allergy distinct. | PARTIALLY_IMPLEMENTED |
| Cross-contact/product evidence | Support `contains_allergen`, `may_contain_allergen`, `cross_contact_risk`, `allergen_source_ingredient`, `label_verified_at`, `product_brand`. | NOT_IMPLEMENTED |
| Ingredient state/basis/yield | Distinguish raw, cooked, drained, edible portion, cooking yield, preserved/ready-to-eat. No inferred universal yield. | PARTIALLY_IMPLEMENTED |
| Quantity realism | Reduce unrealistic 5g quantities for spices/aromatics such as black pepper, cinnamon, matcha, turmeric, oregano, chili. | NOT_IMPLEMENTED in data |
| Product/state semantics | Replace generic raw semantics for yogurt, milk and fruit; clarify ricotta as cooked; standardize tuna/sardines cooked vs preserved. | PARTIALLY_IMPLEMENTED |
| Scaling | Reject uniform multiplication; support component roles and caps; recalculate kcal/macros and later allergen/clinical compatibility after scaling. | ARCHITECTURE_CHANGE_REQUEST_REQUIRED |
| Preparation | Recipes must be executable with servings, final weight, liquids, method, temperature where relevant, order, consistency, storage, reheating, food safety, cross-contact prevention. | PARTIALLY_IMPLEMENTED |
| Pre-workout | Support `<60 min`, `1-2h`, `2-4h`; consider sport, duration, GI tolerance; track caffeine mg and later contraindication contexts. | PARTIALLY_IMPLEMENTED |
| Post-workout | Consider body weight, previous meal, intensity, duration, sport, daily intake, next session; avoid universal 1g/kg rule. | PARTIALLY_IMPLEMENTED |
| Clinical matrix | Replace yes/no with `COMPATIBILE`, `CON_MODIFICA`, `CONDIZIONALE`, `ESCLUSA`, `VALUTAZIONE_CLINICA` plus context. | ARCHITECTURE_CHANGE_REQUEST_REQUIRED |
| Extended nutrients | Future support for sugars, available carbs, saturated fat, sodium, potassium, phosphorus, calcium, iron, B12, D, caffeine mg, fluids. | PARTIALLY_IMPLEMENTED |
| Release validation | Require anomaly-free nutrition, allergen/product linkage, clinical rationale, realistic scaled portions, reproducible prep, workout timing/type, automatic checks, named review, regression tests, pilot, limited release, monitoring/disable ability. | PARTIALLY_IMPLEMENTED |

## Reconciliation Against Current System

| Requirement | Actual current implementation | Evidence | Status | Remaining gap | Blocker before import | Blocker before production |
|---|---|---|---|---|---|---|
| Official source ingestion | Authoritative requirements supplied in Phase 2D-A2 handoff and captured here. | Handoff plus this document | IMPLEMENTED | Direct Word binary is still not stored in repo, but requirements are ingested. | NO | NO |
| Seitan recipe block | Three recipes found by authoring key; no explicit import block exists yet. | `data/recipe-drafts/pilot-03.json`, `pilot-06.json`, `pilot-07.json`; review pack | PARTIALLY_IMPLEMENTED | Add explicit block register/flag and verify source/basis/form. | YES | YES |
| Ingredient nutrition provenance | Ingredient schema has per-100g macros and provenance fields; local `.env` lacks `DATABASE_URL`, so live seitan row could not be selected. | `supabase-schema.sql`; `.env`; local SELECT attempt | PARTIALLY_IMPLEMENTED | Need current DB extract/query for ingredient ID 16 and contribution trace. | YES for seitan recipes | YES |
| EU14 schema | Gluten, crustaceans, eggs, fish, peanuts, soy, milk/dairy, tree nuts, celery, mustard, sesame, sulphites, lupin, mollusks represented. | `supabase-schema.sql`; `sql/recipe-phase1gb-ingredient-safety-provenance.sql` | IMPLEMENTED for schema | Reviewed data incomplete. | NO | YES |
| Cross-contact/product labels | No fields/tables found for `may_contain_allergen`, `cross_contact_risk`, `label_verified_at`, `product_brand`, `allergen_source_ingredient`. | schema search | NOT_IMPLEMENTED | Add product/label/cross-contact evidence layer. | NO, except where needed to unblock celiac/allergen-safe claims | YES |
| Celiac vs wheat allergy | `allergen_gluten` and `ok_celiac` exist; wheat allergy is not explicit. | `supabase-schema.sql` | PARTIALLY_IMPLEMENTED | Add wheat allergy distinction if required by product policy. | NO | YES |
| Oats for celiac | Oats exist as ingredients, but no certified gluten-free product/supply flag found. | draft/schema search | NOT_IMPLEMENTED | Add certified-GF/product evidence before celiac-safe oat flows. | NO unless importing celiac-safe flows | YES |
| State/basis/yield | `measurement_basis` supports raw/cooked/preserved; yield conversions exist; edible portion exists. | `sql/recipe-phase1c-recipe-ingredients.sql`; `sql/recipe-phase1gc-yield-conversions.sql`; `sql/recipe-phase1gd-edible-portion-incompatibilities.sql` | PARTIALLY_IMPLEMENTED | Drained and ready-to-eat are not first-class measurement-basis values; population/review incomplete. | NO, except unresolved seitan/source rows | YES |
| Specific state cleanup | Tuna and sardines were remediated to cooked/canned-natural; ricotta appears cooked in drafts; many yogurts/milk/fruit remain raw. | `sql/recipe-phase1ge-ingredient-metadata-remediation.sql`; `data/recipe-drafts/*.json` | PARTIALLY_IMPLEMENTED | Clarify yogurt, milk, fruit, ricotta semantics and preserved/drained cases. | NO | YES |
| 5g spices/aromatics | Drafts contain 5g pepper/cinnamon/matcha/turmeric/oregano/chili style quantities. | `data/recipe-drafts/*.json` | NOT_IMPLEMENTED | Reduce/cap spice quantities through controlled recipe/data task. | NO | YES |
| Component scaling | Current harness applies uniform day scaling and explicitly warns `LOCAL_UNIFORM_RECIPE_SCALING_ONLY`; draft roles cover many components. | `scripts/lib/draft-recipe-harness.js`; `data/recipe-drafts/*.json` | ARCHITECTURE_CHANGE_REQUEST_REQUIRED | Implement component-role scaling, caps, discrete portions, post-scaling recalculation. | NO | YES |
| Recipe preparations | All 130 drafts have 3-5 steps, prep time, cook time; many lack final weight, storage, reheating, food-safety, consistency, cross-contact prevention. | JSON audit of 130 drafts | PARTIALLY_IMPLEMENTED | Make recipes fully executable and reproducible. | NO | YES |
| Technical combinations | Chicken-rice-pineapple, shrimp-rice-papaya, turkey-rice-mango style combinations exist in draft families and need culinary logic/sauce/aromatics review. | `data/recipe-drafts/*.json` | PARTIALLY_IMPLEMENTED | Add culinary rationale/prep details in later recipe task. | NO | YES |
| Pre-workout timing | Current config supports 0-60 and 45-60 windows; harness recognizes 2h+ full meal relation. No explicit `<60`, `1-2h`, `2-4h` classes. | `config/workout-nutrition.js`; `scripts/lib/draft-recipe-harness.js` | PARTIALLY_IMPLEMENTED | Add timing-band model with sport/duration/GI tolerance. | NO | YES |
| Caffeine | Coffee, matcha, tea ingredients exist; no caffeine mg/timing/contraindication model found. | `data/ingredient-whitelists/clean-v1.json`; schema/config search | NOT_IMPLEMENTED | Add caffeine mg and contextual warnings later. | NO | YES |
| Post-workout logic | Protein target and sport modifiers exist; current config still encodes `targetCarbsGPerKg: 1`. | `config/workout-nutrition.js` | PARTIALLY_IMPLEMENTED | Replace universal rule with context-aware session/body-weight/daily-intake logic. | NO | YES |
| Clinical matrix | `ok_*` booleans exist; recipe/configuration clinical review fields exist; no five-state matrix exists. | `supabase-schema.sql`; `sql/recipe-phase1b-*`; `sql/recipe-phase1f-configurations.sql` | ARCHITECTURE_CHANGE_REQUEST_REQUIRED | Add matrix state, reason, allowed range, substitution, phase/stage, therapy/labs, source, reviewer, rule version. | NO | YES |
| Extended nutrients | `micronutrients JSONB`, recipe `sodium_level`, `added_sugar_level`, CIQUAL/CREA clients parse sodium/zinc/B12; no complete structured nutrient coverage or caffeine/fluids. | `supabase-schema.sql`; `scripts/ciqual-client.js`; `scripts/crea-client.js` | PARTIALLY_IMPLEMENTED | Extend reviewed nutrient model/population. | NO | YES |
| Version/reviewer/date | Recipe architecture has version/reviewer/date fields; ingredient source version/date exists. | `sql/recipe-phase1b-*`; `sql/recipe-phase1f-configurations.sql`; `sql/recipe-phase1gb-ingredient-safety-provenance.sql` | IMPLEMENTED for schema | Populate with actual professional review rows. | NO | YES |
| Controlled validation/release | Draft docs and harness explicitly mark gates incomplete; fake-profile harness and controlled failure exist. | `docs/fake-profile-test-guide-v1.md`; `scripts/lib/draft-recipe-harness.js` | PARTIALLY_IMPLEMENTED | Run edge/regression testing, pilot, limited release, monitoring, disable path. | NO | YES |

## Seitan Blocker Audit

Official nutritionist blocker: the following recipes must be blocked before definitive import until ingredient ID, source/brand, per-100g basis, state/form are verified and recipes recalculated.

| Recipe | authoring_key | seitan quantity_g | recipe kcal | protein_g | carbs_g | fat_g |
|---|---|---:|---:|---:|---:|---:|
| Seitan rice pasta pak choi bowl | `pilot03_lunch_dinner_seitan_rice_pasta_pak_choi_bowl` | 100 | 798.4 | 82.8 | 89.2 | 12.9 |
| Seitan quinoa pepper bowl | `pilot06_lunch_dinner_seitan_quinoa_pepper_bowl` | 140 | 925.1 | 117.7 | 78.0 | 17.2 |
| Seitan buckwheat arugula salad | `pilot07_lunch_dinner_seitan_buckwheat_arugula_salad` | 130 | 869.1 | 109.8 | 79.8 | 15.7 |

Ingredient identity:

| Field | Current evidence |
|---|---|
| ingredient_id | 16 in all three recipes |
| canonical name | Seitan |
| raw_or_cooked | `raw` in scaling metadata snapshot |
| freshness/product form | `fresh` in scaling metadata snapshot |
| serving_min_g / max / step | 50g / 150g / 10g |
| nutrition source/version/date | Not available locally |
| brand/source | Not available locally |
| per-100g basis | Not available locally |
| verified/reviewed timestamp | Not available locally |

Root cause remains evidence-limited. The visible quantities are plausible and within current serving bounds. The shared abnormal pattern strongly points to ingredient ID 16 nutrition values or their basis, but the live DB row cannot be selected because `.env` has no `DATABASE_URL`, and no local ingredient reference JSON contains seitan. Therefore:

SEITAN_SOURCE_VERIFIED: NO  
SEITAN_RECIPES_REQUIRE_BLOCK: YES  
Recommended implementation method: add a controlled definitive-import block keyed by the three `authoring_key` values with reason `SEITAN_SOURCE_UNRESOLVED`, then verify ingredient ID 16 and recalculate before unblocking.

## Allergen Reconciliation

EU14 schema support:

| EU allergen | Current representation |
|---|---|
| Cereals containing gluten | `allergen_gluten`; celiac via `ok_celiac`; wheat allergy missing |
| Crustaceans | `allergen_crustaceans` |
| Eggs | `allergen_eggs` |
| Fish | `allergen_fish` |
| Peanuts | `allergen_peanuts` |
| Soy | `allergen_soy` |
| Milk | `allergen_dairy`; lactose separately via `allergen_lactose` and `ok_lactose_intolerant` |
| Tree nuts | `allergen_nuts` plus almond, hazelnut, walnut, cashew, pecan, brazil nut, pistachio, macadamia |
| Celery | `allergen_celery` |
| Mustard | `allergen_mustard` |
| Sesame | `allergen_sesame` |
| Sulphites | `allergen_sulphites` |
| Lupin | `allergen_lupin` |
| Molluscs | `allergen_mollusks` |

SCHEMA_SUPPORT_COMPLETE: YES  
DATA_REVIEW_COMPLETE: NO  
CROSS_CONTACT_SUPPORT_COMPLETE: NO

Required but not implemented as explicit fields/tables: `contains_allergen` as a reviewed assertion separate from nullable booleans, `may_contain_allergen`, `cross_contact_risk`, `allergen_source_ingredient`, `label_verified_at`, `product_brand`.

Important professional distinctions captured:

- Molluscs are not crustaceans.
- Milk allergy is not lactose intolerance.
- Celiac disease is not wheat allergy.
- Oats for celiac flows require certified gluten-free product/supply control.
- Absence of an obvious gluten ingredient is not a celiac-safe claim.

## Ingredient State And Yield Reconciliation

Current infrastructure:

- Recipe ingredient `measurement_basis` supports `raw`, `cooked`, `preserved`.
- Ingredient-level `raw_or_cooked` exists.
- `freshness_form` supports fresh, frozen natural, canned natural, dried, processed.
- `ingredient_yield_conversions` exists with basis/form/method, version, validation status.
- `edible_portion_fraction` exists with validation constraint.

Remaining professional gaps:

- `drained` is not a first-class basis.
- Ready-to-eat/preserved state is partial and not fully reviewed.
- No universal cooking yield should be inferred.
- Yogurt, milk and fruit still appear as generic `raw` in recipe drafts/snapshots.
- Ricotta as `cooked` needs professional clarification.
- Tuna and sardines have remediation toward cooked/canned-natural, but preserved/drained semantics still need standardization.
- 5g spice/aromatic quantities require correction/caps.

## Component Scaling Reconciliation

Current state:

- Phase 3B harness uses uniform scaling: `scaleFactor = target_kcal / baseTotals.kcal`.
- It emits `LOCAL_UNIFORM_RECIPE_SCALING_ONLY` and marks step/bounds-aware scaling not implemented.
- Draft `culinary_role` metadata exists, with observed 130-draft coverage:

| Professional component role | Current mapping | Count |
|---|---|---:|
| protein | `protein_primary` | 107 |
| carbohydrate | `carb_primary` | 105 |
| fat | `fat` | 81 |
| vegetable | `vegetable` | 113 |
| fruit | `fruit` | 52 |
| sauce | no explicit role | 0 |
| spice | `flavor` / `garnish` | 115 |
| liquid | no explicit role | 0 |

Required architecture behavior not yet implemented:

- Protein source scalable within min/max and discrete portions where appropriate.
- Starchy carbohydrate as principal energy/carbohydrate lever.
- Added fat capped and not proportionally unlimited.
- Vegetables semi-fixed within volume/tolerance/context.
- Fruit as discrete portions with carbohydrate/FODMAP context.
- Spices/aromatics/coffee non-scalable or capped.
- Post-scaling kcal/macros recalculation and later allergen/clinical compatibility recalculation.

Status: ARCHITECTURE_CHANGE_REQUEST_REQUIRED.

## Culinary Completeness Reconciliation

JSON draft audit:

| Required item | Current coverage | Status |
|---|---:|---|
| Servings | Not consistently explicit beyond per-recipe serving assumption | PARTIAL |
| Final portion weight | 0/130 detected | MISSING |
| Numbered procedure / steps | 130/130 have 3-5 step arrays | IMPLEMENTED |
| Water/liquids where relevant | 31/130 detected | PARTIAL |
| Cooking method | 130/130 detected | IMPLEMENTED |
| Cooking temperature where relevant | 2/130 detected | PARTIAL |
| Cooking time | 130/130 | IMPLEMENTED |
| Assembly order | 130/130 basic steps | PARTIAL |
| Expected consistency | Not structured/detected | MISSING |
| Seasoning/aromatics | 75/130 detected | PARTIAL |
| Storage | 8/130 detected | PARTIAL |
| Cooling/reheating | 8/130 detected | PARTIAL |
| Food-safety notes | 0/130 detected | MISSING |
| Allergen cross-contact prevention | 0/130 detected | MISSING |

Technical-feeling combinations called out by the nutritionist, including chicken-rice-pineapple, shrimp-rice-papaya and turkey-rice-mango, need culinary logic, light sauce/seasoning/aromatics and reproducible preparation in a later recipe-edit phase.

## Workout Reconciliation

Pre-workout:

| Requirement | Current system | Status |
|---|---|---|
| `<60 min`: small, easily digestible carb, very low fat/fiber | 0-60 and 45-60 rapid-carb rules exist. | PARTIALLY_IMPLEMENTED |
| `1-2h`: carbs plus small protein where tolerated, moderate fiber by tolerance | No explicit class found. | NOT_IMPLEMENTED |
| `2-4h`: more complete meal | Harness recognizes full meal 2h+ before training, but no 2-4h class. | PARTIALLY_IMPLEMENTED |
| Sport/duration/GI tolerance | Sport modifiers exist; duration used for event relation; GI tolerance not modeled. | PARTIALLY_IMPLEMENTED |
| Oats/apple/dates/large fruit caution close to training | Not modeled as timing/FODMAP caution. | NOT_IMPLEMENTED |
| Caffeine mg | Coffee/matcha/tea quantities exist, mg caffeine absent. | NOT_IMPLEMENTED |
| Caffeine context: minors, pregnancy, anxiety, hypertension, GERD, sleep | Not modeled. | NOT_IMPLEMENTED |

Post-workout:

| Requirement | Current system | Status |
|---|---|---|
| Protein generally reasonable | Config uses 25g post-workout target. | PARTIALLY_IMPLEMENTED |
| Body weight context | `targetCarbsGPerKg` exists; protein by body weight not fully modeled. | PARTIALLY_IMPLEMENTED |
| Previous meal / next meal | Harness detects post-workout full meal and pre-workout full meal relations. | PARTIALLY_IMPLEMENTED |
| Intensity, duration, sport, daily intake, next session | Sport/duration/daily targets partially present; intensity/next session not complete. | PARTIALLY_IMPLEMENTED |
| Avoid universal 1g/kg carb rule | Current config still encodes `targetCarbsGPerKg: 1`; needs replacement with context. | NOT_IMPLEMENTED |
| Liquids, sodium, hydration/replacement | Not found as structured post-workout model. | NOT_IMPLEMENTED |

## Clinical Matrix Reconciliation

Required professional states:

- `COMPATIBILE`
- `CON_MODIFICA`
- `CONDIZIONALE`
- `ESCLUSA`
- `VALUTAZIONE_CLINICA`

Conceptual mapping to frozen `policy_action`:

| Nutritionist state | Closest frozen concept | Gap |
|---|---|---|
| COMPATIBILE | `allowed` | Strong match |
| CON_MODIFICA | `restricted` | Needs required substitution/portion/rationale |
| CONDIZIONALE | `restricted` or `professional_review_required` | Needs condition expression and context |
| ESCLUSA | `blocked` | Strong match |
| VALUTAZIONE_CLINICA | `professional_review_required` | Strong match |
| Unknown data | `unresolved` | Data state, not a clinical verdict |

Current system:

- Ingredient booleans exist for diabetes, GERD, IBS/FODMAP, histamine, gout, renal, nickel.
- Recipe definitions, variants and configurations support clinical reviewer/status/date/version.
- No first-class five-state clinical matrix exists.
- Vegan is handled as dietary preference/dietary style, not a pathology, which aligns with the professional instruction.

Condition guidance captured for later rules:

- GERD triggers are conditional/personal, not universal bans.
- IBS/FODMAP is portion- and phase-dependent.
- Histamine depends on fermentation, ageing, preservation, freshness and tolerance.
- Gout needs portion/frequency context for organ meat, anchovies, sardines, herring and some molluscs.
- Renal disease requires CKD stage/dialysis and clinical context; otherwise professional evaluation.
- Nickel applies only with confirmed diagnosis and relevant food patterns.

Status: ARCHITECTURE_CHANGE_REQUEST_REQUIRED.

## Extended Nutrients Reconciliation

| Nutrient/context | Current implementation | Status |
|---|---|---|
| Total sugars | Recipe has `added_sugar_level`; no complete grams field found. | PARTIAL / PRODUCTION BLOCKER |
| Available carbohydrates | Not found as first-class field. | NOT_IMPLEMENTED / PRODUCTION BLOCKER |
| Saturated fat | Not found as first-class field. | NOT_IMPLEMENTED / PRODUCTION BLOCKER |
| Sodium | Recipe `sodium_level`; CIQUAL/CREA clients parse sodium mg. | PARTIAL / PRODUCTION BLOCKER |
| Potassium | Not found as first-class parsed field in inspected schema/scripts. | NOT_IMPLEMENTED / PRODUCTION BLOCKER |
| Phosphorus | Not found as first-class parsed field in inspected schema/scripts. | NOT_IMPLEMENTED / PRODUCTION BLOCKER |
| Calcium | Can fit `micronutrients JSONB`; no reviewed completeness proof. | PARTIAL / PRODUCTION BLOCKER |
| Iron | Can fit `micronutrients JSONB`; no reviewed completeness proof. | PARTIAL / PRODUCTION BLOCKER |
| Vitamin B12 | CIQUAL/CREA clients parse B12; no reviewed completeness proof. | PARTIAL / PRODUCTION BLOCKER |
| Vitamin D | Can fit `micronutrients JSONB`; no reviewed completeness proof. | PARTIAL / PRODUCTION BLOCKER |
| Caffeine mg | Not found. | NOT_IMPLEMENTED / PRODUCTION BLOCKER |
| Fluids | Not found as structured nutrient/context. | NOT_IMPLEMENTED / PRODUCTION BLOCKER |
| Grapefruit + medications | No medication interaction model found. | NOT_IMPLEMENTED / PRODUCTION BLOCKER |
| Liver + vitamin A/frequency | No frequency/vitamin A alert model found. | NOT_IMPLEMENTED / PRODUCTION BLOCKER |
| High-sodium foods | Some sodium-level support, no complete contextual alert model. | PARTIAL / PRODUCTION BLOCKER |
| Fermented/aged histamine context | Some condition flags, no freshness/fermentation rule matrix. | PARTIAL / PRODUCTION BLOCKER |

No Phase 1 schema expansion was performed.

## Import Blockers

BLOCKER_BEFORE_DEFINITIVE_IMPORT:

- Add an explicit block for the three seitan recipes until ingredient ID 16 source/brand, per-100g nutrition basis, and state/form are verified and recipes are recalculated.
- Obtain/query/export ingredient ID 16 current DB row and provenance; local `.env` currently has no `DATABASE_URL`.
- Do not mark the affected recipes as definitive-import ready while `SEITAN_SOURCE_UNRESOLVED` remains true.
- Ensure no unexplained nutrition/unit anomalies remain for imported recipes.

CAN_CONTINUE_IN_PARALLEL:

- Design cross-contact/product-label evidence schema.
- Design component scaling using existing `culinary_role` coverage.
- Specify ingredient state cleanup for yogurt, milk, fruit, ricotta, tuna/sardines and spice caps.
- Draft culinary completeness remediation requirements.
- Draft workout timing-band and caffeine-mg requirements.
- Draft clinical matrix architecture change request.

BLOCKER_BEFORE_PRODUCTION:

- Complete EU14 reviewed data and product/cross-contact linkage.
- Complete clinical matrix with rationale, portion/range, substitutions and professional review.
- Replace uniform scaling with component-aware scaling and post-scaling nutrition/allergen/clinical recalculation.
- Complete executable recipe preparations, storage, reheating, food-safety and cross-contact prevention.
- Implement workout selection by timing/type/context without universal 1g/kg carb rule.
- Expand and review extended nutrient/context support.
- Add named professional review with date/version.
- Run automated edge-case/regression tests, internal pilot, limited release, production monitoring and recipe disable path.

## Prioritized Next Implementation Order

Professional recommended order captured: data + allergens, clinical + scaling, recipes + workout, validation/release.

Next five smallest implementation tasks:

1. Add a controlled definitive-import block for the three seitan recipes keyed by `authoring_key`, with reason `SEITAN_SOURCE_UNRESOLVED`.
2. Query/export ingredient ID 16 from the current DB with full provenance and recalculate the three recipe totals from ingredient values.
3. Add a product/allergen evidence design covering `may_contain_allergen`, `cross_contact_risk`, `label_verified_at`, `product_brand`, and certified-GF oats.
4. Prepare the component-scaling architecture change request using existing `culinary_role` counts and explicit caps/discrete portions.
5. Prepare the clinical five-state matrix architecture change request with required context fields and condition-specific guidance.

## Validation Checklist

Dedicated sections present:

- Source/professional verdict: YES
- Seitan: YES
- Allergens: YES
- Ingredient state/yields: YES
- Component scaling: YES
- Culinary completeness: YES
- Workout: YES
- Clinical matrix: YES
- Extended nutrients: YES
- Import blockers: YES
- Production blockers: YES
- Next implementation order: YES

## Final Flags

NUTRITIONIST_REVIEW_INGESTED: YES  
OFFICIAL_PROFESSIONAL_VERDICT_CAPTURED: YES  
RECONCILIATION_CORRECTED: YES

SEITAN_BLOCKER_CAPTURED: YES  
EU14_REQUIREMENT_CAPTURED: YES  
CROSS_CONTACT_REQUIREMENT_CAPTURED: YES  
COMPONENT_SCALING_REQUIREMENT_CAPTURED: YES  
CULINARY_REQUIREMENT_CAPTURED: YES  
WORKOUT_REQUIREMENT_CAPTURED: YES  
CLINICAL_MATRIX_REQUIREMENT_CAPTURED: YES

IMPLEMENTED_VS_MISSING_RECONCILED: YES  
IMPORT_AND_PRODUCTION_BLOCKERS_SEPARATED: YES

NO_DB_WRITES: YES  
NO_RUNTIME_CHANGES: YES  
ONLY_RECONCILIATION_FILE_MODIFIED: YES

SAFE_TO_REVIEW_CORRECTED_RECONCILIATION: YES

RECOMMENDED_NEXT_TASK: Add a controlled definitive-import block for the three seitan recipes keyed by authoring_key with reason SEITAN_SOURCE_UNRESOLVED.
