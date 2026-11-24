-- Staff-linked expenses, advance↔expense link, payroll system categories, payday reminder marker.

alter table public.expense_categories
  add column if not exists system_key text;

create unique index if not exists expense_categories_system_key_uidx
  on public.expense_categories (system_key)
  where system_key is not null;

comment on column public.expense_categories.system_key is
  'Stable key for payroll-driven categories: salary, salary_advance, staff_rem_benefits.';

insert into public.expense_categories (name, sort_order, system_key) values
  ('Salary', 5, 'salary'),
  ('Salary advance', 6, 'salary_advance'),
  ('Staff remuneration / benefits', 7, 'staff_rem_benefits')
on conflict (name) do update
  set system_key = excluded.system_key,
      sort_order = excluded.sort_order,
      updated_at = now();

-- Backfill system_key if rows already existed under these names without key.
update public.expense_categories set system_key = 'salary', updated_at = now()
  where name = 'Salary' and system_key is null;
update public.expense_categories set system_key = 'salary_advance', updated_at = now()
  where name = 'Salary advance' and system_key is null;
update public.expense_categories set system_key = 'staff_rem_benefits', updated_at = now()
  where name = 'Staff remuneration / benefits' and system_key is null;

alter table public.expenses
  add column if not exists staff_user_id uuid references public.users (id) on delete set null,
  add column if not exists pay_run_id uuid references public.pay_runs (id) on delete set null;

create index if not exists expenses_staff_user_idx on public.expenses (staff_user_id)
  where staff_user_id is not null;
create index if not exists expenses_pay_run_idx on public.expenses (pay_run_id)
  where pay_run_id is not null;

alter table public.salary_advances
  add column if not exists expense_id uuid references public.expenses (id) on delete set null;

create unique index if not exists salary_advances_expense_id_uidx
  on public.salary_advances (expense_id)
  where expense_id is not null;

alter table public.company_settings
  add column if not exists payroll_reminder_sent_for date;

comment on column public.company_settings.payroll_reminder_sent_for is
  'Gaborone calendar payday date for which the morning reminder email was already sent.';
