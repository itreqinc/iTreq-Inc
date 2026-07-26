-- Staff HR + payroll (v1)

alter table public.company_settings
  add column if not exists payroll_payday_mode text not null default 'auto_last_tue_thu'
    check (payroll_payday_mode in ('auto_last_tue_thu', 'override_date', 'override_day_of_month')),
  add column if not exists payroll_payday_override_date date,
  add column if not exists payroll_payday_override_dom integer
    check (payroll_payday_override_dom is null or (payroll_payday_override_dom >= 1 and payroll_payday_override_dom <= 31));

create table public.staff_employment (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users (id) on delete cascade,
  job_title text not null default 'Staff',
  start_date date not null default current_date,
  base_salary numeric(12, 2) not null default 0 check (base_salary >= 0),
  employment_status text not null default 'active'
    check (employment_status in ('active', 'on_leave', 'terminated')),
  bank_name text,
  bank_account text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index staff_employment_status_idx on public.staff_employment (employment_status);

create table public.staff_benefit_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  default_amount numeric(12, 2) not null default 0 check (default_amount >= 0),
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.staff_benefit_types (name, default_amount, sort_order) values
  ('Housing allowance', 0, 10),
  ('Transport allowance', 0, 20),
  ('Medical aid', 0, 30),
  ('Airtime / Data', 0, 40)
on conflict (name) do nothing;

create table public.staff_benefit_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  benefit_type_id uuid not null references public.staff_benefit_types (id) on delete restrict,
  amount numeric(12, 2) not null check (amount >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, benefit_type_id)
);

create index staff_benefit_assignments_user_idx on public.staff_benefit_assignments (user_id);

create table public.salary_advances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  advance_date date not null default current_date,
  amount numeric(12, 2) not null check (amount > 0),
  remaining numeric(12, 2) not null check (remaining >= 0),
  notes text,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint salary_advances_remaining_lte_amount check (remaining <= amount)
);

create index salary_advances_user_idx on public.salary_advances (user_id);
create index salary_advances_remaining_idx on public.salary_advances (remaining) where remaining > 0;

create table public.pay_runs (
  id uuid primary key default gen_random_uuid(),
  period_year integer not null,
  period_month integer not null check (period_month between 1 and 12),
  payday date not null,
  status text not null default 'draft' check (status in ('draft', 'posted')),
  notes text,
  posted_at timestamptz,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (period_year, period_month)
);

create table public.payslips (
  id uuid primary key default gen_random_uuid(),
  pay_run_id uuid not null references public.pay_runs (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete restrict,
  job_title text not null,
  base_salary numeric(12, 2) not null default 0,
  benefits_total numeric(12, 2) not null default 0,
  advances_recovered numeric(12, 2) not null default 0,
  gross numeric(12, 2) not null default 0,
  net numeric(12, 2) not null default 0,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (pay_run_id, user_id)
);

create index payslips_user_idx on public.payslips (user_id);
create index payslips_run_idx on public.payslips (pay_run_id);

alter table public.staff_employment enable row level security;
alter table public.staff_benefit_types enable row level security;
alter table public.staff_benefit_assignments enable row level security;
alter table public.salary_advances enable row level security;
alter table public.pay_runs enable row level security;
alter table public.payslips enable row level security;

create policy "TEMP_dev_open_staff_employment"
  on public.staff_employment for all to anon, authenticated
  using (true) with check (true);
create policy "TEMP_dev_open_staff_benefit_types"
  on public.staff_benefit_types for all to anon, authenticated
  using (true) with check (true);
create policy "TEMP_dev_open_staff_benefit_assignments"
  on public.staff_benefit_assignments for all to anon, authenticated
  using (true) with check (true);
create policy "TEMP_dev_open_salary_advances"
  on public.salary_advances for all to anon, authenticated
  using (true) with check (true);
create policy "TEMP_dev_open_pay_runs"
  on public.pay_runs for all to anon, authenticated
  using (true) with check (true);
create policy "TEMP_dev_open_payslips"
  on public.payslips for all to anon, authenticated
  using (true) with check (true);

-- Ensure demo staff has employment row for testing
insert into public.staff_employment (user_id, job_title, base_salary)
select id, 'Operations Staff', 8500
from public.users
where id = 'b0000000-0000-4000-8000-000000000002'
on conflict (user_id) do nothing;
