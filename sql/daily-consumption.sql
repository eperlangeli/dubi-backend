-- DUBI - Daily consumed macros tracking.
-- Run before deploying backend code that uses /api/plan/consumption/*.

BEGIN;

CREATE TABLE IF NOT EXISTS public.daily_consumption (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  meal_type TEXT NOT NULL CHECK (meal_type IN (
    'breakfast',
    'lunch',
    'dinner',
    'snack',
    'pre_workout',
    'post_workout'
  )),
  ingredients_json JSONB DEFAULT '[]'::jsonb,
  total_calories NUMERIC DEFAULT 0,
  total_protein NUMERIC DEFAULT 0,
  total_carbs NUMERIC DEFAULT 0,
  total_fat NUMERIC DEFAULT 0,
  logged_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date, meal_type)
);

CREATE INDEX IF NOT EXISTS idx_daily_consumption_user_date
  ON public.daily_consumption(user_id, date DESC);

ALTER TABLE public.daily_consumption ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_consumption FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS daily_consumption_isolation ON public.daily_consumption;
CREATE POLICY daily_consumption_isolation ON public.daily_consumption
  FOR ALL USING (user_id = current_setting('app.current_user_id', true)::integer)
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::integer);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dubi_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON public.daily_consumption
      TO dubi_app;
  END IF;
END
$$;

COMMIT;
