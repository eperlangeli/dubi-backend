-- DUBI Task 9 - Non-superuser database role for Render.
-- Run this from Supabase SQL Editor as the postgres/project owner role.
-- Then update Render DATABASE_URL manually to use dubi_app, not postgres.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dubi_app') THEN
    CREATE ROLE dubi_app LOGIN PASSWORD 'CHANGE_ME_WITH_A_LONG_RANDOM_PASSWORD';
  END IF;
END
$$;

ALTER ROLE dubi_app
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOREPLICATION
  NOBYPASSRLS;

GRANT CONNECT ON DATABASE postgres TO dubi_app;
GRANT USAGE ON SCHEMA public TO dubi_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dubi_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO dubi_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO dubi_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dubi_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO dubi_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO dubi_app;

ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE user_onboarding FORCE ROW LEVEL SECURITY;
ALTER TABLE wearable_data FORCE ROW LEVEL SECURITY;
ALTER TABLE openwearables_connections FORCE ROW LEVEL SECURITY;
ALTER TABLE user_plans FORCE ROW LEVEL SECURITY;
ALTER TABLE user_progress FORCE ROW LEVEL SECURITY;
ALTER TABLE recipes FORCE ROW LEVEL SECURITY;
ALTER TABLE nutrition_ingredient_refs FORCE ROW LEVEL SECURITY;
ALTER TABLE recipe_nutrition_audits FORCE ROW LEVEL SECURITY;
ALTER TABLE weight_history FORCE ROW LEVEL SECURITY;
ALTER TABLE adherence FORCE ROW LEVEL SECURITY;
ALTER TABLE nps_responses FORCE ROW LEVEL SECURITY;
ALTER TABLE user_ingredient_swaps FORCE ROW LEVEL SECURITY;
ALTER TABLE user_anomaly_events FORCE ROW LEVEL SECURITY;

-- Render DATABASE_URL template:
-- postgresql://dubi_app:<URL_ENCODED_PASSWORD>@db.cfxtqnbfgsufpmzlxdca.supabase.co:5432/postgres?sslmode=require

-- Verification query 1: run as postgres/project owner.
SELECT
  rolname,
  rolsuper,
  rolcreaterole,
  rolcreatedb,
  rolreplication,
  rolbypassrls
FROM pg_roles
WHERE rolname = 'dubi_app';

-- Verification query 2: run through the Render connection after DATABASE_URL is changed.
SELECT current_user;
SHOW row_security;

-- Verification query 3: confirm RLS is enabled and forced on protected tables.
SELECT
  schemaname,
  tablename,
  rowsecurity,
  forcerowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'users',
    'user_onboarding',
    'wearable_data',
    'openwearables_connections',
    'user_plans',
    'user_progress',
    'recipes',
    'nutrition_ingredient_refs',
    'recipe_nutrition_audits',
    'weight_history',
    'adherence',
    'nps_responses',
    'user_ingredient_swaps',
    'user_anomaly_events'
  )
ORDER BY tablename;

-- Verification query 4: confirm policies exist.
SELECT
  schemaname,
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Verification query 5: run as dubi_app with a real user id.
-- Replace 1 with a valid users.id; rows for other users must not be visible.
SELECT set_config('app.current_user_id', '1', false);
SELECT COUNT(*) AS other_users_visible
FROM user_onboarding
WHERE user_id <> 1;
