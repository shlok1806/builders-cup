-- Per-household trusted-store allowlist. NULL = use the app default (every
-- reputable retailer in DEFAULT_ALLOWLIST). A non-null array is the explicit set
-- of stores the household lets the agent source from — both a control lever and a
-- safety filter (no gray-market / unvetted sellers), enforced in getOffers().
alter table households
  add column if not exists allowed_vendors text[];
