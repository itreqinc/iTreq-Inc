-- Leads (contact_submissions): same registration fields as clients.
-- Quotations can target a client OR an open lead without polluting the clients table.

-- ---------------------------------------------------------------------------
-- Expand contact_submissions
-- ---------------------------------------------------------------------------

alter table public.contact_submissions
  add column if not exists gender text check (gender in ('M', 'F') or gender is null),
  add column if not exists first_name text,
  add column if not exists middle_name text,
  add column if not exists surname text,
  add column if not exists id_number text,
  add column if not exists country text,
  add column if not exists cellphone text,
  add column if not exists landline text,
  add column if not exists postal_address text,
  add column if not exists physical_address text,
  add column if not exists notes text,
  add column if not exists status text not null default 'new'
    check (status in ('new', 'converted', 'dismissed')),
  add column if not exists converted_client_id uuid references public.clients (id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

-- Backfill legacy public-form rows into the new shape.
update public.contact_submissions
set
  first_name = coalesce(
    nullif(trim(split_part(coalesce(name, ''), ' ', 1)), ''),
    coalesce(name, 'Unknown')
  ),
  surname = coalesce(
    nullif(trim(substring(coalesce(name, '') from position(' ' in coalesce(name, '')) + 1)), ''),
    '—'
  ),
  cellphone = coalesce(cellphone, phone),
  country = coalesce(country, 'BW'),
  notes = coalesce(
    notes,
    trim(both from concat(
      case when coalesce(interest, '') <> '' then 'Interest: ' || interest else '' end,
      case
        when coalesce(interest, '') <> '' and coalesce(message, '') <> '' then E'\n\n'
        else ''
      end,
      coalesce(message, '')
    ))
  )
where first_name is null;

update public.contact_submissions
set name = trim(concat_ws(' ', first_name, middle_name, surname))
where first_name is not null;

alter table public.contact_submissions
  alter column interest drop not null,
  alter column message drop not null,
  alter column phone drop not null;

create index if not exists contact_submissions_status_idx on public.contact_submissions (status);
create index if not exists contact_submissions_created_idx on public.contact_submissions (created_at desc);

-- ---------------------------------------------------------------------------
-- Quotations: client OR lead recipient
-- ---------------------------------------------------------------------------

alter table public.quotations
  alter column client_id drop not null;

alter table public.quotations
  add column if not exists contact_submission_id uuid
    references public.contact_submissions (id) on delete restrict;

create index if not exists quotations_contact_submission_idx
  on public.quotations (contact_submission_id);

alter table public.quotations
  drop constraint if exists quotations_recipient_check;

alter table public.quotations
  add constraint quotations_recipient_check check (
    (client_id is not null and contact_submission_id is null)
    or (client_id is null and contact_submission_id is not null)
  );
