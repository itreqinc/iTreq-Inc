-- Company clients: a company name, plus extra mail addresses that are not logins.
-- Login stays on clients.email and must be unique in application code.
-- The same extra address may be listed on several company accounts.

alter table public.clients
  add column if not exists is_company boolean not null default false,
  add column if not exists company_name text;

comment on column public.clients.is_company is
  'When true, clients.name is the company name and extra emails may be stored.';
comment on column public.clients.company_name is
  'Company name. Used as the display name while is_company is true.';

create table if not exists public.client_contact_emails (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  email text not null,
  receives_communication boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists client_contact_emails_client_email_uidx
  on public.client_contact_emails (client_id, lower(email));

create index if not exists client_contact_emails_client_idx
  on public.client_contact_emails (client_id);

alter table public.client_contact_emails enable row level security;

comment on table public.client_contact_emails is
  'Extra addresses for a company client. Not used for portal login. May repeat across clients.';
