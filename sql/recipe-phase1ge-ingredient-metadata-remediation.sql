-- DUBI Recipe Architecture Phase 1G-E — deterministic ingredient metadata remediation.
-- Data patch only.
-- No schema, nutrition, allergen, clinical, provenance, edible portion, incompatibility, or yield-conversion data is modified.

BEGIN;

UPDATE public.ingredients
SET raw_or_cooked = 'cooked'
WHERE id = 6
  AND raw_or_cooked = 'raw';

UPDATE public.ingredients
SET freshness_form = 'canned_natural'
WHERE id = 6
  AND freshness_form = 'fresh';

UPDATE public.ingredients
SET raw_or_cooked = 'cooked'
WHERE id = 67
  AND raw_or_cooked = 'raw';

UPDATE public.ingredients
SET freshness_form = 'dried'
WHERE id = 102
  AND freshness_form = 'fresh';

UPDATE public.ingredients
SET template_slots = ARRAY['carb_complex']::TEXT[]
WHERE id = 199
  AND template_slots = ARRAY['grain']::TEXT[];

UPDATE public.ingredients
SET template_slots = ARRAY['carb_complex']::TEXT[]
WHERE id = 200
  AND template_slots = ARRAY['grain']::TEXT[];

UPDATE public.ingredients
SET raw_or_cooked = 'cooked'
WHERE id = 210
  AND raw_or_cooked = 'raw';

UPDATE public.ingredients
SET freshness_form = 'canned_natural'
WHERE id = 210
  AND freshness_form = 'fresh';

UPDATE public.ingredients
SET template_slots = ARRAY['protein', 'carb_complex']::TEXT[]
WHERE id = 213
  AND template_slots = ARRAY['legume']::TEXT[];

UPDATE public.ingredients
SET template_slots = ARRAY['protein', 'carb_complex']::TEXT[]
WHERE id = 214
  AND template_slots = ARRAY['legume']::TEXT[];

UPDATE public.ingredients
SET template_slots = ARRAY['protein', 'carb_complex']::TEXT[]
WHERE id = 216
  AND template_slots = ARRAY['legume']::TEXT[];

UPDATE public.ingredients
SET freshness_form = 'dried'
WHERE id = 219
  AND freshness_form = 'fresh';

UPDATE public.ingredients
SET freshness_form = 'dried'
WHERE id = 231
  AND freshness_form = 'fresh';

UPDATE public.ingredients
SET freshness_form = 'dried'
WHERE id = 272
  AND freshness_form = 'fresh';

SELECT
  id,
  name,
  raw_or_cooked,
  freshness_form,
  template_slots
FROM public.ingredients
WHERE id IN (6, 67, 102, 199, 200, 210, 213, 214, 216, 219, 231, 272)
ORDER BY id;

COMMIT;
