-- DUBI Recipe Architecture Phase 1G-B — ingredient safety and provenance.
-- Strictly additive migration for public.ingredients only.
-- Existing ingredient values remain untouched.

BEGIN;

ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS allergen_crustaceans BOOLEAN NULL,
  ADD COLUMN IF NOT EXISTS allergen_celery BOOLEAN NULL,
  ADD COLUMN IF NOT EXISTS allergen_mustard BOOLEAN NULL,
  ADD COLUMN IF NOT EXISTS allergen_sulphites BOOLEAN NULL,
  ADD COLUMN IF NOT EXISTS allergen_lupin BOOLEAN NULL,
  ADD COLUMN IF NOT EXISTS allergen_almond BOOLEAN NULL,
  ADD COLUMN IF NOT EXISTS allergen_hazelnut BOOLEAN NULL,
  ADD COLUMN IF NOT EXISTS allergen_walnut BOOLEAN NULL,
  ADD COLUMN IF NOT EXISTS allergen_cashew BOOLEAN NULL,
  ADD COLUMN IF NOT EXISTS allergen_pecan BOOLEAN NULL,
  ADD COLUMN IF NOT EXISTS allergen_brazil_nut BOOLEAN NULL,
  ADD COLUMN IF NOT EXISTS allergen_pistachio BOOLEAN NULL,
  ADD COLUMN IF NOT EXISTS allergen_macadamia BOOLEAN NULL,
  ADD COLUMN IF NOT EXISTS nutrition_source_version TEXT NULL,
  ADD COLUMN IF NOT EXISTS nutrition_source_date DATE NULL,
  ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMPTZ NULL;

COMMIT;
