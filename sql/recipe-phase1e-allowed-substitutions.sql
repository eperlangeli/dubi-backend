-- DUBI Recipe Architecture Phase 1E — allowed substitutions.
-- Creates recipe_allowed_substitutions only.
-- Existing tables are referenced but not modified.

BEGIN;

CREATE TABLE IF NOT EXISTS public.recipe_allowed_substitutions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_id UUID NOT NULL
    REFERENCES public.recipe_definitions(id)
    ON DELETE RESTRICT,
  target_recipe_ingredient_id UUID NOT NULL
    REFERENCES public.recipe_ingredients(id)
    ON DELETE RESTRICT,
  substitute_ingredient_id INTEGER NOT NULL
    REFERENCES public.ingredients(id)
    ON DELETE RESTRICT,
  quantity_multiplier NUMERIC(10,6) NOT NULL DEFAULT 1,
  measurement_basis TEXT NOT NULL,
  scalable_min_g NUMERIC(10,3) NULL,
  scalable_max_g NUMERIC(10,3) NULL,
  scalable_step_g NUMERIC(10,3) NULL,
  substitution_version INTEGER NOT NULL DEFAULT 1,
  validated_against_recipe_version INTEGER NOT NULL,
  validation_status TEXT NOT NULL DEFAULT 'draft',
  lifecycle_status TEXT NOT NULL DEFAULT 'active',
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

  CONSTRAINT recipe_allowed_substitutions_quantity_multiplier_positive
    CHECK (quantity_multiplier > 0),
  CONSTRAINT recipe_allowed_substitutions_measurement_basis_valid
    CHECK (measurement_basis IN ('raw', 'cooked', 'preserved')),
  CONSTRAINT recipe_allowed_substitutions_scalable_min_g_positive
    CHECK (
      scalable_min_g IS NULL
      OR scalable_min_g > 0
    ),
  CONSTRAINT recipe_allowed_substitutions_scalable_max_g_positive
    CHECK (
      scalable_max_g IS NULL
      OR scalable_max_g > 0
    ),
  CONSTRAINT recipe_allowed_substitutions_scalable_step_g_positive
    CHECK (
      scalable_step_g IS NULL
      OR scalable_step_g > 0
    ),
  CONSTRAINT recipe_allowed_substitutions_scalable_bounds_order
    CHECK (
      scalable_min_g IS NULL
      OR scalable_max_g IS NULL
      OR scalable_max_g >= scalable_min_g
    ),
  CONSTRAINT recipe_allowed_substitutions_scalable_step_within_bounds
    CHECK (
      scalable_step_g IS NULL
      OR scalable_min_g IS NULL
      OR scalable_max_g IS NULL
      OR scalable_max_g = scalable_min_g
      OR scalable_step_g <= (scalable_max_g - scalable_min_g)
    ),
  CONSTRAINT recipe_allowed_substitutions_substitution_version_positive
    CHECK (substitution_version >= 1),
  CONSTRAINT recipe_allowed_substitutions_validated_recipe_version_positive
    CHECK (validated_against_recipe_version >= 1),
  CONSTRAINT recipe_allowed_substitutions_validation_status_valid
    CHECK (validation_status IN ('draft', 'provisional', 'validated')),
  CONSTRAINT recipe_allowed_substitutions_lifecycle_status_valid
    CHECK (lifecycle_status IN ('active', 'deprecated', 'archived')),
  CONSTRAINT recipe_allowed_substitutions_nutrition_review_status_valid
    CHECK (nutrition_review_status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT recipe_allowed_substitutions_clinical_review_status_valid
    CHECK (clinical_review_status IN ('not_required', 'pending', 'approved', 'rejected')),
  CONSTRAINT recipe_allowed_substitutions_nutrition_reviewed_version_valid
    CHECK (
      nutrition_reviewed_version IS NULL
      OR (
        nutrition_reviewed_version >= 1
        AND nutrition_reviewed_version <= substitution_version
      )
    ),
  CONSTRAINT recipe_allowed_substitutions_clinical_reviewed_version_valid
    CHECK (
      clinical_reviewed_version IS NULL
      OR (
        clinical_reviewed_version >= 1
        AND clinical_reviewed_version <= substitution_version
      )
    )
);

CREATE INDEX IF NOT EXISTS idx_recipe_allowed_substitutions_recipe_id
  ON public.recipe_allowed_substitutions (recipe_id);

CREATE INDEX IF NOT EXISTS idx_recipe_allowed_substitutions_target_recipe_ingredient_id
  ON public.recipe_allowed_substitutions (target_recipe_ingredient_id);

CREATE INDEX IF NOT EXISTS idx_recipe_allowed_substitutions_substitute_ingredient_id
  ON public.recipe_allowed_substitutions (substitute_ingredient_id);

CREATE INDEX IF NOT EXISTS idx_recipe_allowed_substitutions_validation_lifecycle
  ON public.recipe_allowed_substitutions (validation_status, lifecycle_status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_recipe_allowed_substitutions_unique_active
  ON public.recipe_allowed_substitutions (
    recipe_id,
    target_recipe_ingredient_id,
    substitute_ingredient_id
  )
  WHERE lifecycle_status = 'active';

ALTER TABLE public.recipe_allowed_substitutions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recipe_allowed_substitutions_read ON public.recipe_allowed_substitutions;
CREATE POLICY recipe_allowed_substitutions_read ON public.recipe_allowed_substitutions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS recipe_allowed_substitutions_shared_write ON public.recipe_allowed_substitutions;
CREATE POLICY recipe_allowed_substitutions_shared_write ON public.recipe_allowed_substitutions
  FOR ALL
  USING (app_shared_write_enabled())
  WITH CHECK (app_shared_write_enabled());

COMMIT;
