-- DUBI Phase 2D-C seitan source correction proposal.
-- DO NOT EXECUTE until reviewed.
--
-- Scope:
-- - Targets public.ingredients only.
-- - Targets ingredient id 16 only.
-- - Does not update recipe drafts, recipes, import blocks, or runtime tables.
-- - Keeps recipe import blocks active pending DB correction, recalculation,
--   validator pass, and professional re-review.
--
-- Replacement source:
-- Anses. 2025. Table de composition nutritionnelle des aliments Ciqual 2025.
-- Food: Seitan, preemballe
-- Ciqual food code: 25598
-- File DOI: https://doi.org/10.57745/RPWYZD
-- Dataset DOI: https://doi.org/10.57745/RDMHWY
-- Values are per 100 g edible portion.
-- Form/status fields are intentionally preserved because this source proves
-- ready-to-use/prepacked seitan, but does not by itself prove DUBI enum mapping
-- for raw_or_cooked or freshness_form.

BEGIN;

UPDATE public.ingredients
SET
  calories_per_100g = 134,
  protein_g = 20.6,
  carbs_g = 6.7,
  fat_g = 2.5,
  fiber_g = 0.9,
  nutrition_source = 'ANSES Ciqual',
  nutrition_source_version = 'Ciqual 2025; Table Ciqual 2025_FR_2025_11_03.xlsx; dataset V1',
  nutrition_source_date = DATE '2025-11-19'
WHERE id = 16
  AND name = 'Seitan'
  AND calories_per_100g = 370
  AND protein_g = 75
  AND carbs_g = 14
  AND fat_g = 1.9
  AND fiber_g = 0.6
  AND raw_or_cooked = 'raw'
  AND freshness_form = 'fresh'
  AND serving_min_g = 50
  AND serving_max_g = 150
  AND serving_step_g = 10
  AND typical_portion_g = 100
  AND edible_portion_fraction IS NULL
  AND nutrition_source = 'USDA FoodData Central'
  AND nutrition_source_version IS NULL
  AND nutrition_source_date IS NULL;

SELECT
  id,
  name,
  calories_per_100g,
  protein_g,
  carbs_g,
  fat_g,
  fiber_g,
  raw_or_cooked,
  freshness_form,
  serving_min_g,
  serving_max_g,
  serving_step_g,
  typical_portion_g,
  edible_portion_fraction,
  nutrition_source,
  nutrition_source_version,
  nutrition_source_date,
  verified_by,
  last_verified_at,
  last_reviewed_at
FROM public.ingredients
WHERE id = 16;

COMMIT;
