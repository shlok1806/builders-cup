create extension if not exists "pgcrypto";

create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  monthly_budget_cents int not null default 0,
  created_at timestamptz default now()
);
create table users (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id),
  name text not null, avatar_url text, color text,
  created_at timestamptz default now()
);
create table payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  stripe_customer_id text not null, stripe_pm_id text not null,
  last4 text, brand text, created_at timestamptz default now()
);
create table policies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  household_id uuid references households(id),
  type text not null check (type in ('exclude_category','approval_threshold','split_weight')),
  params jsonb not null, source_text text, created_at timestamptz default now()
);
create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null, category text not null, vendor text,
  price_cents int not null, unit text, image_url text, created_at timestamptz default now()
);
create table purchases (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id),
  status text not null default 'building'
    check (status in ('building','awaiting_approval','charged','failed')),
  subtotal_cents int not null default 0, note text,
  created_by uuid references users(id), created_at timestamptz default now()
);
create table purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid references purchases(id) on delete cascade,
  product_id uuid references products(id),
  name text not null, qty int not null default 1,
  unit_price_cents int not null, category text not null, created_at timestamptz default now()
);
create table item_splits (
  id uuid primary key default gen_random_uuid(),
  purchase_item_id uuid references purchase_items(id) on delete cascade,
  user_id uuid references users(id),
  amount_cents int not null, created_at timestamptz default now()
);
create table charges (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid references purchases(id),
  user_id uuid references users(id),
  amount_cents int not null, stripe_payment_intent_id text,
  status text not null default 'pending' check (status in ('pending','succeeded','failed')),
  created_at timestamptz default now()
);
create table approvals (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid references purchases(id),
  -- on delete cascade: a declined line is deleted; its pending approval must go with it
  -- (P3.3 decline path), otherwise the FK blocks the delete.
  purchase_item_id uuid references purchase_items(id) on delete cascade,
  approver_id uuid references users(id),
  rule text, status text not null default 'pending'
    check (status in ('pending','approved','declined')),
  created_at timestamptz default now()
);

alter publication supabase_realtime add table approvals;
