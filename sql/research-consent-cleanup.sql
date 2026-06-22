-- Research-consent revocation timestamp used by the 30-day cleanup cron.
-- Consent is stored on user_onboarding, so its revocation timestamp belongs there too.

ALTER TABLE public.user_onboarding
  ADD COLUMN IF NOT EXISTS research_consent_revoked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_user_onboarding_research_cleanup
  ON public.user_onboarding(research_consent_revoked_at)
  WHERE research_consent = FALSE
    AND research_consent_revoked_at IS NOT NULL;

-- Return only cleanup candidate IDs. SECURITY DEFINER lets the scheduled backend
-- job read candidates even when the application database role is subject to RLS.
CREATE OR REPLACE FUNCTION public.research_cleanup_candidates()
RETURNS TABLE(user_id INTEGER)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT u.id
  FROM public.users u
  JOIN public.user_onboarding uo ON uo.user_id = u.id
  WHERE uo.research_consent = FALSE
    AND uo.research_consent_revoked_at IS NOT NULL
    AND uo.research_consent_revoked_at <= NOW() - INTERVAL '30 days';
$$;

REVOKE ALL ON FUNCTION public.research_cleanup_candidates() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dubi_app') THEN
    GRANT EXECUTE ON FUNCTION public.research_cleanup_candidates() TO dubi_app;
  END IF;
END
$$;
