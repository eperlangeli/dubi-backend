-- Research pipeline type alignment for textual onboarding ranges.
-- Run before deploying backend code that writes daily_steps as its original band
-- value (for example "6000-8000") instead of an integer estimate.

BEGIN;

ALTER TABLE public.research_data_snapshots
  ALTER COLUMN daily_steps TYPE TEXT USING daily_steps::text,
  ALTER COLUMN workout_duration TYPE TEXT USING workout_duration::text;

ALTER TABLE public.research_longitudinal
  ALTER COLUMN daily_steps TYPE TEXT USING daily_steps::text,
  ALTER COLUMN workout_duration TYPE TEXT USING workout_duration::text;

COMMIT;
