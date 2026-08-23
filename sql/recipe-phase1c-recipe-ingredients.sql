-- DUBI Recipe Architecture Phase 1C — recipe ingredients.
-- Creates recipe_ingredients only.
-- Existing tables are referenced but not modified.

BEGIN;

CREATE TABLE IF NOT EXISTS public.recipe_ingredients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_id UUID NOT NULL
    REFERENCES public.recipe_definitions(id)
    ON DELETE RESTRICT,
  ingredient_id INTEGER NOT NULL
    REFERENCES public.ingredients(id)
    ON DELETE RESTRICT,
  quantity_g NUMERIC(10,3) NOT NULL,
  quantity_unit TEXT NOT NULL DEFAULT 'g',
  measurement_basis TEXT NOT NULL,
  culinary_role TEXT NOT NULL,
  is_scalable BOOLEAN NOT NULL DEFAULT true,
  scalable_min_g NUMERIC(10,3) NULL,
  scalable_max_g NUMERIC(10,3) NULL,
  scalable_step_g NUMERIC(10,3) NULL,
  is_optional_culinary_metadata BOOLEAN NOT NULL DEFAULT false,
  fixed_or_scalable_reason TEXT NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT recipe_ingredients_quantity_g_positive
    CHECK (quantity_g > 0),
  CONSTRAINT recipe_ingredients_quantity_unit_valid
    CHECK (quantity_unit IN ('g', 'ml', 'piece', 'tbsp', 'tsp', 'cup', 'dL')),
  CONSTRAINT recipe_ingredients_measurement_basis_valid
    CHECK (measurement_basis IN ('raw', 'cooked', 'preserved')),
  CONSTRAINT recipe_ingredients_culinary_role_valid
    CHECK (
      culinary_role IN (
        'protein_primary',
        'carb_primary',
        'fat',
        'vegetable',
        'fruit',
        'binding',
        'garnish',
        'bulking_agent',
        'flavor'
      )
    ),
  CONSTRAINT recipe_ingredients_scalable_min_g_positive
    CHECK (
      scalable_min_g IS NULL
      OR scalable_min_g > 0
    ),
  CONSTRAINT recipe_ingredients_scalable_max_g_positive
    CHECK (
      scalable_max_g IS NULL
      OR scalable_max_g > 0
    ),
  CONSTRAINT recipe_ingredients_scalable_step_g_positive
    CHECK (
      scalable_step_g IS NULL
      OR scalable_step_g > 0
    ),
  CONSTRAINT recipe_ingredients_scalable_bounds_order
    CHECK (
      scalable_min_g IS NULL
      OR scalable_max_g IS NULL
      OR scalable_max_g >= scalable_min_g
    ),
  CONSTRAINT recipe_ingredients_scalable_step_within_bounds
    CHECK (
      scalable_step_g IS NULL
      OR scalable_min_g IS NULL
      OR scalable_max_g IS NULL
      OR scalable_max_g = scalable_min_g
      OR scalable_step_g <= (scalable_max_g - scalable_min_g)
    )
);

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe_id
  ON public.recipe_ingredients (recipe_id);

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_ingredient_id
  ON public.recipe_ingredients (ingredient_id);

ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recipe_ingredients_read ON public.recipe_ingredients;
CREATE POLICY recipe_ingredients_read ON public.recipe_ingredients
  FOR SELECT USING (true);

DROP POLICY IF EXISTS recipe_ingredients_shared_write ON public.recipe_ingredients;
CREATE POLICY recipe_ingredients_shared_write ON public.recipe_ingredients
  FOR ALL
  USING (app_shared_write_enabled())
  WITH CHECK (app_shared_write_enabled());

COMMIT;
