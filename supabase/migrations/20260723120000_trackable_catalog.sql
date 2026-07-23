-- Trackable catalog: client-facing "what we track" items mapped to product packages.
-- TEMP open RLS until Phase 6.

alter table public.quotations
  add column if not exists source text not null default 'staff'
    check (source in ('staff', 'portal'));

create table if not exists public.trackable_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  blurb text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trackable_items_active_sort_idx
  on public.trackable_items (active, sort_order, name);

create table if not exists public.trackable_item_components (
  id uuid primary key default gen_random_uuid(),
  trackable_item_id uuid not null references public.trackable_items (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  quantity numeric(12, 2) not null default 1 check (quantity > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (trackable_item_id, product_id)
);

create index if not exists trackable_item_components_item_idx
  on public.trackable_item_components (trackable_item_id, sort_order);

alter table public.trackable_items enable row level security;
alter table public.trackable_item_components enable row level security;

drop policy if exists "TEMP_dev_open_trackable_items" on public.trackable_items;
create policy "TEMP_dev_open_trackable_items"
  on public.trackable_items for all to anon, authenticated
  using (true) with check (true);

drop policy if exists "TEMP_dev_open_trackable_item_components" on public.trackable_item_components;
create policy "TEMP_dev_open_trackable_item_components"
  on public.trackable_item_components for all to anon, authenticated
  using (true) with check (true);

-- Seed catalog (idempotent by name)
insert into public.trackable_items (name, blurb, sort_order)
select v.name, v.blurb, v.sort_order
from (
  values
    ('Cars & Vehicles', 'Private cars, bakkies and commercial units.', 10),
    ('TVs', 'Keep high-value home entertainment protected.', 20),
    ('Laptops', 'Track work and personal computing devices.', 30),
    ('Solar Batteries', 'Monitor lithium and solar storage systems.', 40),
    ('Inverters', 'Protect critical solar power hardware.', 50),
    ('Generators', 'Locate portable and standby power units.', 60),
    ('Fridges & Appliances', 'Secure large household appliances.', 70),
    ('Mini Trucks', 'Track delivery and light commercial vehicles.', 80),
    ('Business Equipment', 'Protect tools, machines and company assets.', 90),
    ('Company Fleet', 'Oversee multiple vehicles from one place.', 100)
) as v(name, blurb, sort_order)
where not exists (
  select 1 from public.trackable_items ti where ti.name = v.name
);

-- Default package mappings by product SKU (skip if product or mapping missing)
insert into public.trackable_item_components (trackable_item_id, product_id, quantity, sort_order)
select ti.id, p.id, 1, m.sort_order
from (
  values
    ('Cars & Vehicles', 'iTreq760', 10),
    ('Cars & Vehicles', 'FEE-VEHICLE', 20),
    ('Mini Trucks', 'iTreq760', 10),
    ('Mini Trucks', 'FEE-VEHICLE', 20),
    ('Company Fleet', 'iTreq760', 10),
    ('Company Fleet', 'FEE-VEHICLE', 20),
    ('TVs', 'iTreq730', 10),
    ('TVs', 'FEE-APPLIANCE', 20),
    ('Laptops', 'iTreq730', 10),
    ('Laptops', 'FEE-APPLIANCE', 20),
    ('Fridges & Appliances', 'iTreq730', 10),
    ('Fridges & Appliances', 'FEE-APPLIANCE', 20),
    ('Business Equipment', 'iTreq730', 10),
    ('Business Equipment', 'FEE-APPLIANCE', 20),
    ('Solar Batteries', 'iTreq950', 10),
    ('Solar Batteries', 'FEE-APPLIANCE', 20),
    ('Inverters', 'iTreq950', 10),
    ('Inverters', 'FEE-APPLIANCE', 20),
    ('Generators', 'iTreq950', 10),
    ('Generators', 'FEE-APPLIANCE', 20)
) as m(item_name, product_sku, sort_order)
join public.trackable_items ti on ti.name = m.item_name
join public.products p on p.sku = m.product_sku
where not exists (
  select 1
  from public.trackable_item_components c
  where c.trackable_item_id = ti.id
    and c.product_id = p.id
);
