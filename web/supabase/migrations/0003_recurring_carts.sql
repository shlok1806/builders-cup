create table recurring_carts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references users(id),
  household_id uuid references households(id),
  name text not null,
  items jsonb not null,
  created_at timestamptz default now()
);

create table recurring_cart_approvals (
  id uuid primary key default gen_random_uuid(),
  recurring_cart_id uuid references recurring_carts(id) on delete cascade,
  approver_id uuid references users(id),
  decision text not null check (decision in ('always','never')),
  updated_at timestamptz default now(),
  unique (recurring_cart_id, approver_id)
);

alter table purchases add column recurring_cart_id uuid references recurring_carts(id);
