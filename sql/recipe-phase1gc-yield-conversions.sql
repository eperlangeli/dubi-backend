-- DUBI Recipe Architecture Phase 1G-C — validated yield conversions.
-- Creates ingredient_yield_conversions only.
-- No conversion data or existing tables are modified.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ingredient_yield_conversions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ingredient_id INTEGER NOT NULL
    REFERENCES public.ingredients(id)
    ON DELETE RESTRICT,
  from_measurement_basis TEXT NOT NULL,
  to_measurement_basis TEXT NOT NULL,
  from_form TEXT NULL,
  to_form TEXT NULL,
  cooking_method TEXT NULL,
  yield_multiplier NUMERIC(10,6) NOT NULL,
  conversion_version INTEGER NOT NULL DEFAULT 1,
  validation_status TEXT NOT NULL DEFAULT 'draft',
  lifecycle_status TEXT NOT NULL DEFAULT 'active',
  validated_by TEXT NULL,
  validated_at TIMESTAMPTZ NULL,
  source TEXT NULL,
  source_version TEXT NULL,
  source_date DATE NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT ingredient_yield_conversions_from_basis_valid
    CHECK (from_measurement_basis IN ('raw', 'cooked', 'preserved')),
  CONSTRAINT ingredient_yield_conversions_to_basis_valid
    CHECK (to_measurement_basis IN ('raw', 'cooked', 'preserved')),
  CONSTRAINT ingredient_yield_conversions_from_form_valid
    CHECK (
      from_form IS NULL
      OR from_form IN ('fresh', 'frozen_natural', 'canned_natural', 'dried', 'processed')
    ),
  CONSTRAINT ingredient_yield_conversions_to_form_valid
    CHECK (
      to_form IS NULL
      OR to_form IN ('fresh', 'frozen_natural', 'canned_natural', 'dried', 'processed')
    ),
  CONSTRAINT ingredient_yield_conversions_cooking_method_valid
    CHECK (
      cooking_method IS NULL
      OR cooking_method ~ '^[a-z][a-z0-9_]*$'
    ),
  CONSTRAINT ingredient_yield_conversions_multiplier_positive
    CHECK (yield_multiplier > 0),
  CONSTRAINT ingredient_yield_conversions_actual_conversion
    CHECK (
      from_measurement_basis IS DISTINCT FROM to_measurement_basis
      OR from_form IS DISTINCT FROM to_form
      OR cooking_method IS NOT NULL
    ),
  CONSTRAINT ingredient_yield_conversions_version_positive
    CHECK (conversion_version >= 1),
  CONSTRAINT ingredient_yield_conversions_validation_status_valid
    CHECK (validation_status IN ('draft', 'provisional', 'validated')),
  CONSTRAINT ingredient_yield_conversions_lifecycle_status_valid
    CHECK (lifecycle_status IN ('active', 'deprecated', 'archived')),
  CONSTRAINT ingredient_yield_conversions_validated_row_complete
    CHECK (
      validation_status <> 'validated'
      OR (
        NULLIF(BTRIM(validated_by), '') IS NOT NULL
        AND validated_at IS NOT NULL
      )
    )
);

CREATE INDEX IF NOT EXISTS idx_ingredient_yield_conversions_ingredient_id
  ON public.ingredient_yield_conversions (ingredient_id);

CREATE INDEX IF NOT EXISTS idx_ingredient_yield_conversions_validation_lifecycle
  ON public.ingredient_yield_conversions (validation_status, lifecycle_status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ingredient_yield_conversions_unique_active
  ON public.ingredient_yield_conversions (
    ingredient_id,
    from_measurement_basis,
    to_measurement_basis,
    COALESCE(from_form, '<none>'),
    COALESCE(to_form, '<none>'),
    COALESCE(cooking_method, '<none>')
  )
  WHERE lifecycle_status = 'active';

ALTER TABLE public.ingredient_yield_conversions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ingredient_yield_conversions_read ON public.ingredient_yield_conversions;
CREATE POLICY ingredient_yield_conversions_read ON public.ingredient_yield_conversions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS ingredient_yield_conversions_shared_write ON public.ingredient_yield_conversions;
CREATE POLICY ingredient_yield_conversions_shared_write ON public.ingredient_yield_conversions
  FOR ALL
  USING (app_shared_write_enabled())
  WITH CHECK (app_shared_write_enabled());

COMMIT;
