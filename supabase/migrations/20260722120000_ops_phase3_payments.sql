-- Phase 3: payments, allocations, invoice balance refresh.

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  payment_date date not null default current_date,
  method text not null default 'cash'
    check (method in ('cash', 'eft', 'card', 'cheque', 'other')),
  reference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payments_client_idx on public.payments (client_id);
create index payments_date_idx on public.payments (payment_date);

create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (payment_id, invoice_id)
);

create index payment_allocations_payment_idx on public.payment_allocations (payment_id);
create index payment_allocations_invoice_idx on public.payment_allocations (invoice_id);

create or replace function public.refresh_invoice_payment_status(p_invoice_id uuid)
returns public.invoices
language plpgsql
as $$
declare
  inv public.invoices;
  paid numeric(12, 2);
begin
  select * into inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found';
  end if;

  if inv.status in ('draft', 'void') then
    return inv;
  end if;

  select coalesce(sum(amount), 0) into paid
  from public.payment_allocations
  where invoice_id = p_invoice_id;

  update public.invoices
  set
    amount_paid = round(paid, 2),
    status = case
      when round(paid, 2) >= inv.total then 'paid'
      when paid > 0 then 'partial'
      else 'issued'
    end,
    updated_at = now()
  where id = p_invoice_id
  returning * into inv;

  return inv;
end;
$$;

create or replace function public.record_payment(
  p_client_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_method text,
  p_reference text,
  p_notes text,
  p_allocations jsonb
)
returns uuid
language plpgsql
as $$
declare
  pay_id uuid;
  alloc record;
  inv public.invoices;
  alloc_sum numeric(12, 2) := 0;
  balance_due numeric(12, 2);
  item jsonb;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  if p_allocations is null or jsonb_array_length(p_allocations) = 0 then
    raise exception 'Allocate this payment to at least one invoice';
  end if;

  for item in select * from jsonb_array_elements(p_allocations)
  loop
    alloc_sum := alloc_sum + (item->>'amount')::numeric;
  end loop;

  if round(alloc_sum, 2) <> round(p_amount, 2) then
    raise exception 'Allocated amounts must equal the payment total';
  end if;

  insert into public.payments (
    client_id, amount, payment_date, method, reference, notes
  ) values (
    p_client_id,
    round(p_amount, 2),
    coalesce(p_payment_date, current_date),
    coalesce(nullif(trim(p_method), ''), 'cash'),
    nullif(trim(p_reference), ''),
    nullif(trim(p_notes), '')
  )
  returning id into pay_id;

  for item in select * from jsonb_array_elements(p_allocations)
  loop
    select * into inv
    from public.invoices
    where id = (item->>'invoice_id')::uuid
    for update;

    if not found then
      raise exception 'Invoice not found';
    end if;

    if inv.client_id <> p_client_id then
      raise exception 'Invoice does not belong to this client';
    end if;

    if inv.status not in ('issued', 'partial', 'paid') then
      raise exception 'Only issued invoices can receive payments';
    end if;

    balance_due := round(inv.total - coalesce(inv.amount_paid, 0), 2);
    if (item->>'amount')::numeric > balance_due then
      raise exception 'Allocation exceeds balance due on invoice %', coalesce(inv.number, inv.id::text);
    end if;

    insert into public.payment_allocations (payment_id, invoice_id, amount)
    values (pay_id, inv.id, round((item->>'amount')::numeric, 2));

    perform public.refresh_invoice_payment_status(inv.id);
  end loop;

  return pay_id;
end;
$$;

alter table public.payments enable row level security;
alter table public.payment_allocations enable row level security;

create policy "TEMP_dev_open_payments"
  on public.payments for all to anon, authenticated
  using (true) with check (true);

create policy "TEMP_dev_open_payment_allocations"
  on public.payment_allocations for all to anon, authenticated
  using (true) with check (true);

grant execute on function public.refresh_invoice_payment_status(uuid) to anon, authenticated;
grant execute on function public.record_payment(uuid, numeric, date, text, text, text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
