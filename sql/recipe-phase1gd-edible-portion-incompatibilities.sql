-- DUBI Recipe Architecture Phase 1G-D — edible portion and ingredient incompatibilities.
-- Strictly additive migration.
-- No ingredient data, recipe tables, yield conversions, or runtime behavior are modified.

BEGIN;

ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS edible_portion_fraction NUMERIC(5,4) NULL;

ALTER TABLE public.ingredients
  DROP CONSTRAINT IF EXISTS ingredients_edible_portion_fraction_valid,
  ADD CONSTRAINT ingredients_edible_portion_fraction_valid
    CHECK (
      edible_portion_fraction IS NULL
      OR (
        edible_portion_fraction > 0
        AND edible_portion_fraction <= 1
      )
    );

CREATE TABLE IF NOT EXISTS public.ingredient_incompatibilities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ingredient_a_id INTEGER NOT NULL
    REFERENCES public.ingredients(id)
    ON DELETE RESTRICT,
  ingredient_b_id INTEGER NOT NULL
    REFERENCES public.ingredients(id)
    ON DELETE RESTRICT,
  reason TEXT NULL,
  source TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT ingredient_incompatibilities_canonical_pair
    CHECK (ingredient_a_id < ingredient_b_id),
  CONSTRAINT ingredient_incompatibilities_unique_pair
    UNIQUE (ingredient_a_id, ingredient_b_id)
);

CREATE INDEX IF NOT EXISTS idx_ingredient_incompatibilities_ingredient_a_id
  ON public.ingredient_incompatibilities (ingredient_a_id);

CREATE INDEX IF NOT EXISTS idx_ingredient_incompatibilities_ingredient_b_id
  ON public.ingredient_incompatibilities (ingredient_b_id);

ALTER TABLE public.ingredient_incompatibilities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ingredient_incompatibilities_read ON public.ingredient_incompatibilities;
CREATE POLICY ingredient_incompatibilities_read ON public.ingredient_incompatibilities
  FOR SELECT USING (true);

DROP POLICY IF EXISTS ingredient_incompatibilities_shared_write ON public.ingredient_incompatibilities;
CREATE POLICY ingredient_incompatibilities_shared_write ON public.ingredient_incompatibilities
  FOR ALL
  USING (public.app_shared_write_enabled())
  WITH CHECK (public.app_shared_write_enabled());

COMMIT;
