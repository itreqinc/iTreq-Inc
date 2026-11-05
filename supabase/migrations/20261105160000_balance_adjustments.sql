-- Account balance adjustments (write-offs): non-cash credits that settle
-- selected invoices and optionally brought-forward, visible on statements,
-- excluded from cash collected. Reversal posts an opposite debit row.

create table public.balance_adjustments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete restrict,
  adjustment_date date not null default current_date,
  amount numeric(12, 2) not null check (amount > 0),
  direction text not null default 'credit'
    check (direction in ('credit', 'debit')),
  reason text not null,
  notes text,
  opening_balance_delta numeric(12, 2) not null default 0,
  status text not null default 'posted'
    check (status in ('posted', 'reversed')),
  reverses_id uuid references public.balance_adjustments (id) on delete restrict,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint balance_adjustments_reversal_direction check (
    (reverses_id is null and direction = 'credit')
    or (reverses_id is not null and direction = 'debit')
  )
);

create index balance_adjustments_client_idx
  on public.balance_adjustments (client_id);
create index balance_adjustments_date_idx
  on public.balance_adjustments (adjustment_date);
create index balance_adjustments_reverses_idx
  on public.balance_adjustments (reverses_id)
  where reverses_id is not null;

create table public.balance_adjustment_allocations (
  id uuid primary key default gen_random_uuid(),
  adjustment_id uuid not null
    references public.balance_adjustments (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (adjustment_id, invoice_id)
);

create index balance_adjustment_allocations_adj_idx
  on public.balance_adjustment_allocations (adjustment_id);
create index balance_adjustment_allocations_invoice_idx
  on public.balance_adjustment_allocations (invoice_id);

alter table public.balance_adjustments enable row level security;
alter table public.balance_adjustment_allocations enable row level security;

-- Invoice paid amount = payment allocations + balance adjustment allocations.
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

  select
    coalesce((
      select sum(pa.amount)
      from public.payment_allocations pa
      where pa.invoice_id = p_invoice_id
    ), 0)
    + coalesce((
      select sum(ba.amount)
      from public.balance_adjustment_allocations ba
      where ba.invoice_id = p_invoice_id
    ), 0)
  into paid;

  if inv.status = 'void' then
    update public.invoices
    set
      amount_paid = round(paid, 2),
      updated_at = now()
    where id = p_invoice_id
    returning * into inv;
    return inv;
  end if;

  if inv.status = 'draft' then
    return inv;
  end if;

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

-- Remaining B/F includes payment and balance-adjustment deltas.
create or replace function public.client_opening_remaining(
  p_client_id uuid,
  p_exclude_payment_id uuid default null
)
returns numeric
language sql
stable
as $$
  select round(
    coalesce((select c.opening_balance from public.clients c where c.id = p_client_id), 0)
    + coalesce((
        select sum(p.opening_balance_delta)
        from public.payments p
        where p.client_id = p_client_id
          and (p_exclude_payment_id is null or p.id is distinct from p_exclude_payment_id)
      ), 0)
    + coalesce((
        select sum(a.opening_balance_delta)
        from public.balance_adjustments a
        where a.client_id = p_client_id
      ), 0),
    2
  );
$$;

-- Closing AR as of a date (includes activity on that date). Used to cap write-offs.
create or replace function public.client_balance_as_of(
  p_client_id uuid,
  p_as_of date
)
returns numeric
language plpgsql
stable
as $$
declare
  bal numeric(12, 2) := 0;
  opening_amt numeric(12, 2);
  opening_date date;
begin
  if p_as_of is null then
    raise exception 'As-of date is required';
  end if;

  select c.opening_balance, c.opening_balance_date
  into opening_amt, opening_date
  from public.clients c
  where c.id = p_client_id;

  if not found then
    raise exception 'Client not found';
  end if;

  opening_amt := coalesce(opening_amt, 0);
  if opening_amt <> 0 and opening_date is not null and opening_date <= p_as_of then
    bal := bal + opening_amt;
  end if;

  bal := bal + coalesce((
    select sum(i.total)
    from public.invoices i
    where i.client_id = p_client_id
      and i.status in ('issued', 'partial', 'paid')
      and i.issue_date is not null
      and i.issue_date <= p_as_of
  ), 0);

  bal := bal - coalesce((
    select sum(p.amount)
    from public.payments p
    where p.client_id = p_client_id
      and coalesce(p.is_adjustment, false) = false
      and p.payment_date is not null
      and p.payment_date <= p_as_of
  ), 0);

  bal := bal - coalesce((
    select sum(a.amount)
    from public.balance_adjustments a
    where a.client_id = p_client_id
      and a.direction = 'credit'
      and a.adjustment_date is not null
      and a.adjustment_date <= p_as_of
  ), 0);

  bal := bal + coalesce((
    select sum(a.amount)
    from public.balance_adjustments a
    where a.client_id = p_client_id
      and a.direction = 'debit'
      and a.adjustment_date is not null
      and a.adjustment_date <= p_as_of
  ), 0);

  return round(coalesce(bal, 0), 2);
end;
$$;

create or replace function public.create_balance_adjustment(
  p_client_id uuid,
  p_amount numeric,
  p_adjustment_date date,
  p_reason text,
  p_notes text,
  p_allocations jsonb,
  p_opening_amount numeric default 0,
  p_created_by uuid default null
)
returns uuid
language plpgsql
as $$
declare
  adj_id uuid;
  inv public.invoices;
  alloc_sum numeric(12, 2) := 0;
  opening_amt numeric(12, 2) := round(coalesce(p_opening_amount, 0), 2);
  remaining_bf numeric(12, 2);
  balance_due numeric(12, 2);
  as_of_bal numeric(12, 2);
  item jsonb;
  alloc_len int := 0;
  this_alloc numeric(12, 2);
  reason_text text := nullif(trim(coalesce(p_reason, '')), '');
  adj_date date := coalesce(p_adjustment_date, current_date);
begin
  if p_client_id is null then
    raise exception 'Client is required';
  end if;

  if p_amount is null or round(p_amount, 2) <= 0 then
    raise exception 'Adjustment amount must be greater than zero';
  end if;

  if reason_text is null then
    raise exception 'A reason is required for balance adjustments';
  end if;

  if opening_amt < 0 then
    raise exception 'Brought-forward allocation cannot be negative';
  end if;

  if p_allocations is not null and jsonb_typeof(p_allocations) = 'array' then
    alloc_len := jsonb_array_length(p_allocations);
  end if;

  if alloc_len > 0 then
    for item in select * from jsonb_array_elements(p_allocations)
    loop
      alloc_sum := alloc_sum + coalesce((item->>'amount')::numeric, 0);
    end loop;
  end if;

  if round(alloc_sum + opening_amt, 2) > round(p_amount, 2) then
    raise exception 'Allocated amounts cannot exceed the adjustment total';
  end if;

  if not exists (select 1 from public.clients where id = p_client_id for update) then
    raise exception 'Client not found';
  end if;

  as_of_bal := public.client_balance_as_of(p_client_id, adj_date);
  if round(p_amount, 2) > as_of_bal + 0.001 then
    raise exception
      'Cannot subtract %; balance as of % is only %',
      round(p_amount, 2),
      adj_date,
      as_of_bal;
  end if;

  remaining_bf := public.client_opening_remaining(p_client_id);
  if opening_amt > 0 then
    if remaining_bf <= 0 then
      raise exception 'This client has no positive brought-forward balance to settle';
    end if;
    if opening_amt > remaining_bf + 0.001 then
      raise exception
        'Brought-forward allocation % exceeds the balance %',
        opening_amt,
        remaining_bf;
    end if;
  end if;

  insert into public.balance_adjustments (
    client_id,
    adjustment_date,
    amount,
    direction,
    reason,
    notes,
    opening_balance_delta,
    status,
    created_by
  ) values (
    p_client_id,
    adj_date,
    round(p_amount, 2),
    'credit',
    reason_text,
    nullif(trim(coalesce(p_notes, '')), ''),
    case when opening_amt > 0 then -opening_amt else 0 end,
    'posted',
    p_created_by
  )
  returning id into adj_id;

  if alloc_len > 0 then
    for item in select * from jsonb_array_elements(p_allocations)
    loop
      this_alloc := coalesce((item->>'amount')::numeric, 0);
      if this_alloc <= 0 then
        continue;
      end if;

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
        raise exception 'Only issued invoices can receive adjustments';
      end if;

      balance_due := round(inv.total - coalesce(inv.amount_paid, 0), 2);
      if this_alloc > balance_due + 0.001 then
        raise exception
          'Allocation exceeds balance due on invoice %',
          coalesce(inv.number, inv.id::text);
      end if;

      insert into public.balance_adjustment_allocations (
        adjustment_id, invoice_id, amount
      ) values (
        adj_id, inv.id, round(this_alloc, 2)
      );

      perform public.refresh_invoice_payment_status(inv.id);
    end loop;
  end if;

  return adj_id;
end;
$$;

create or replace function public.reverse_balance_adjustment(
  p_adjustment_id uuid,
  p_created_by uuid default null
)
returns uuid
language plpgsql
as $$
declare
  orig public.balance_adjustments;
  rev_id uuid;
  inv_ids uuid[];
  iid uuid;
begin
  select * into orig
  from public.balance_adjustments
  where id = p_adjustment_id
  for update;

  if not found then
    raise exception 'Balance adjustment not found';
  end if;

  if orig.direction <> 'credit' or orig.status <> 'posted' then
    raise exception 'Only posted write-off adjustments can be reversed';
  end if;

  if exists (
    select 1 from public.balance_adjustments r where r.reverses_id = orig.id
  ) then
    raise exception 'This adjustment has already been reversed';
  end if;

  select coalesce(array_agg(invoice_id), '{}'::uuid[])
  into inv_ids
  from public.balance_adjustment_allocations
  where adjustment_id = orig.id;

  delete from public.balance_adjustment_allocations
  where adjustment_id = orig.id;

  foreach iid in array inv_ids
  loop
    perform public.refresh_invoice_payment_status(iid);
  end loop;

  update public.balance_adjustments
  set
    status = 'reversed',
    updated_at = now()
  where id = orig.id;

  insert into public.balance_adjustments (
    client_id,
    adjustment_date,
    amount,
    direction,
    reason,
    notes,
    opening_balance_delta,
    status,
    reverses_id,
    created_by
  ) values (
    orig.client_id,
    current_date,
    orig.amount,
    'debit',
    'Reversal: ' || orig.reason,
    orig.notes,
    -orig.opening_balance_delta,
    'posted',
    orig.id,
    p_created_by
  )
  returning id into rev_id;

  return rev_id;
end;
$$;

-- Voiding must also release balance-adjustment allocations on the invoice.
create or replace function public.void_invoice(p_invoice_id uuid)
returns public.invoices
language plpgsql
as $$
declare
  inv public.invoices;
  line record;
  pay_ids uuid[];
  was_void boolean;
begin
  select * into inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found';
  end if;

  was_void := inv.status = 'void';

  select coalesce(array_agg(distinct payment_id), '{}') into pay_ids
  from public.payment_allocations
  where invoice_id = p_invoice_id;

  delete from public.payment_allocations
  where invoice_id = p_invoice_id;

  delete from public.balance_adjustment_allocations
  where invoice_id = p_invoice_id;

  if cardinality(pay_ids) > 0 then
    delete from public.payments p
    where p.id = any (pay_ids)
      and coalesce(p.is_adjustment, false)
      and coalesce(p.opening_balance_delta, 0) > 0
      and not exists (
        select 1 from public.payment_allocations pa where pa.payment_id = p.id
      );
  end if;

  update public.invoice_disputes
  set
    status = 'resolved',
    resolved_at = coalesce(resolved_at, now()),
    updated_at = now()
  where invoice_id = p_invoice_id
    and status = 'open';

  if was_void then
    update public.invoices
    set
      amount_paid = 0,
      updated_at = now()
    where id = p_invoice_id
    returning * into inv;
    return inv;
  end if;

  if inv.status <> 'draft' then
    for line in
      select il.*, p.tracks_stock
      from public.invoice_lines il
      left join public.products p on p.id = il.product_id
      where il.invoice_id = p_invoice_id
    loop
      if coalesce(line.tracks_stock, false) then
        insert into public.stock_movements (
          product_id, quantity_delta, reason, note, reference_type, reference_id
        ) values (
          line.product_id,
          ceil(line.quantity)::integer,
          'invoice_void',
          'Voided invoice — stock restored',
          'invoice',
          p_invoice_id
        );
      end if;
    end loop;
  end if;

  update public.invoices
  set
    status = 'void',
    amount_paid = 0,
    updated_at = now()
  where id = p_invoice_id
  returning * into inv;

  return inv;
end;
$$;

grant execute on function public.client_balance_as_of(uuid, date) to authenticated;
grant execute on function public.create_balance_adjustment(
  uuid, numeric, date, text, text, jsonb, numeric, uuid
) to authenticated;
grant execute on function public.reverse_balance_adjustment(uuid, uuid) to authenticated;
grant execute on function public.refresh_invoice_payment_status(uuid) to authenticated;
grant execute on function public.client_opening_remaining(uuid, uuid) to authenticated;
grant execute on function public.void_invoice(uuid) to authenticated;

revoke execute on function public.client_balance_as_of(uuid, date) from anon;
revoke execute on function public.create_balance_adjustment(
  uuid, numeric, date, text, text, jsonb, numeric, uuid
) from anon;
revoke execute on function public.reverse_balance_adjustment(uuid, uuid) from anon;

notify pgrst, 'reload schema';
