-- DUBI Recipe Architecture Phase 1B — recipe definitions.
-- Creates recipe_definitions only.
-- Legacy public.recipes is untouched.

BEGIN;

CREATE TABLE IF NOT EXISTS public.recipe_definitions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  recipe_format_id UUID NOT NULL
    REFERENCES public.recipe_formats(id)
    ON DELETE RESTRICT,
  cuisine_family_id UUID NULL
    REFERENCES public.cuisine_families(id)
    ON DELETE RESTRICT,
  description TEXT NULL,
  eligible_meal_types TEXT[] NOT NULL,
  dietary_styles TEXT[] NOT NULL DEFAULT '{}'::text[],
  difficulty TEXT NOT NULL,
  prep_time_min INTEGER NOT NULL,
  cook_time_min INTEGER NOT NULL,
  total_time_min INTEGER
    GENERATED ALWAYS AS (prep_time_min + cook_time_min) STORED,
  time_class TEXT
    GENERATED ALWAYS AS (
      CASE
        WHEN prep_time_min + cook_time_min <= 15 THEN 'quick'
        WHEN prep_time_min + cook_time_min <= 30 THEN 'medium'
        ELSE 'long'
      END
    ) STORED,
  ingredient_count_excluding_water_spices INTEGER NULL,
  instructions_steps JSONB NOT NULL,
  equipment TEXT[] NULL,
  transportable BOOLEAN NOT NULL DEFAULT false,
  breakfast_style TEXT NULL,
  base_servings INTEGER NOT NULL DEFAULT 1,
  meal_prep_compatible BOOLEAN NULL,
  storage_fridge_days INTEGER NULL,
  storage_freezer_days INTEGER NULL,
  reheating_method TEXT NULL,
  budget_tier TEXT NULL,
  validation_status TEXT NOT NULL DEFAULT 'draft',
  lifecycle_status TEXT NOT NULL DEFAULT 'active',
  recipe_version INTEGER NOT NULL DEFAULT 1,
  base_has_blocked_policy BOOLEAN NOT NULL DEFAULT false,
  base_has_unresolved_policy BOOLEAN NOT NULL DEFAULT false,
  base_requires_clinical_review BOOLEAN NOT NULL DEFAULT false,
  nutrition_reviewer TEXT NULL,
  nutrition_review_status TEXT NOT NULL DEFAULT 'pending',
  nutrition_review_date TIMESTAMPTZ NULL,
  nutrition_reviewed_version INTEGER NULL,
  clinical_reviewer TEXT NULL,
  clinical_review_status TEXT NOT NULL DEFAULT 'not_required',
  clinical_review_date TIMESTAMPTZ NULL,
  clinical_reviewed_version INTEGER NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT recipe_definitions_name_nonempty
    CHECK (NULLIF(BTRIM(name), '') IS NOT NULL),
  CONSTRAINT recipe_definitions_eligible_meal_types_valid
    CHECK (
      cardinality(eligible_meal_types) >= 1
      AND eligible_meal_types <@ ARRAY[
        'breakfast',
        'snack',
        'lunch',
        'dinner',
        'pre_workout',
        'post_workout'
      ]::text[]
    ),
  CONSTRAINT recipe_definitions_dietary_styles_valid
    CHECK (
      dietary_styles <@ ARRAY[
        'omnivore',
        'pescatarian',
        'vegetarian',
        'vegan'
      ]::text[]
    ),
  CONSTRAINT recipe_definitions_equipment_valid
    CHECK (
      equipment IS NULL
      OR equipment <@ ARRAY[
        'stovetop',
        'oven',
        'microwave',
        'blender',
        'air_fryer',
        'none'
      ]::text[]
    ),
  CONSTRAINT recipe_definitions_equipment_none_exclusive
    CHECK (
      equipment IS NULL
      OR NOT ('none' = ANY(equipment))
      OR cardinality(equipment) = 1
    ),
  CONSTRAINT recipe_definitions_difficulty_valid
    CHECK (difficulty IN ('easy', 'medium')),
  CONSTRAINT recipe_definitions_prep_time_nonnegative
    CHECK (prep_time_min >= 0),
  CONSTRAINT recipe_definitions_cook_time_nonnegative
    CHECK (cook_time_min >= 0),
  CONSTRAINT recipe_definitions_ingredient_count_nonnegative
    CHECK (
      ingredient_count_excluding_water_spices IS NULL
      OR ingredient_count_excluding_water_spices >= 0
    ),
  CONSTRAINT recipe_definitions_instructions_steps_valid
    CHECK (
      jsonb_typeof(instructions_steps) = 'array'
      AND jsonb_array_length(instructions_steps) BETWEEN 3 AND 5
    ),
  CONSTRAINT recipe_definitions_breakfast_style_valid
    CHECK (
      breakfast_style IS NULL
      OR breakfast_style IN ('sweet', 'savory', 'both', 'not_applicable')
    ),
  CONSTRAINT recipe_definitions_base_servings_one
    CHECK (base_servings = 1),
  CONSTRAINT recipe_definitions_storage_fridge_days_positive
    CHECK (
      storage_fridge_days IS NULL
      OR storage_fridge_days > 0
    ),
  CONSTRAINT recipe_definitions_storage_freezer_days_positive
    CHECK (
      storage_freezer_days IS NULL
      OR storage_freezer_days > 0
    ),
  CONSTRAINT recipe_definitions_reheating_method_valid
    CHECK (
      reheating_method IS NULL
      OR reheating_method IN ('microwave', 'stovetop', 'oven', 'none')
    ),
  CONSTRAINT recipe_definitions_budget_tier_valid
    CHECK (
      budget_tier IS NULL
      OR budget_tier IN ('budget', 'moderate', 'premium')
    ),
  CONSTRAINT recipe_definitions_validation_status_valid
    CHECK (validation_status IN ('draft', 'provisional', 'validated')),
  CONSTRAINT recipe_definitions_lifecycle_status_valid
    CHECK (lifecycle_status IN ('active', 'deprecated', 'archived')),
  CONSTRAINT recipe_definitions_recipe_version_positive
    CHECK (recipe_version >= 1),
  CONSTRAINT recipe_definitions_nutrition_review_status_valid
    CHECK (nutrition_review_status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT recipe_definitions_clinical_review_status_valid
    CHECK (clinical_review_status IN ('not_required', 'pending', 'approved', 'rejected')),
  CONSTRAINT recipe_definitions_nutrition_reviewed_version_valid
    CHECK (
      nutrition_reviewed_version IS NULL
      OR (
        nutrition_reviewed_version >= 1
        AND nutrition_reviewed_version <= recipe_version
      )
    ),
  CONSTRAINT recipe_definitions_clinical_reviewed_version_valid
    CHECK (
      clinical_reviewed_version IS NULL
      OR (
        clinical_reviewed_version >= 1
        AND clinical_reviewed_version <= recipe_version
      )
    )
);

CREATE INDEX IF NOT EXISTS idx_recipe_definitions_recipe_format_id
  ON public.recipe_definitions (recipe_format_id);

CREATE INDEX IF NOT EXISTS idx_recipe_definitions_cuisine_family_id
  ON public.recipe_definitions (cuisine_family_id);

CREATE INDEX IF NOT EXISTS idx_recipe_definitions_validation_lifecycle
  ON public.recipe_definitions (validation_status, lifecycle_status);

CREATE INDEX IF NOT EXISTS idx_recipe_definitions_eligible_meal_types
  ON public.recipe_definitions USING GIN (eligible_meal_types);

CREATE INDEX IF NOT EXISTS idx_recipe_definitions_dietary_styles
  ON public.recipe_definitions USING GIN (dietary_styles);

ALTER TABLE public.recipe_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recipe_definitions_read ON public.recipe_definitions;
CREATE POLICY recipe_definitions_read ON public.recipe_definitions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS recipe_definitions_shared_write ON public.recipe_definitions;
CREATE POLICY recipe_definitions_shared_write ON public.recipe_definitions
  FOR ALL
  USING (app_shared_write_enabled())
  WITH CHECK (app_shared_write_enabled());

COMMIT;
