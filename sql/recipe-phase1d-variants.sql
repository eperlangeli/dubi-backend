-- DUBI Recipe Architecture Phase 1D — recipe variants.
-- Creates recipe_variants and recipe_variant_ingredients only.
-- Existing tables are referenced but not modified.

BEGIN;

CREATE TABLE IF NOT EXISTS public.recipe_variants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_id UUID NOT NULL
    REFERENCES public.recipe_definitions(id)
    ON DELETE RESTRICT,
  variant_name TEXT NOT NULL,
  description TEXT NULL,
  applies_to_dietary_styles TEXT[] NULL,
  variant_version INTEGER NOT NULL DEFAULT 1,
  validated_against_recipe_version INTEGER NOT NULL,
  validation_status TEXT NOT NULL DEFAULT 'draft',
  lifecycle_status TEXT NOT NULL DEFAULT 'active',
  requires_clinical_review BOOLEAN NOT NULL DEFAULT false,
  notes TEXT NULL,
  nutrition_reviewer TEXT NULL,
  nutrition_review_status TEXT NOT NULL DEFAULT 'pending',
  nutrition_review_date TIMESTAMPTZ NULL,
  nutrition_reviewed_version INTEGER NULL,
  clinical_reviewer TEXT NULL,
  clinical_review_status TEXT NOT NULL DEFAULT 'not_required',
  clinical_review_date TIMESTAMPTZ NULL,
  clinical_reviewed_version INTEGER NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT recipe_variants_variant_name_nonempty
    CHECK (NULLIF(BTRIM(variant_name), '') IS NOT NULL),
  CONSTRAINT recipe_variants_applies_to_dietary_styles_valid
    CHECK (
      applies_to_dietary_styles IS NULL
      OR applies_to_dietary_styles <@ ARRAY[
        'omnivore',
        'pescatarian',
        'vegetarian',
        'vegan'
      ]::text[]
    ),
  CONSTRAINT recipe_variants_variant_version_positive
    CHECK (variant_version >= 1),
  CONSTRAINT recipe_variants_validated_recipe_version_positive
    CHECK (validated_against_recipe_version >= 1),
  CONSTRAINT recipe_variants_validation_status_valid
    CHECK (validation_status IN ('draft', 'provisional', 'validated')),
  CONSTRAINT recipe_variants_lifecycle_status_valid
    CHECK (lifecycle_status IN ('active', 'deprecated', 'archived')),
  CONSTRAINT recipe_variants_nutrition_review_status_valid
    CHECK (nutrition_review_status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT recipe_variants_clinical_review_status_valid
    CHECK (clinical_review_status IN ('not_required', 'pending', 'approved', 'rejected')),
  CONSTRAINT recipe_variants_nutrition_reviewed_version_valid
    CHECK (
      nutrition_reviewed_version IS NULL
      OR (
        nutrition_reviewed_version >= 1
        AND nutrition_reviewed_version <= variant_version
      )
    ),
  CONSTRAINT recipe_variants_clinical_reviewed_version_valid
    CHECK (
      clinical_reviewed_version IS NULL
      OR (
        clinical_reviewed_version >= 1
        AND clinical_reviewed_version <= variant_version
      )
    )
);

