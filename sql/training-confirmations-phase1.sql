-- DUBI v1.2 Phase 1 - Training week plans and daily confirmations.
-- Run before deploying backend code that mounts /api/training.

BEGIN;

CREATE TABLE IF NOT EXISTS public.training_week_plans (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  planned_days JSONB,
  source TEXT DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, week_start)
);

CREATE TABLE IF NOT EXISTS public.training_confirmations (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  planned BOOLEAN,
  status TEXT CHECK (status IN (
    'confirmed_yes',
    'confirmed_no',
    'detected_wearable',
    'unconfirmed'
  )),
  training_time_slot TEXT,
  training_sport TEXT,
  answered_at TIMESTAMPTZ,
  detected_strain NUMERIC,
  detected_duration_min INTEGER,
  detected_active_kcal INTEGER,
  UNIQUE (user_id, day)
);

CREATE INDEX IF NOT EXISTS idx_training_week_plans_user_week
  ON public.training_week_plans(user_id, week_start DESC);

CREATE INDEX IF NOT EXISTS idx_training_confirmations_user_day
  ON public.training_confirmations(user_id, day DESC);

ALTER TABLE public.training_week_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_week_plans FORCE ROW LEVEL SECURITY;
ALTER TABLE public.training_confirmations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS training_week_plans_isolation ON public.training_week_plans;
CREATE POLICY training_week_plans_isolation ON public.training_week_plans
  FOR ALL USING (user_id = current_setting('app.current_user_id', true)::integer)
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::integer);

DROP POLICY IF EXISTS training_confirmations_isolation ON public.training_confirmations;
CREATE POLICY training_confirmations_isolation ON public.training_confirmations
  FOR ALL USING (user_id = current_setting('app.current_user_id', true)::integer)
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::integer);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dubi_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON public.training_week_plans, public.training_confirmations
      TO dubi_app;

    GRANT USAGE, SELECT
      ON SEQUENCE public.training_week_plans_id_seq,
                  public.training_confirmations_id_seq
      TO dubi_app;
  END IF;
END
$$;

COMMIT;
