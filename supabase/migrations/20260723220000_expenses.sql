-- Operating expenses (staff): categories + expense records.
-- Stock purchases stay out of expenses (inventory asset path).

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expense_categories_name_uidx unique (name)
);

create index expense_categories_active_idx on public.expense_categories (active, sort_order);

insert into public.expense_categories (name, sort_order) values
  ('Fuel', 10),
  ('Rent', 20),
  ('Utilities', 30),
  ('Transport', 40),
  ('Airtime / Data', 50),
  ('Office', 60),
  ('Maintenance', 70),
  ('Other', 100)
on conflict (name) do nothing;

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null default current_date,
  amount numeric(12, 2) not null check (amount > 0),
  category_id uuid not null references public.expense_categories (id) on delete restrict,
  vendor text,
  method text not null default 'cash'
    check (method in ('cash', 'eft', 'card', 'cheque', 'other')),
  reference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index expenses_date_idx on public.expenses (expense_date desc);
create index expenses_category_idx on public.expenses (category_id);

alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;

create policy "TEMP_dev_open_expense_categories"
  on public.expense_categories for all to anon, authenticated
  using (true) with check (true);

create policy "TEMP_dev_open_expenses"
  on public.expenses for all to anon, authenticated
  using (true) with check (true);
