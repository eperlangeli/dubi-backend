BEGIN;

ALTER TABLE user_onboarding
  ADD COLUMN IF NOT EXISTS sports TEXT[];

UPDATE user_onboarding
SET sports = ARRAY[sport]
WHERE (sports IS NULL OR cardinality(sports) = 0)
  AND NULLIF(BTRIM(sport), '') IS NOT NULL;

ALTER TABLE user_onboarding
  ALTER COLUMN sports SET DEFAULT ARRAY[]::TEXT[];

ALTER TABLE user_onboarding
  DROP CONSTRAINT IF EXISTS user_onboarding_sports_max_five;

ALTER TABLE user_onboarding
  ADD CONSTRAINT user_onboarding_sports_max_five
  CHECK (sports IS NULL OR cardinality(sports) <= 5);

CREATE INDEX IF NOT EXISTS idx_user_onboarding_sports_gin
  ON user_onboarding USING GIN (sports);

COMMIT;

-- `sport` intentionally remains in place during the compatibility period.
-- New writes store the first selected sport there for older clients.
