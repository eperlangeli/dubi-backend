# DUBI backend migration notes

These SQL statements are review notes only. Do not run them until they have been reviewed against the live Supabase schema and a fresh backup exists.

## 0. Research textual ranges alignment — run before deploying backend commit

The frontend stores `daily_steps` and `workout_duration` as textual bands (for example `6000-8000`), not exact integers. Keep the research pipeline consistent and privacy-friendly by storing those bands as text in both snapshot and longitudinal tables.

Optional pre-check:

```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('research_data_snapshots', 'research_longitudinal')
  AND column_name IN ('daily_steps', 'workout_duration', 'workout_days', 'sedentary_days', 'age', 'height', 'weight', 'target_weight', 'target_body_fat')
ORDER BY table_name, column_name;
```

Required migration:

```sql
BEGIN;

ALTER TABLE public.research_data_snapshots
  ALTER COLUMN daily_steps TYPE TEXT USING daily_steps::text,
  ALTER COLUMN workout_duration TYPE TEXT USING workout_duration::text;

ALTER TABLE public.research_longitudinal
  ALTER COLUMN daily_steps TYPE TEXT USING daily_steps::text,
  ALTER COLUMN workout_duration TYPE TEXT USING workout_duration::text;

COMMIT;
```

## 0b. Research consent re-grant repair

Run this once before or immediately after deploying the consent re-grant backend fix. It removes the impossible state `research_consent = true` with a stale `research_consent_revoked_at`.

```sql
BEGIN;

UPDATE public.user_onboarding
SET research_consent_revoked_at = NULL
WHERE research_consent = TRUE
  AND research_consent_revoked_at IS NOT NULL;

COMMIT;
```

## 1. Schema alignment required by this backend

```sql
BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS date_of_birth DATE;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_parental_consent_status_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_parental_consent_status_check
  CHECK (parental_consent_status IN ('not_required', 'pending', 'approved', 'expired', 'denied'));

ALTER TABLE public.user_onboarding
  ADD COLUMN IF NOT EXISTS wearable_consent BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS research_consent BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS wearable_policy_version VARCHAR(100),
  ADD COLUMN IF NOT EXISTS research_policy_version VARCHAR(100),
  ADD COLUMN IF NOT EXISTS wearable_consent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS research_consent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS research_consent_revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sports TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE public.research_aggregates
  ADD COLUMN IF NOT EXISTS pseudonym TEXT;

CREATE INDEX IF NOT EXISTS idx_research_aggregates_pseudonym
  ON public.research_aggregates(pseudonym);

COMMIT;
```

## 2. Cleanup candidates: legacy `plans`

```sql
BEGIN;

SELECT COUNT(*) AS plans_rows_before_drop
FROM public.plans;

DROP TABLE IF EXISTS public.plans CASCADE;

COMMIT;
```

## 3. Cleanup candidates: legacy `wearable_tokens`

Only run this if the production strategy remains OpenWearables aggregator-based and no direct provider OAuth integration depends on this table.

```sql
BEGIN;

SELECT COUNT(*) AS wearable_tokens_rows_before_drop
FROM public.wearable_tokens;

DROP TABLE IF EXISTS public.wearable_tokens CASCADE;

COMMIT;
```

## 4. Cleanup candidates: unused `parent_consent_*` columns

The active code uses `parental_consent_*` and `guardian_*`. Do not drop those.

```sql
BEGIN;

ALTER TABLE public.users
  DROP COLUMN IF EXISTS parent_consent_token,
  DROP COLUMN IF EXISTS parent_consent_token_expires_at,
  DROP COLUMN IF EXISTS parent_consent_verified_at,
  DROP COLUMN IF EXISTS parent_consent_status,
  DROP COLUMN IF EXISTS parent_consent_at;

COMMIT;
```

## 5. Purge demo wearable rows

This removes wearable rows for users whose OpenWearables connection is explicitly marked as demo-seeded, then removes those demo connections.

```sql
BEGIN;

SELECT COUNT(*) AS demo_wearable_rows
FROM public.wearable_data wd
JOIN public.openwearables_connections ow
  ON ow.user_id = wd.user_id
WHERE ow.provider = 'demo'
  AND ow.status = 'demo_seeded';

DELETE FROM public.wearable_data wd
USING public.openwearables_connections ow
WHERE ow.user_id = wd.user_id
  AND ow.provider = 'demo'
  AND ow.status = 'demo_seeded';

DELETE FROM public.openwearables_connections
WHERE provider = 'demo'
  AND status = 'demo_seeded';

COMMIT;
```
