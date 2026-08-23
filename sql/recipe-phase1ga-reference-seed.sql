-- DUBI Recipe Architecture Phase 1G-A — controlled reference seed.
-- Seeds recipe_formats and cuisine_families only.
-- No table definitions or legacy recipe rows are modified.

BEGIN;

INSERT INTO public.recipe_formats (code, label, is_active, updated_at)
VALUES
  ('plated_meal', 'Plated meal', true, now()),
  ('bowl', 'Bowl', true, now()),
  ('salad', 'Salad', true, now()),
  ('sandwich_wrap', 'Sandwich / wrap', true, now()),
  ('soup_stew', 'Soup / stew', true, now()),
  ('smoothie', 'Smoothie', true, now()),
  ('drink', 'Drink', true, now()),
  ('handheld', 'Handheld', true, now())
ON CONFLICT (code) DO UPDATE
SET
  label = EXCLUDED.label,
  is_active = EXCLUDED.is_active,
  updated_at = EXCLUDED.updated_at;

INSERT INTO public.cuisine_families (code, label, is_active, updated_at)
VALUES
  ('italian', 'Italian', true, now()),
  ('mediterranean', 'Mediterranean', true, now()),
  ('asian_inspired', 'Asian-inspired', true, now()),
  ('middle_eastern', 'Middle Eastern', true, now()),
  ('latin_inspired', 'Latin-inspired', true, now()),
  ('neutral', 'Neutral / no specific cuisine', true, now())
ON CONFLICT (code) DO UPDATE
SET
  label = EXCLUDED.label,
  is_active = EXCLUDED.is_active,
  updated_at = EXCLUDED.updated_at;

COMMIT;
