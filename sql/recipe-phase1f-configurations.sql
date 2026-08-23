-- DUBI Recipe Architecture Phase 1F — executable configurations.
-- Creates recipe_configurations and recipe_configuration_substitutions only.
-- Existing tables are referenced but not modified.

BEGIN;

CREATE TABLE IF NOT EXISTS public.recipe_configurations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_id UUID NOT NULL
    REFERENCES public.recipe_definitions(id)
    ON DELETE RESTRICT,
  recipe_version INTEGER NOT NULL,
  recipe_variant_id UUID NULL
    REFERENCES public.recipe_variants(id)
    ON DELETE RESTRICT,
  recipe_variant_version INTEGER NULL,
  configuration_version INTEGER NOT NULL DEFAULT 1,
  effective_dietary_styles TEXT[] NOT NULL DEFAULT '{}'::text[],
  effective_has_blocked_policy BOOLEAN NOT NULL DEFAULT false,
  effective_has_unresolved_policy BOOLEAN NOT NULL DEFAULT false,
  effective_requires_clinical_review BOOLEAN NOT NULL DEFAULT false,
  effective_ingredient_count INTEGER NULL,
  validation_status TEXT NOT NULL DEFAULT 'draft',
  lifecycle_status TEXT NOT NULL DEFAULT 'active',
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

  CONSTRAINT recipe_configurations_recipe_version_positive
    CHECK (recipe_version >= 1),
  CONSTRAINT recipe_configurations_configuration_version_positive
    CHECK (configuration_version >= 1),
  CONSTRAINT recipe_configurations_variant_pair_coherent
    CHECK (
      (
        recipe_variant_id IS NULL
        AND recipe_variant_version IS NULL
      )
      OR
      (
        recipe_variant_id IS NOT NULL
        AND recipe_variant_version IS NOT NULL
        AND recipe_variant_version >= 1
      )
    ),
  CONSTRAINT recipe_configurations_effective_dietary_styles_valid
    CHECK (
      effective_dietary_styles <@ ARRAY[
        'omnivore',
        'pescatarian',
        'vegetarian',
        'vegan'
      ]::text[]
    ),
  CONSTRAINT recipe_configurations_effective_ingredient_count_valid
    CHECK (
      effective_ingredient_count IS NULL
      OR effective_ingredient_count >= 0
    ),
  CONSTRAINT recipe_configurations_validation_status_valid
    CHECK (validation_status IN ('draft', 'provisional', 'validated')),
  CONSTRAINT recipe_configurations_lifecycle_status_valid
    CHECK (lifecycle_status IN ('active', 'deprecated', 'archived')),
  CONSTRAINT recipe_configurations_nutrition_review_status_valid
    CHECK (nutrition_review_status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT recipe_configurations_clinical_review_status_valid
    CHECK (clinical_review_status IN ('not_required', 'pending', 'approved', 'rejected')),
  CONSTRAINT recipe_configurations_nutrition_reviewed_version_valid
    CHECK (
      nutrition_reviewed_version IS NULL
      OR (
        nutrition_reviewed_version >= 1
        AND nutrition_reviewed_version <= configuration_version
      )
    ),
  CONSTRAINT recipe_configurations_clinical_reviewed_version_valid
    CHECK (
      clinical_reviewed_version IS NULL
      OR (
        clinical_reviewed_version >= 1
        AND clinical_reviewed_version <= configuration_version
      )
    )
);

CREATE TABLE IF NOT EXISTS public.recipe_configuration_substitutions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_configuration_id UUID NOT NULL
    REFERENCES public.recipe_configurations(id)
    ON DELETE RESTRICT,
  recipe_allowed_substitution_id UUID NOT NULL
    REFERENCES public.recipe_allowed_substitutions(id)
    ON DELETE RESTRICT,
  substitution_version INTEGER NOT NULL,
  target_recipe_ingredient_id UUID NOT NULL
    REFERENCES public.recipe_ingredients(id)
    ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT recipe_configuration_substitutions_substitution_version_positive
    CHECK (substitution_version >= 1),
  CONSTRAINT recipe_configuration_substitutions_unique_target
    UNIQUE (recipe_configuration_id, target_recipe_ingredient_id)
);

CREATE INDEX IF NOT EXISTS idx_recipe_configurations_recipe_id
  ON public.recipe_configurations (recipe_id);

CREATE INDEX IF NOT EXISTS idx_recipe_configurations_recipe_variant_id
  ON public.recipe_configurations (recipe_variant_id);

CREATE INDEX IF NOT EXISTS idx_recipe_configurations_validation_lifecycle
  ON public.recipe_configurations (validation_status, lifecycle_status);

CREATE INDEX IF NOT EXISTS idx_recipe_configuration_substitutions_configuration_id
  ON public.recipe_configuration_substitutions (recipe_configuration_id);

CREATE INDEX IF NOT EXISTS idx_recipe_configuration_substitutions_allowed_substitution_id
  ON public.recipe_configuration_substitutions (recipe_allowed_substitution_id);

CREATE INDEX IF NOT EXISTS idx_recipe_configuration_substitutions_target_recipe_ingredient_id
  ON public.recipe_configuration_substitutions (target_recipe_ingredient_id);

ALTER TABLE public.recipe_configurations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recipe_configurations_read ON public.recipe_configurations;
CREATE POLICY recipe_configurations_read ON public.recipe_configurations
  FOR SELECT USING (true);

DROP POLICY IF EXISTS recipe_configurations_shared_write ON public.recipe_configurations;
CREATE POLICY recipe_configurations_shared_write ON public.recipe_configurations
  FOR ALL
  USING (app_shared_write_enabled())
  WITH CHECK (app_shared_write_enabled());

ALTER TABLE public.recipe_configuration_substitutions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recipe_configuration_substitutions_read ON public.recipe_configuration_substitutions;
CREATE POLICY recipe_configuration_substitutions_read ON public.recipe_configuration_substitutions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS recipe_configuration_substitutions_shared_write ON public.recipe_configuration_substitutions;
CREATE POLICY recipe_configuration_substitutions_shared_write ON public.recipe_configuration_substitutions
  FOR ALL
  USING (app_shared_write_enabled())
  WITH CHECK (app_shared_write_enabled());

COMMIT;
