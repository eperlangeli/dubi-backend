-- Migration: remove IP column from waitlist table
-- Decision: IP is infrastructure-level logging; storing it in waitlist is not
-- declared in the Privacy Policy and is unnecessary for waitlist management.
-- Date: 2026-06-23

ALTER TABLE waitlist DROP COLUMN IF EXISTS ip;
