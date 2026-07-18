-- Procurement layer: multi-vendor offers, restock subscriptions, scrape provenance.
-- products becomes the CANONICAL item (one row per real-world product); prices move
-- to offers (many vendors per product). Best deal = min(price_cents) where in_stock.

alter table products add column if not exists canonical_key text; -- normalized name+size+unit
create unique index if not exists products_canonical_key_idx on products (canonical_key);

create table offers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  vendor text not null,
  url text,
  price_cents int not null,
  unit text,
  in_stock boolean not null default true,
  scraped_at timestamptz default now(),
  raw jsonb
);
create index offers_product_idx on offers (product_id);
create index offers_best_idx on offers (product_id, in_stock, price_cents);

create table restock_subscriptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id),
  product_id uuid references products(id),
  cadence_days int not null,
  lead_days int not null default 2,
  last_purchased_at timestamptz,
  enabled boolean not null default true,
  created_at timestamptz default now()
);
create index restock_subscriptions_household_idx on restock_subscriptions (household_id, enabled);

create table scrape_runs (
  id uuid primary key default gen_random_uuid(),
  adapter text not null,
  query text,
  status text not null check (status in ('ok', 'partial', 'failed')),
  offer_count int not null default 0,
  started_at timestamptz default now(),
  finished_at timestamptz
);

-- record which offer each line took (drives the savings number)
alter table purchase_items add column if not exists offer_id uuid references offers(id);
