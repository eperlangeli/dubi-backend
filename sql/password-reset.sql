-- DUBI password reset schema.
-- Run this once in the Supabase SQL Editor as the project owner before deploying
-- the password reset backend routes.

CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash  CHAR(64) NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used        BOOLEAN NOT NULL DEFAULT false,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_created
  ON public.password_reset_tokens(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires
  ON public.password_reset_tokens(expires_at);

CREATE OR REPLACE FUNCTION public.app_password_reset_enabled()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT current_setting('app.allow_password_reset', true) = 'true';
$$;

ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_tokens FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS password_reset_tokens_context
  ON public.password_reset_tokens;
CREATE POLICY password_reset_tokens_context
  ON public.password_reset_tokens
  FOR ALL
  USING (public.app_password_reset_enabled())
  WITH CHECK (public.app_password_reset_enabled());

DROP POLICY IF EXISTS users_password_reset_select ON public.users;
CREATE POLICY users_password_reset_select
  ON public.users
  FOR SELECT
  USING (public.app_password_reset_enabled());

DROP POLICY IF EXISTS users_password_reset_update ON public.users;
CREATE POLICY users_password_reset_update
  ON public.users
  FOR UPDATE
  USING (public.app_password_reset_enabled())
  WITH CHECK (public.app_password_reset_enabled());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dubi_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON public.password_reset_tokens TO dubi_app;
    GRANT USAGE, SELECT
      ON SEQUENCE public.password_reset_tokens_id_seq TO dubi_app;
    GRANT EXECUTE
      ON FUNCTION public.app_password_reset_enabled() TO dubi_app;
  END IF;
END
$$;
