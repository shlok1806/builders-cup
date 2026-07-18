-- Lock down the anon key. Every app query runs through API routes on the
-- service role (bypasses RLS); the only browser/anon use is the approvals
-- realtime channel, which already has RLS + a read policy (0001). So enabling
-- RLS with NO policies here = deny-all for anon, no impact on the app.
alter table households enable row level security;
alter table users enable row level security;
alter table payment_methods enable row level security;
alter table policies enable row level security;
alter table products enable row level security;
alter table purchases enable row level security;
alter table purchase_items enable row level security;
alter table item_splits enable row level security;
alter table charges enable row level security;
alter table recurring_carts enable row level security;
alter table recurring_cart_approvals enable row level security;