CREATE TABLE IF NOT EXISTS public.recipe_variant_ingredients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_variant_id UUID NOT NULL
    REFERENCES public.recipe_variants(id)
    ON DELETE RESTRICT,
  operation TEXT NOT NULL,
  target_recipe_ingredient_id UUID NULL
    REFERENCES public.recipe_ingredients(id)
    ON DELETE RESTRICT,
  ingredient_id INTEGER NULL
    REFERENCES public.ingredients(id)
    ON DELETE RESTRICT,
  quantity_g NUMERIC(10,3) NULL,
  quantity_unit TEXT NULL,
  measurement_basis TEXT NULL,
  culinary_role TEXT NULL,
  is_scalable BOOLEAN NULL,
  scalable_min_g NUMERIC(10,3) NULL,
  scalable_max_g NUMERIC(10,3) NULL,
  scalable_step_g NUMERIC(10,3) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT recipe_variant_ingredients_operation_valid
    CHECK (operation IN ('add', 'replace', 'remove')),
  CONSTRAINT recipe_variant_ingredients_quantity_g_positive
    CHECK (
      quantity_g IS NULL
      OR quantity_g > 0
    ),
  CONSTRAINT recipe_variant_ingredients_quantity_unit_valid
    CHECK (
      quantity_unit IS NULL
      OR quantity_unit IN ('g', 'ml', 'piece', 'tbsp', 'tsp', 'cup', 'dL')
    ),
  CONSTRAINT recipe_variant_ingredients_measurement_basis_valid
    CHECK (
      measurement_basis IS NULL
      OR measurement_basis IN ('raw', 'cooked', 'preserved')
    ),
  CONSTRAINT recipe_variant_ingredients_culinary_role_valid
    CHECK (
      culinary_role IS NULL
      OR culinary_role IN (
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
  CONSTRAINT recipe_variant_ingredients_scalable_min_g_positive
    CHECK (
      scalable_min_g IS NULL
      OR scalable_min_g > 0
    ),
  CONSTRAINT recipe_variant_ingredients_scalable_max_g_positive
    CHECK (
      scalable_max_g IS NULL
      OR scalable_max_g > 0
    ),
  CONSTRAINT recipe_variant_ingredients_scalable_step_g_positive
    CHECK (
      scalable_step_g IS NULL
      OR scalable_step_g > 0
    ),
  CONSTRAINT recipe_variant_ingredients_scalable_bounds_order
    CHECK (
      scalable_min_g IS NULL
      OR scalable_max_g IS NULL
      OR scalable_max_g >= scalable_min_g
    ),
  CONSTRAINT recipe_variant_ingredients_scalable_step_within_bounds
    CHECK (
      scalable_step_g IS NULL
      OR scalable_min_g IS NULL
      OR scalable_max_g IS NULL
      OR scalable_max_g = scalable_min_g
      OR scalable_step_g <= (scalable_max_g - scalable_min_g)
    ),
  CONSTRAINT recipe_variant_ingredients_operation_shape_valid
    CHECK (
      (
        operation = 'add'
        AND target_recipe_ingredient_id IS NULL
        AND ingredient_id IS NOT NULL
        AND quantity_g IS NOT NULL
        AND measurement_basis IS NOT NULL
        AND culinary_role IS NOT NULL
      )
      OR (
        operation = 'replace'
        AND target_recipe_ingredient_id IS NOT NULL
        AND ingredient_id IS NOT NULL
        AND quantity_g IS NOT NULL
        AND measurement_basis IS NOT NULL
      )
      OR (
        operation = 'remove'
        AND target_recipe_ingredient_id IS NOT NULL
        AND ingredient_id IS NULL
        AND quantity_g IS NULL
        AND quantity_unit IS NULL
        AND measurement_basis IS NULL
        AND culinary_role IS NULL
        AND is_scalable IS NULL
        AND scalable_min_g IS NULL
        AND scalable_max_g IS NULL
        AND scalable_step_g IS NULL
      )
    )
);

CREATE INDEX IF NOT EXISTS idx_recipe_variants_recipe_id
  ON public.recipe_variants (recipe_id);

CREATE INDEX IF NOT EXISTS idx_recipe_variants_validation_lifecycle
  ON public.recipe_variants (validation_status, lifecycle_status);

CREATE INDEX IF NOT EXISTS idx_recipe_variant_ingredients_recipe_variant_id
  ON public.recipe_variant_ingredients (recipe_variant_id);

CREATE INDEX IF NOT EXISTS idx_recipe_variant_ingredients_target_recipe_ingredient_id
  ON public.recipe_variant_ingredients (target_recipe_ingredient_id);

CREATE INDEX IF NOT EXISTS idx_recipe_variant_ingredients_ingredient_id
  ON public.recipe_variant_ingredients (ingredient_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_recipe_variant_ingredients_unique_target
  ON public.recipe_variant_ingredients (recipe_variant_id, target_recipe_ingredient_id)
  WHERE target_recipe_ingredient_id IS NOT NULL;

ALTER TABLE public.recipe_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_variant_ingredients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recipe_variants_read ON public.recipe_variants;
CREATE POLICY recipe_variants_read ON public.recipe_variants
  FOR SELECT USING (true);

DROP POLICY IF EXISTS recipe_variants_shared_write ON public.recipe_variants;
CREATE POLICY recipe_variants_shared_write ON public.recipe_variants
  FOR ALL
  USING (app_shared_write_enabled())
  WITH CHECK (app_shared_write_enabled());

DROP POLICY IF EXISTS recipe_variant_ingredients_read ON public.recipe_variant_ingredients;
CREATE POLICY recipe_variant_ingredients_read ON public.recipe_variant_ingredients
  FOR SELECT USING (true);

DROP POLICY IF EXISTS recipe_variant_ingredients_shared_write ON public.recipe_variant_ingredients;
CREATE POLICY recipe_variant_ingredients_shared_write ON public.recipe_variant_ingredients
  FOR ALL
  USING (app_shared_write_enabled())
  WITH CHECK (app_shared_write_enabled());

COMMIT;
