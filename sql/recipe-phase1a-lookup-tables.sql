-- DUBI Recipe Architecture Phase 1A — lookup tables.
-- Creates recipe_formats and cuisine_families.
-- Run once in the Supabase SQL Editor before any Phase 1B recipe-core tables.
-- No existing tables are modified. public.recipes is untouched.

BEGIN;

CREATE TABLE IF NOT EXISTS public.recipe_formats (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code       TEXT        NOT NULL UNIQUE,
  label      TEXT        NOT NULL,
  is_active  BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT recipe_formats_code_nonempty
    CHECK (NULLIF(BTRIM(code), '') IS NOT NULL),
  CONSTRAINT recipe_formats_label_nonempty
    CHECK (NULLIF(BTRIM(label), '') IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_recipe_formats_active
  ON public.recipe_formats (is_active);

CREATE TABLE IF NOT EXISTS public.cuisine_families (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code       TEXT        NOT NULL UNIQUE,
  label      TEXT        NOT NULL,
  is_active  BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT cuisine_families_code_nonempty
    CHECK (NULLIF(BTRIM(code), '') IS NOT NULL),
  CONSTRAINT cuisine_families_label_nonempty
    CHECK (NULLIF(BTRIM(label), '') IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_cuisine_families_active
  ON public.cuisine_families (is_active);

ALTER TABLE public.recipe_formats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cuisine_families ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recipe_formats_read ON public.recipe_formats;
CREATE POLICY recipe_formats_read ON public.recipe_formats
  FOR SELECT USING (true);

DROP POLICY IF EXISTS recipe_formats_shared_write ON public.recipe_formats;
CREATE POLICY recipe_formats_shared_write ON public.recipe_formats
  FOR ALL
  USING (app_shared_write_enabled())
  WITH CHECK (app_shared_write_enabled());

DROP POLICY IF EXISTS cuisine_families_read ON public.cuisine_families;
CREATE POLICY cuisine_families_read ON public.cuisine_families
  FOR SELECT USING (true);

DROP POLICY IF EXISTS cuisine_families_shared_write ON public.cuisine_families;
CREATE POLICY cuisine_families_shared_write ON public.cuisine_families
  FOR ALL
  USING (app_shared_write_enabled())
  WITH CHECK (app_shared_write_enabled());

COMMIT;
