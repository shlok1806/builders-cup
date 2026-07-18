-- The learning loop upserts one restock_subscriptions row per (household, product) on
-- every charged purchase. This unique index makes that upsert safe and prevents the
-- write-back from creating duplicate subscriptions for the same recurring item.
create unique index if not exists restock_subscriptions_hh_product_idx
  on restock_subscriptions (household_id, product_id);
