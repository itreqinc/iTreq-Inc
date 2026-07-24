-- Stock purchases via purchase orders (money out) + partial receives (shelf up).
-- Not operating expenses — inventory path.

create sequence if not exists public.purchase_order_number_seq;

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_number text not null unique
    default ('PO-' || lpad(nextval('public.purchase_order_number_seq')::text, 4, '0')),
  purchase_date date not null default current_date,
  supplier text,
  amount numeric(12, 2) not null check (amount > 0),
  method text not null default 'eft'
    check (method in ('cash', 'eft', 'card', 'cheque', 'other')),
  reference text,
  notes text,
  status text not null default 'open'
    check (status in ('open', 'closed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index purchase_orders_date_idx on public.purchase_orders (purchase_date desc);
create index purchase_orders_status_idx on public.purchase_orders (status);

create table public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null
    references public.purchase_orders (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  quantity_ordered integer not null check (quantity_ordered > 0),
  quantity_received integer not null default 0
    check (quantity_received >= 0),
  unit_cost numeric(12, 2) check (unit_cost is null or unit_cost >= 0),
  created_at timestamptz not null default now(),
  constraint purchase_order_lines_received_lte_ordered
    check (quantity_received <= quantity_ordered)
);

create index purchase_order_lines_po_idx
  on public.purchase_order_lines (purchase_order_id);

create table public.purchase_receipts (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null
    references public.purchase_orders (id) on delete restrict,
  received_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

create index purchase_receipts_po_idx
  on public.purchase_receipts (purchase_order_id);

create table public.purchase_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_receipt_id uuid not null
    references public.purchase_receipts (id) on delete cascade,
  purchase_order_line_id uuid not null
    references public.purchase_order_lines (id) on delete restrict,
  product_id uuid not null references public.products (id) on delete restrict,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now()
);

create index purchase_receipt_lines_receipt_idx
  on public.purchase_receipt_lines (purchase_receipt_id);

alter table public.purchase_orders enable row level security;
alter table public.purchase_order_lines enable row level security;
alter table public.purchase_receipts enable row level security;
alter table public.purchase_receipt_lines enable row level security;

create policy "TEMP_dev_open_purchase_orders"
  on public.purchase_orders for all to anon, authenticated
  using (true) with check (true);

create policy "TEMP_dev_open_purchase_order_lines"
  on public.purchase_order_lines for all to anon, authenticated
  using (true) with check (true);

create policy "TEMP_dev_open_purchase_receipts"
  on public.purchase_receipts for all to anon, authenticated
  using (true) with check (true);

create policy "TEMP_dev_open_purchase_receipt_lines"
  on public.purchase_receipt_lines for all to anon, authenticated
  using (true) with check (true);
