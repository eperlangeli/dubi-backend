-- Temporary account suspension flag.
-- Suspension is managed manually from the Supabase dashboard.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT FALSE;
