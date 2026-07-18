-- Ensures at most one charge row per (purchase_id, user_id, amount_cents) so
-- the checkout route's load-then-update ledger persistence is retry-safe:
-- a first successful checkout inserts one row per user/amount, and any retried
-- or partially-failed checkout updates those rows by primary key instead of
-- creating duplicates.
--
-- Idempotent: `create unique index if not exists` is safe on fresh databases
-- and on re-runs. If duplicate rows already exist (e.g. from a prior buggy
-- write path), remove or reconcile them before applying this migration, since
-- a unique index cannot be built over duplicates.
create unique index if not exists charges_purchase_id_user_id_amount_cents_key
  on charges (purchase_id, user_id, amount_cents);
