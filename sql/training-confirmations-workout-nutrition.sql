-- DUBI workout nutrition timing support.
-- Run before relying on per-day sport selection from POST /api/training/day/confirm.

ALTER TABLE public.training_confirmations
  ADD COLUMN IF NOT EXISTS training_sport TEXT;
