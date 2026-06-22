-- Secure account deletion OTP flow.
-- Run once in the Supabase SQL Editor before deploying the matching backend routes.

CREATE TABLE IF NOT EXISTS public.deletion_requests (
  id         BIGSERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  otp_hash   TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deletion_requests_expires_at
  ON public.deletion_requests(expires_at);

ALTER TABLE public.deletion_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deletion_requests FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deletion_requests_user_isolation
  ON public.deletion_requests;
CREATE POLICY deletion_requests_user_isolation
  ON public.deletion_requests
  FOR ALL
  USING (user_id = current_setting('app.current_user_id', true)::integer)
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::integer);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dubi_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON public.deletion_requests TO dubi_app;
    GRANT USAGE, SELECT
      ON SEQUENCE public.deletion_requests_id_seq TO dubi_app;
  END IF;
END
$$;
