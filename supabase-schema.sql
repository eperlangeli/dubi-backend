-- DUBI Supabase schema alignment - FASE 1
-- Current production-compatible version.
-- It preserves the existing custom JWT auth model: public.users.id is integer.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  age INT,
  weight DOUBLE PRECISION,
  height INT,
  goal VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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
  allergies TEXT,
  sport VARCHAR(100),
  training_time VARCHAR(50),
  breakfast_pref VARCHAR(50),
  day_start TIME,
  day_end TIME,
  wearable_provider VARCHAR(50),
  onboarding_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
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
CREATE INDEX IF NOT EXISTS idx_wearable_data_user_synced ON wearable_data(user_id, synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_wearable_data_user_date ON wearable_data(user_id, data_date DESC);
CREATE INDEX IF NOT EXISTS idx_weight_history_user_logged ON weight_history(user_id, logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_adherence_user_date ON adherence(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_recipes_meal_type ON recipes USING GIN(meal_type);
CREATE INDEX IF NOT EXISTS idx_recipes_diet ON recipes USING GIN(diet_compatibility);
CREATE INDEX IF NOT EXISTS idx_recipes_allergens ON recipes USING GIN(allergens);
CREATE INDEX IF NOT EXISTS idx_recipes_goal_tags ON recipes USING GIN(meal_goal_tags);

ALTER TABLE recipes ADD COLUMN IF NOT EXISTS prep_time_minutes INT;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS cost_level VARCHAR(20);
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS difficulty VARCHAR(20);
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS sodium_level VARCHAR(20) DEFAULT 'medium';
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS added_sugar_level VARCHAR(20) DEFAULT 'low';
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS meal_goal_tags VARCHAR(50)[];
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS avoid_if VARCHAR(50)[];
ALTER TABLE wearable_data ADD COLUMN IF NOT EXISTS sleep_duration DOUBLE PRECISION;
ALTER TABLE wearable_data ADD COLUMN IF NOT EXISTS recovery_score INT;
ALTER TABLE wearable_data ADD COLUMN IF NOT EXISTS data_date DATE;

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_onboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE wearable_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE weight_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE adherence ENABLE ROW LEVEL SECURITY;
ALTER TABLE nps_responses ENABLE ROW LEVEL SECURITY;

-- Policies are intentionally not created here yet because the current app uses
-- backend-issued JWTs, not Supabase Auth JWTs. Access should stay backend-only
-- until the auth strategy is finalized.
