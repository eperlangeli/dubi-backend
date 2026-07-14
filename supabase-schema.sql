-- DUBI Supabase schema alignment - FASE 1
-- Current production-compatible version.
-- It preserves the existing custom JWT auth model: public.users.id is integer.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  date_of_birth DATE,
  age INT,
  weight DOUBLE PRECISION,
  height INT,
  goal VARCHAR(50),
  is_minor BOOLEAN NOT NULL DEFAULT false,
  guardian_name TEXT,
  guardian_email TEXT,
  parental_consent_status TEXT NOT NULL DEFAULT 'not_required'
    CHECK (parental_consent_status IN ('not_required', 'pending', 'approved', 'expired', 'denied')),
  parental_consent_token TEXT,
  parental_consent_token_expires_at TIMESTAMPTZ,
  parental_consent_verified_at TIMESTAMPTZ,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_minor BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS guardian_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS guardian_email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS parental_consent_status TEXT NOT NULL DEFAULT 'not_required'
  CHECK (parental_consent_status IN ('not_required', 'pending', 'approved', 'expired', 'denied'));
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_parental_consent_status_check;
ALTER TABLE users ADD CONSTRAINT users_parental_consent_status_check
  CHECK (parental_consent_status IN ('not_required', 'pending', 'approved', 'expired', 'denied'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS parental_consent_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS parental_consent_token_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS parental_consent_verified_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS user_onboarding (
  id SERIAL PRIMARY KEY,
  user_id INT UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100),
  gender VARCHAR(50),
  age INT,
  height NUMERIC,
  weight NUMERIC,
  goal VARCHAR(50),
  target_weight NUMERIC,
  target_body_fat NUMERIC,
  competition_sport VARCHAR(100),
  competition_date DATE,
  occupation VARCHAR(100),
  workout_days INT,
  workout_duration VARCHAR(50),
  workout_intensity VARCHAR(50),
  daily_steps VARCHAR(50),
  sedentary_days INT,
  diet VARCHAR(50),
  diet_intensity VARCHAR(50) DEFAULT 'balanced',
  allergies TEXT,
  sport VARCHAR(100),
  training_time VARCHAR(50),
  breakfast_pref VARCHAR(50),
  day_start TIME,
  day_end TIME,
  wearable_provider VARCHAR(50),
  terms_accepted BOOLEAN DEFAULT FALSE,
  privacy_accepted BOOLEAN DEFAULT FALSE,
  health_data_consent BOOLEAN DEFAULT FALSE,
  wearable_consent BOOLEAN DEFAULT FALSE,
  research_consent BOOLEAN DEFAULT FALSE,
  privacy_policy_version VARCHAR(100),
  terms_version VARCHAR(100),
  health_disclaimer_version VARCHAR(100),
  wearable_policy_version VARCHAR(100),
  research_policy_version VARCHAR(100),
  legal_accepted_at TIMESTAMP,
  health_data_consent_at TIMESTAMP,
  wearable_consent_at TIMESTAMPTZ,
  research_consent_at TIMESTAMPTZ,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS name VARCHAR(100);
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS gender VARCHAR(50);
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS age INT;
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS height NUMERIC;
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS weight NUMERIC;
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS goal VARCHAR(50);
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS target_weight NUMERIC;
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS target_body_fat NUMERIC;
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS competition_sport VARCHAR(100);
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS competition_date DATE;
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS occupation VARCHAR(100);
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS workout_days INT;
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS workout_duration VARCHAR(50);
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS workout_intensity VARCHAR(50);
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS daily_steps VARCHAR(50);
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS sedentary_days INT;
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS diet VARCHAR(50);
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS diet_intensity VARCHAR(50) DEFAULT 'balanced';
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS allergies TEXT;
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS sport VARCHAR(100);
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS training_time VARCHAR(50);
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS breakfast_pref VARCHAR(50);
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS day_start TIME;
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS day_end TIME;
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS wearable_provider VARCHAR(50);
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN DEFAULT FALSE;
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS privacy_accepted BOOLEAN DEFAULT FALSE;
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS health_data_consent BOOLEAN DEFAULT FALSE;
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS wearable_consent BOOLEAN DEFAULT FALSE;
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS research_consent BOOLEAN DEFAULT FALSE;
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS privacy_policy_version VARCHAR(100);
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS terms_version VARCHAR(100);
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS health_disclaimer_version VARCHAR(100);
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS wearable_policy_version VARCHAR(100);
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS research_policy_version VARCHAR(100);
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS legal_accepted_at TIMESTAMP;
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS health_data_consent_at TIMESTAMP;
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS wearable_consent_at TIMESTAMPTZ;
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS research_consent_at TIMESTAMPTZ;
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS training_week_plans (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  planned_days JSONB,
  source TEXT DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, week_start)
);

CREATE TABLE IF NOT EXISTS training_confirmations (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
  ON training_week_plans(user_id, week_start DESC);

CREATE INDEX IF NOT EXISTS idx_training_confirmations_user_day
  ON training_confirmations(user_id, day DESC);

DO $$
BEGIN
  IF to_regclass('public.research_data_snapshots') IS NOT NULL THEN
    ALTER TABLE public.research_data_snapshots
      DROP CONSTRAINT IF EXISTS valid_snapshot_reason;

    ALTER TABLE public.research_data_snapshots
      ADD CONSTRAINT valid_snapshot_reason
      CHECK (reason IN (
        'onboarding',
        'onboarding_update',
        'consent_granted',
        'consent_revoked',
        'account_deleted'
      ));
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS wearable_data (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weight DOUBLE PRECISION,
  activity_kcal INT,
  steps INT,
  heart_rate INT,
  hrv INT,
  sleep_hours DOUBLE PRECISION,
  sleep_duration DOUBLE PRECISION,
  sleep_quality VARCHAR(20),
  recovery_score INT,
  data_date DATE,
  synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS openwearables_connections (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  openwearables_user_id UUID NOT NULL,
  provider VARCHAR(50),
  status VARCHAR(50) DEFAULT 'created',
  last_synced_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS user_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  calories INT,
  protein INT,
  carbs INT,
  fat INT,
  meals_count INT,
  goal VARCHAR(50),
  plan_json JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weight NUMERIC,
  calories_consumed INT,
  meals_completed INT,
  meals_total INT,
  adherence_percent INT,
  note TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_ingredient_swaps (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  swap_key VARCHAR(120) NOT NULL,
  day_index INTEGER,
  meal_key VARCHAR(80),
  item_index INTEGER,
  original_ingredient TEXT,
  replacement_ingredient TEXT,
  had_at_home BOOLEAN,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, swap_key)
);

CREATE TABLE IF NOT EXISTS user_anomaly_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  anomaly_type VARCHAR(80) NOT NULL,
  metric VARCHAR(50),
  current_value NUMERIC,
  baseline_value NUMERIC,
  delta_percent NUMERIC,
  user_attribution VARCHAR(80),
  user_note TEXT,
  nutrition_related BOOLEAN,
  action VARCHAR(80) NOT NULL DEFAULT 'monitor',
  excluded_from_regeneration BOOLEAN DEFAULT FALSE,
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  serving_size VARCHAR(100),
  calories INT NOT NULL,
  protein INT NOT NULL,
  carbs INT NOT NULL,
  fats INT NOT NULL,
  fiber INT DEFAULT 0,
  satiety_score NUMERIC DEFAULT 5.0,
  nutrient_density NUMERIC DEFAULT 5.0,
  processing_level VARCHAR(50) DEFAULT 'minimally_processed',
  glycemic_index INT DEFAULT 50,
  recovery_support NUMERIC DEFAULT 5.0,
  meal_type VARCHAR(50)[],
  cuisine VARCHAR(50),
  prep_time_minutes INT,
  cost_level VARCHAR(20),
  difficulty VARCHAR(20),
  sodium_level VARCHAR(20) DEFAULT 'medium',
  added_sugar_level VARCHAR(20) DEFAULT 'low',
  meal_goal_tags VARCHAR(50)[],
  avoid_if VARCHAR(50)[],
  diet_compatibility VARCHAR(50)[] DEFAULT ARRAY['omnivore'],
  allergens VARCHAR(50)[],
  is_seasonal BOOLEAN DEFAULT FALSE,
  seasons VARCHAR(50)[],
  ingredients JSONB DEFAULT '[]'::jsonb,
  scientific_source VARCHAR(255),
  evidence_level VARCHAR(20) DEFAULT 'medium',
  nutrition_audit_status VARCHAR(40) DEFAULT 'pending',
  nutrition_confidence_score INT DEFAULT 50,
  nutrition_source_ids VARCHAR(80)[] DEFAULT ARRAY[]::varchar[],
  nutrition_audit_payload JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nutrition_ingredient_refs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_key VARCHAR(160) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  source_id VARCHAR(80) NOT NULL,
  source_food_id VARCHAR(120),
  source_food_name TEXT,
  locale VARCHAR(20) DEFAULT 'global',
  preparation_state VARCHAR(80),
  calories_per_100g NUMERIC,
  protein_per_100g NUMERIC,
  carbs_per_100g NUMERIC,
  fats_per_100g NUMERIC,
  fiber_per_100g NUMERIC,
  confidence_score INT DEFAULT 50,
  source_payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(ingredient_key, source_id, source_food_id, preparation_state)
);

CREATE TABLE IF NOT EXISTS recipe_nutrition_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
  recipe_name VARCHAR(255),
  declared_calories INT,
  calculated_calories INT,
  calorie_delta INT,
  declared_protein NUMERIC,
  calculated_protein NUMERIC,
  declared_carbs NUMERIC,
  calculated_carbs NUMERIC,
  declared_fats NUMERIC,
  calculated_fats NUMERIC,
  confidence_score INT DEFAULT 50,
  status VARCHAR(40) DEFAULT 'pending',
  source_ids VARCHAR(80)[],
  notes TEXT,
  audit_payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS weight_history (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weight DOUBLE PRECISION NOT NULL,
  logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS adherence (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  completed BOOLEAN,
  logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS nps_responses (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score INT NOT NULL,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_user_onboarding_user ON user_onboarding(user_id);
CREATE INDEX IF NOT EXISTS idx_user_plans_user_created ON user_plans(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_progress_user_created ON user_progress(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_ingredient_swaps_user ON user_ingredient_swaps(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_anomaly_events_user_created ON user_anomaly_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_anomaly_events_action ON user_anomaly_events(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_weight_history_user_logged ON weight_history(user_id, logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_adherence_user_date ON adherence(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_recipes_meal_type ON recipes USING GIN(meal_type);
CREATE INDEX IF NOT EXISTS idx_recipes_diet ON recipes USING GIN(diet_compatibility);
CREATE INDEX IF NOT EXISTS idx_recipes_allergens ON recipes USING GIN(allergens);
CREATE INDEX IF NOT EXISTS idx_recipes_goal_tags ON recipes USING GIN(meal_goal_tags);
CREATE INDEX IF NOT EXISTS idx_nutrition_refs_key ON nutrition_ingredient_refs(ingredient_key);
CREATE INDEX IF NOT EXISTS idx_nutrition_refs_source ON nutrition_ingredient_refs(source_id);
CREATE INDEX IF NOT EXISTS idx_recipe_audits_recipe ON recipe_nutrition_audits(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_audits_status ON recipe_nutrition_audits(status);

ALTER TABLE recipes ADD COLUMN IF NOT EXISTS prep_time_minutes INT;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS cost_level VARCHAR(20);
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS difficulty VARCHAR(20);
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS sodium_level VARCHAR(20) DEFAULT 'medium';
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS added_sugar_level VARCHAR(20) DEFAULT 'low';
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS meal_goal_tags VARCHAR(50)[];
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS avoid_if VARCHAR(50)[];
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS nutrition_audit_status VARCHAR(40) DEFAULT 'pending';
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS nutrition_confidence_score INT DEFAULT 50;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS nutrition_source_ids VARCHAR(80)[] DEFAULT ARRAY[]::varchar[];
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS nutrition_audit_payload JSONB DEFAULT '{}'::jsonb;
ALTER TABLE wearable_data ADD COLUMN IF NOT EXISTS sleep_duration DOUBLE PRECISION;
ALTER TABLE wearable_data ADD COLUMN IF NOT EXISTS recovery_score INT;
ALTER TABLE wearable_data ADD COLUMN IF NOT EXISTS data_date DATE;
ALTER TABLE openwearables_connections ADD COLUMN IF NOT EXISTS provider VARCHAR(50);
ALTER TABLE openwearables_connections ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'created';
ALTER TABLE openwearables_connections ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP;
ALTER TABLE user_onboarding ADD COLUMN IF NOT EXISTS diet_intensity VARCHAR(50) DEFAULT 'balanced';
ALTER TABLE nps_responses ADD COLUMN IF NOT EXISTS comment TEXT;
ALTER TABLE nps_responses ADD COLUMN IF NOT EXISTS context VARCHAR(50) DEFAULT 'beta_settings';

CREATE INDEX IF NOT EXISTS idx_wearable_data_user_synced ON wearable_data(user_id, synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_wearable_data_user_date ON wearable_data(user_id, data_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wearable_data_user_date_unique ON wearable_data(user_id, data_date);
CREATE INDEX IF NOT EXISTS idx_openwearables_connections_user ON openwearables_connections(user_id);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_onboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE wearable_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE openwearables_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE nutrition_ingredient_refs ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_nutrition_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE weight_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE adherence ENABLE ROW LEVEL SECURITY;
ALTER TABLE nps_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_ingredient_swaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_anomaly_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_week_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_week_plans FORCE ROW LEVEL SECURITY;
ALTER TABLE training_confirmations FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION app_shared_write_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT current_setting('app.allow_shared_write', true) = 'true';
$$;

CREATE OR REPLACE FUNCTION app_registration_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT current_setting('app.allow_registration', true) = 'true';
$$;

CREATE OR REPLACE FUNCTION app_parental_consent_verify_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT current_setting('app.allow_parental_consent_verify', true) = 'true';
$$;

DROP POLICY IF EXISTS users_isolation ON users;
CREATE POLICY users_isolation ON users
  FOR SELECT USING (id = current_setting('app.current_user_id', true)::integer);

DROP POLICY IF EXISTS users_register_insert ON users;
CREATE POLICY users_register_insert ON users
  FOR INSERT WITH CHECK (app_registration_enabled());

DROP POLICY IF EXISTS users_update_self ON users;
CREATE POLICY users_update_self ON users
  FOR UPDATE USING (id = current_setting('app.current_user_id', true)::integer)
  WITH CHECK (id = current_setting('app.current_user_id', true)::integer);

DROP POLICY IF EXISTS users_delete_self ON users;
CREATE POLICY users_delete_self ON users
  FOR DELETE USING (id = current_setting('app.current_user_id', true)::integer);

DROP POLICY IF EXISTS users_parental_consent_verify_select ON users;
CREATE POLICY users_parental_consent_verify_select ON users
  FOR SELECT USING (
    app_parental_consent_verify_enabled()
    AND parental_consent_token IS NOT NULL
  );

DROP POLICY IF EXISTS users_parental_consent_verify_update ON users;
CREATE POLICY users_parental_consent_verify_update ON users
  FOR UPDATE USING (
    app_parental_consent_verify_enabled()
    AND parental_consent_token IS NOT NULL
  )
  WITH CHECK (app_parental_consent_verify_enabled());

DROP POLICY IF EXISTS user_onboarding_isolation ON user_onboarding;
CREATE POLICY user_onboarding_isolation ON user_onboarding
  FOR ALL USING (user_id = current_setting('app.current_user_id', true)::integer)
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::integer);

DROP POLICY IF EXISTS wearable_data_isolation ON wearable_data;
CREATE POLICY wearable_data_isolation ON wearable_data
  FOR ALL USING (user_id = current_setting('app.current_user_id', true)::integer)
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::integer);

DROP POLICY IF EXISTS openwearables_connections_isolation ON openwearables_connections;
CREATE POLICY openwearables_connections_isolation ON openwearables_connections
  FOR ALL USING (user_id = current_setting('app.current_user_id', true)::integer)
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::integer);

DROP POLICY IF EXISTS user_plans_isolation ON user_plans;
CREATE POLICY user_plans_isolation ON user_plans
  FOR ALL USING (user_id = current_setting('app.current_user_id', true)::integer)
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::integer);

DROP POLICY IF EXISTS user_progress_isolation ON user_progress;
CREATE POLICY user_progress_isolation ON user_progress
  FOR ALL USING (user_id = current_setting('app.current_user_id', true)::integer)
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::integer);

DROP POLICY IF EXISTS weight_history_isolation ON weight_history;
CREATE POLICY weight_history_isolation ON weight_history
  FOR ALL USING (user_id = current_setting('app.current_user_id', true)::integer)
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::integer);

DROP POLICY IF EXISTS adherence_isolation ON adherence;
CREATE POLICY adherence_isolation ON adherence
  FOR ALL USING (user_id = current_setting('app.current_user_id', true)::integer)
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::integer);

DROP POLICY IF EXISTS nps_responses_isolation ON nps_responses;
CREATE POLICY nps_responses_isolation ON nps_responses
  FOR ALL USING (user_id = current_setting('app.current_user_id', true)::integer)
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::integer);

DROP POLICY IF EXISTS user_ingredient_swaps_isolation ON user_ingredient_swaps;
CREATE POLICY user_ingredient_swaps_isolation ON user_ingredient_swaps
  FOR ALL USING (user_id = current_setting('app.current_user_id', true)::integer)
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::integer);

DROP POLICY IF EXISTS user_anomaly_events_isolation ON user_anomaly_events;
CREATE POLICY user_anomaly_events_isolation ON user_anomaly_events
  FOR ALL USING (user_id = current_setting('app.current_user_id', true)::integer)
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::integer);

DROP POLICY IF EXISTS training_week_plans_isolation ON training_week_plans;
CREATE POLICY training_week_plans_isolation ON training_week_plans
  FOR ALL USING (user_id = current_setting('app.current_user_id', true)::integer)
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::integer);

DROP POLICY IF EXISTS training_confirmations_isolation ON training_confirmations;
CREATE POLICY training_confirmations_isolation ON training_confirmations
  FOR ALL USING (user_id = current_setting('app.current_user_id', true)::integer)
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::integer);

DROP POLICY IF EXISTS recipes_read ON recipes;
CREATE POLICY recipes_read ON recipes FOR SELECT USING (true);

DROP POLICY IF EXISTS recipes_shared_write ON recipes;
CREATE POLICY recipes_shared_write ON recipes
  FOR ALL USING (app_shared_write_enabled())
  WITH CHECK (app_shared_write_enabled());

DROP POLICY IF EXISTS nutrition_ingredient_refs_read ON nutrition_ingredient_refs;
CREATE POLICY nutrition_ingredient_refs_read ON nutrition_ingredient_refs FOR SELECT USING (true);

DROP POLICY IF EXISTS nutrition_ingredient_refs_shared_write ON nutrition_ingredient_refs;
CREATE POLICY nutrition_ingredient_refs_shared_write ON nutrition_ingredient_refs
  FOR ALL USING (app_shared_write_enabled())
  WITH CHECK (app_shared_write_enabled());

DROP POLICY IF EXISTS recipe_nutrition_audits_read ON recipe_nutrition_audits;
CREATE POLICY recipe_nutrition_audits_read ON recipe_nutrition_audits FOR SELECT USING (true);

DROP POLICY IF EXISTS recipe_nutrition_audits_shared_write ON recipe_nutrition_audits;
CREATE POLICY recipe_nutrition_audits_shared_write ON recipe_nutrition_audits
  FOR ALL USING (app_shared_write_enabled())
  WITH CHECK (app_shared_write_enabled());

-- ============================================================
-- INGREDIENT-BASED MEAL ENGINE - tables created 2026-06-13
-- Already applied to Supabase directly; kept here as schema record.
-- ============================================================

CREATE TABLE IF NOT EXISTS ingredients (
  id                      SERIAL PRIMARY KEY,
  name                    TEXT NOT NULL UNIQUE,
  name_en                 TEXT,
  category                TEXT NOT NULL,
  subcategory             TEXT,
  calories_per_100g       NUMERIC(6,1),
  protein_g               NUMERIC(5,1),
  carbs_g                 NUMERIC(5,1),
  fat_g                   NUMERIC(5,1),
  fiber_g                 NUMERIC(5,1),
  glycemic_index          TEXT DEFAULT 'medium' CHECK (glycemic_index IN ('low','medium','high')),
  gi_numeric              INTEGER CHECK (gi_numeric IS NULL OR gi_numeric BETWEEN 0 AND 100),
  typical_portion_g       INTEGER DEFAULT 100,
  meal_timing             TEXT[] DEFAULT ARRAY['breakfast','lunch','dinner','snack'],
  template_slots          TEXT[] NOT NULL DEFAULT '{}',
  compatible_omnivore     BOOLEAN DEFAULT true,
  compatible_pescatarian  BOOLEAN DEFAULT true,
  compatible_vegetarian   BOOLEAN DEFAULT true,
  compatible_vegan        BOOLEAN DEFAULT false,
  allergen_gluten         BOOLEAN DEFAULT false,
  allergen_dairy          BOOLEAN DEFAULT false,
  allergen_lactose        BOOLEAN DEFAULT false,
  allergen_eggs           BOOLEAN DEFAULT false,
  allergen_fish           BOOLEAN DEFAULT false,
  allergen_shellfish      BOOLEAN DEFAULT false,
  allergen_mollusks       BOOLEAN DEFAULT false,
  allergen_nuts           BOOLEAN DEFAULT false,
  allergen_peanuts        BOOLEAN DEFAULT false,
  allergen_soy            BOOLEAN DEFAULT false,
  allergen_sesame         BOOLEAN DEFAULT false,
  ok_celiac               BOOLEAN DEFAULT true,
  ok_lactose_intolerant   BOOLEAN DEFAULT true,
  ok_diabetic             BOOLEAN DEFAULT true,
  ok_gerd                 BOOLEAN DEFAULT true,
  ok_ibs_fodmap           BOOLEAN DEFAULT true,
  ok_histamine            BOOLEAN DEFAULT true,
  ok_gout                 BOOLEAN DEFAULT true,
  ok_renal                BOOLEAN DEFAULT true,
  ok_nickel               BOOLEAN DEFAULT true,
  is_active               BOOLEAN DEFAULT true,
  nutritionist_validated  BOOLEAN DEFAULT false,
  source_id               TEXT,
  source_food_id          TEXT,
  source_food_name        TEXT,
  source_confidence       NUMERIC(3,2),
  last_verified_at        TIMESTAMPTZ,
  health_tags             TEXT[] DEFAULT ARRAY[]::TEXT[],
  primary_benefit         TEXT,
  science_note            TEXT,
  micronutrients          JSONB DEFAULT '{}'::JSONB,
  polyphenols_mg          NUMERIC(8,2),
  bioavailability_pairs   JSONB DEFAULT '[]'::JSONB,
  notes                   TEXT,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ingredients_category ON ingredients(category);
CREATE INDEX IF NOT EXISTS idx_ingredients_active ON ingredients(is_active);

CREATE TABLE IF NOT EXISTS meal_templates (
  id              SERIAL PRIMARY KEY,
  meal_type       TEXT NOT NULL UNIQUE,
  display_name    TEXT NOT NULL,
  display_name_en TEXT,
  slots           JSONB NOT NULL,
  notes           TEXT
);

CREATE TABLE IF NOT EXISTS daily_plans (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_date    DATE NOT NULL,
  plan_data    JSONB NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, plan_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_plans_user ON daily_plans(user_id, plan_date DESC);

ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ingredients_select ON ingredients;
DROP POLICY IF EXISTS templates_select ON meal_templates;
DROP POLICY IF EXISTS daily_plans_select ON daily_plans;
DROP POLICY IF EXISTS daily_plans_insert ON daily_plans;
DROP POLICY IF EXISTS daily_plans_update ON daily_plans;

CREATE POLICY ingredients_select ON ingredients
  FOR SELECT USING (is_active = true);

CREATE POLICY templates_select ON meal_templates
  FOR SELECT USING (true);

CREATE POLICY daily_plans_select ON daily_plans
  FOR SELECT USING (user_id = current_setting('app.current_user_id', true)::integer);

CREATE POLICY daily_plans_insert ON daily_plans
  FOR INSERT WITH CHECK (user_id = current_setting('app.current_user_id', true)::integer);

CREATE POLICY daily_plans_update ON daily_plans
  FOR UPDATE USING (user_id = current_setting('app.current_user_id', true)::integer);

ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS source_id TEXT;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS source_food_id TEXT;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS source_food_name TEXT;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS source_confidence NUMERIC(3,2);
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS allergen_mollusks BOOLEAN DEFAULT false;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS gi_numeric INTEGER CHECK (gi_numeric IS NULL OR gi_numeric BETWEEN 0 AND 100);
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS health_tags TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS primary_benefit TEXT;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS science_note TEXT;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS micronutrients JSONB DEFAULT '{}'::JSONB;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS polyphenols_mg NUMERIC(8,2);
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS bioavailability_pairs JSONB DEFAULT '[]'::JSONB;
