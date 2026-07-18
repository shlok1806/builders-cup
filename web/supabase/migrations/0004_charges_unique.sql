-- The checkout route upserts the charge ledger with
--   onConflict: 'purchase_id,user_id,amount_cents'
-- but no matching unique constraint existed, so Postgres rejected the ON
-- CONFLICT (42P10) — a real charge would 500 *after* Stripe took the money.
-- This index backs that upsert (mirrors the recurring_cart_approvals pattern).
create unique index if not exists charges_purchase_user_amount_uidx
  on charges (purchase_id, user_id, amount_cents);
