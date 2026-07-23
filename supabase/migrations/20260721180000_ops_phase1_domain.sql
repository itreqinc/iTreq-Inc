-- Phase 1: clients, products, stock ledger, company settings.
-- TEMP: open anon policies for auth-bypass testing. Phase 6 removes these and locks via Edge JWT.

-- Clients (CRM)
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  address text,
  notes text,
  contact_submission_id uuid references public.contact_submissions (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index clients_name_idx on public.clients (name);
create index clients_phone_idx on public.clients (phone);

-- Product catalog
create table public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  unit_price numeric(12, 2) not null default 0 check (unit_price >= 0),
  tracks_stock boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Append-only stock ledger (on-hand = sum(quantity_delta))
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete restrict,
  quantity_delta integer not null,
  reason text not null default 'adjustment',
  note text,
  reference_type text,
  reference_id uuid,
  created_at timestamptz not null default now()
);

create index stock_movements_product_idx on public.stock_movements (product_id);

create or replace view public.stock_levels as
select
  p.id as product_id,
  p.sku,
  p.name,
  p.tracks_stock,
  coalesce(sum(m.quantity_delta), 0)::integer as on_hand
from public.products p
left join public.stock_movements m on m.product_id = p.id
where p.tracks_stock = true
group by p.id, p.sku, p.name, p.tracks_stock;

-- Document numbering / company settings (single row)
create table public.company_settings (
  id int primary key default 1 check (id = 1),
  company_name text not null default 'iTreq Inc',
  currency text not null default 'BWP',
  quote_prefix text not null default 'Q',
  invoice_prefix text not null default 'INV',
  next_quote_number integer not null default 1 check (next_quote_number >= 1),
  next_invoice_number integer not null default 1 check (next_invoice_number >= 1),
  default_tax_rate numeric(5, 2) not null default 0 check (default_tax_rate >= 0),
  updated_at timestamptz not null default now()
);

insert into public.company_settings (id) values (1);

-- Seed products
insert into public.products (sku, name, unit_price, tracks_stock, active) values
  ('iTreq760', 'iTreq760 Tracker', 0, true, true),
  ('iTreq730', 'iTreq730 Tracker', 0, true, true),
  ('iTreq950', 'iTreq950 Tracker', 0, true, true),
  ('FEE-VEHICLE', 'Vehicle monitoring (monthly)', 125, false, true),
  ('FEE-APPLIANCE', 'Appliance monitoring (monthly)', 75, false, true);

-- RLS
alter table public.clients enable row level security;
alter table public.products enable row level security;
alter table public.stock_movements enable row level security;
alter table public.company_settings enable row level security;

-- TEMP open policies (remove in Phase 6)
create policy "TEMP_dev_open_clients"
  on public.clients for all to anon, authenticated
  using (true) with check (true);

create policy "TEMP_dev_open_products"
  on public.products for all to anon, authenticated
  using (true) with check (true);

create policy "TEMP_dev_open_stock_movements"
  on public.stock_movements for all to anon, authenticated
  using (true) with check (true);

create policy "TEMP_dev_open_company_settings"
  on public.company_settings for all to anon, authenticated
  using (true) with check (true);

grant select on public.stock_levels to anon, authenticated;
