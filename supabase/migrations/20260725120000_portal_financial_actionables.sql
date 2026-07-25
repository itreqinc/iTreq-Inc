-- Portal actionables: client-reported payments, per-invoice dispute threads,
-- quote decline reasons, and a private bucket for client-uploaded proof.
-- TEMP open RLS until Phase 6.

-- Client-reported payments ("I've paid"). Staff verify before any ledger entry.
create table public.payment_notifications (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  invoice_id uuid references public.invoices (id) on delete set null,
  amount numeric(12, 2) not null check (amount > 0),
  payment_date date not null default current_date,
  method text not null default 'eft'
    check (method in ('cash', 'eft', 'card', 'cheque', 'other')),
  reference text,
  note text,
  proof_path text,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'dismissed')),
  resolved_at timestamptz,
  resolved_payment_id uuid references public.payments (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payment_notifications_client_idx on public.payment_notifications (client_id);
create index payment_notifications_status_idx on public.payment_notifications (status, created_at desc);
create index payment_notifications_invoice_idx on public.payment_notifications (invoice_id);

-- One dispute/query thread per invoice; only one may be open at a time.
create table public.invoice_disputes (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  status text not null default 'open'
    check (status in ('open', 'resolved')),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index invoice_disputes_invoice_idx on public.invoice_disputes (invoice_id);
create index invoice_disputes_client_idx on public.invoice_disputes (client_id);
create index invoice_disputes_status_idx on public.invoice_disputes (status, updated_at desc);
create unique index invoice_disputes_open_uidx
  on public.invoice_disputes (invoice_id) where status = 'open';

create table public.invoice_dispute_messages (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.invoice_disputes (id) on delete cascade,
  author_role text not null check (author_role in ('client', 'staff')),
  body text not null check (length(trim(body)) > 0),
  attachment_path text,
  created_at timestamptz not null default now()
);

create index invoice_dispute_messages_dispute_idx
  on public.invoice_dispute_messages (dispute_id, created_at);

-- Quotations may be declined with a short reason shown to the client.
alter table public.quotations
  add column if not exists decline_reason text;

alter table public.quotations drop constraint if exists quotations_status_check;
alter table public.quotations
  add constraint quotations_status_check
  check (status in ('draft', 'sent', 'accepted', 'declined', 'converted', 'cancelled'));

alter table public.payment_notifications enable row level security;
alter table public.invoice_disputes enable row level security;
alter table public.invoice_dispute_messages enable row level security;

create policy "TEMP_dev_open_payment_notifications"
  on public.payment_notifications for all to anon, authenticated
  using (true) with check (true);

create policy "TEMP_dev_open_invoice_disputes"
  on public.invoice_disputes for all to anon, authenticated
  using (true) with check (true);

create policy "TEMP_dev_open_invoice_dispute_messages"
  on public.invoice_dispute_messages for all to anon, authenticated
  using (true) with check (true);

-- Private bucket for proof of payment / dispute attachments.
insert into storage.buckets (id, name, public)
values ('client-proofs', 'client-proofs', false)
on conflict (id) do nothing;

drop policy if exists "TEMP_dev_open_client_proofs_read" on storage.objects;
drop policy if exists "TEMP_dev_open_client_proofs_write" on storage.objects;

create policy "TEMP_dev_open_client_proofs_read"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'client-proofs');

create policy "TEMP_dev_open_client_proofs_write"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'client-proofs');

notify pgrst, 'reload schema';
