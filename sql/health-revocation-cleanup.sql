-- Migration: add health_revoked_at timestamp to users table
-- Purpose: tracks when a user revokes health consent so the nightly cron
-- can delete weight_log, daily_progress, ai_plans and wearable_data
-- 30 days after revocation (matching the research_consent cleanup window).
-- Date: 2026-06-23

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS health_revoked_at TIMESTAMPTZ DEFAULT NULL;

-- Index for efficient nightly cron query
CREATE INDEX IF NOT EXISTS idx_users_health_revoked_at
  ON users (health_revoked_at)
  WHERE health_revoked_at IS NOT NULL;
