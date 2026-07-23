-- Ensure all columns used by the Ops client form exist.
-- Safe to re-run (IF NOT EXISTS / IF EXISTS).

alter table public.clients
  add column if not exists first_name text,
  add column if not exists middle_name text,
  add column if not exists surname text,
  add column if not exists id_number text,
  add column if not exists cellphone text,
  add column if not exists landline text,
  add column if not exists postal_address text,
  add column if not exists physical_address text,
  add column if not exists country text,
  add column if not exists gender text;

-- Gender may already exist without a check; add check only if missing is awkward,
-- so enforce via a named constraint when possible.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'clients_gender_check'
      and conrelid = 'public.clients'::regclass
  ) then
    alter table public.clients
      add constraint clients_gender_check
      check (gender is null or gender in ('M', 'F'));
  end if;
end $$;

alter table public.clients
  drop column if exists title;

create index if not exists clients_id_number_idx on public.clients (id_number);
create index if not exists clients_cellphone_idx on public.clients (cellphone);

-- Refresh PostgREST schema cache (Supabase)
notify pgrst, 'reload schema';
