-- Apply payments to positive opening balances, and apply negative opening
-- credit to invoices. Track the effect on clients.opening_balance per payment.

alter table public.payments
  add column if not exists opening_balance_delta numeric(12, 2) not null default 0;

comment on column public.payments.opening_balance_delta is
  'Change applied to clients.opening_balance when this payment was recorded. '
  'Negative = payment reduced amount owed (brought forward). '
  'Positive = negative opening credit consumed toward an invoice.';

-- Credit available for invoices excludes money already applied to opening B/F.
create or replace function public.get_client_credit_balance(p_client_id uuid)
returns numeric
language sql
stable
as $$
  select round(
    coalesce((
      select sum(p.amount)
      from public.payments p
      where p.client_id = p_client_id
    ), 0)
    - coalesce((
      select sum(pa.amount)
      from public.payment_allocations pa
      inner join public.payments p on p.id = pa.payment_id
      where p.client_id = p_client_id
    ), 0)
    - coalesce((
      select sum(greatest(0, -p.opening_balance_delta))
      from public.payments p
      where p.client_id = p_client_id
    ), 0),
    2
  );
$$;

-- Unallocated remainder on a payment (for FIFO credit apply).
create or replace function public.payment_unallocated_amount(p public.payments)
returns numeric
language sql
stable
as $$
  select round(
    p.amount
    - coalesce((
        select sum(pa.amount)
        from public.payment_allocations pa
        where pa.payment_id = p.id
      ), 0)
    - greatest(0, -coalesce(p.opening_balance_delta, 0)),
    2
  );
$$;

create or replace function public.apply_client_credit_to_invoice(
  p_invoice_id uuid,
  p_amount numeric default null
)
returns numeric
language plpgsql
as $$
declare
  inv public.invoices;
  credit numeric(12, 2);
  balance_due numeric(12, 2);
  to_apply numeric(12, 2);
  remaining numeric(12, 2);
  pay record;
  take numeric(12, 2);
  applied numeric(12, 2) := 0;
begin
  select * into inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found';
  end if;

  if inv.status not in ('issued', 'partial', 'paid') then
    raise exception 'Credit can only be applied to issued invoices';
  end if;

  balance_due := round(inv.total - coalesce(inv.amount_paid, 0), 2);
  if balance_due <= 0 then
    return 0;
  end if;

  credit := public.get_client_credit_balance(inv.client_id);
  if credit <= 0 then
    return 0;
  end if;

  to_apply := least(credit, balance_due);
  if p_amount is not null and p_amount > 0 then
    to_apply := least(to_apply, round(p_amount, 2));
  end if;

  if to_apply <= 0 then
    return 0;
  end if;

  remaining := to_apply;

  for pay in
    select
      p.id as payment_id,
      public.payment_unallocated_amount(p) as unallocated
    from public.payments p
    where p.client_id = inv.client_id
    order by p.payment_date asc, p.created_at asc
  loop
    if pay.unallocated <= 0 then
      continue;
    end if;

    take := least(remaining, pay.unallocated);
    if take <= 0 then
      continue;
    end if;

    insert into public.payment_allocations (payment_id, invoice_id, amount)
    values (pay.payment_id, inv.id, take);

    remaining := round(remaining - take, 2);
    applied := round(applied + take, 2);

    if remaining <= 0 then
      exit;
    end if;
  end loop;

  if remaining > 0.01 then
    raise exception 'Could not apply the requested credit (insufficient unallocated payments)';
  end if;

  perform public.refresh_invoice_payment_status(inv.id);
  return applied;
end;
$$;

create or replace function public.delete_payment(p_payment_id uuid)
returns void
language plpgsql
as $$
declare
  pay public.payments;
  inv_ids uuid[];
  iid uuid;
  new_opening numeric(12, 2);
begin
  select * into pay from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Payment not found';
  end if;

  select coalesce(array_agg(invoice_id), '{}'::uuid[])
  into inv_ids
  from public.payment_allocations
  where payment_id = p_payment_id;

  if coalesce(pay.opening_balance_delta, 0) <> 0 then
    update public.clients
    set
      opening_balance = round(coalesce(opening_balance, 0) - pay.opening_balance_delta, 2),
      opening_balance_date = case
        when round(coalesce(opening_balance, 0) - pay.opening_balance_delta, 2) = 0 then null
        else opening_balance_date
      end,
      updated_at = now()
    where id = pay.client_id
    returning opening_balance into new_opening;

    -- Keep date when restoring a non-zero opening if it was cleared.
    if new_opening <> 0 then
      update public.clients
      set opening_balance_date = coalesce(opening_balance_date, pay.payment_date)
      where id = pay.client_id and opening_balance_date is null;
    end if;
  end if;

  delete from public.payments where id = p_payment_id;

  foreach iid in array inv_ids
  loop
    perform public.refresh_invoice_payment_status(iid);
  end loop;
end;
$$;

create or replace function public.update_payment(
  p_payment_id uuid,
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
  pay public.payments;
  inv public.invoices;
  old_inv_ids uuid[];
  alloc_sum numeric(12, 2) := 0;
  balance_due numeric(12, 2);
  item jsonb;
  alloc_len int := 0;
  iid uuid;
  this_alloc numeric(12, 2);
begin
  select * into pay from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Payment not found';
  end if;

  if coalesce(pay.opening_balance_delta, 0) <> 0 then
    raise exception
      'This payment adjusts an opening balance. Delete it instead of editing, then record a new one.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  if p_allocations is not null and jsonb_typeof(p_allocations) = 'array' then
    alloc_len := jsonb_array_length(p_allocations);
  end if;

  if alloc_len > 0 then
    for item in select * from jsonb_array_elements(p_allocations)
    loop
      alloc_sum := alloc_sum + coalesce((item->>'amount')::numeric, 0);
    end loop;
    if round(alloc_sum, 2) > round(p_amount, 2) then
      raise exception 'Allocated amounts cannot exceed the payment total';
    end if;
  end if;

  select coalesce(array_agg(invoice_id), '{}'::uuid[])
  into old_inv_ids
  from public.payment_allocations
  where payment_id = p_payment_id;

  delete from public.payment_allocations where payment_id = p_payment_id;

  foreach iid in array old_inv_ids
  loop
    perform public.refresh_invoice_payment_status(iid);
  end loop;

  update public.payments
  set
    amount = round(p_amount, 2),
    payment_date = coalesce(p_payment_date, payment_date),
    method = coalesce(nullif(trim(p_method), ''), method),
    reference = nullif(trim(p_reference), ''),
    notes = nullif(trim(p_notes), ''),
    updated_at = now()
  where id = p_payment_id;

  if alloc_len = 0 then
    return p_payment_id;
  end if;

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

    if inv.client_id <> pay.client_id then
      raise exception 'Invoice does not belong to this client';
    end if;

    if inv.status not in ('issued', 'partial', 'paid') then
      raise exception 'Only issued invoices can receive payments';
    end if;

    balance_due := round(inv.total - coalesce(inv.amount_paid, 0), 2);
    if this_alloc > balance_due then
      raise exception 'Allocation exceeds balance due on invoice %', coalesce(inv.number, inv.id::text);
    end if;

    insert into public.payment_allocations (payment_id, invoice_id, amount)
    values (p_payment_id, inv.id, round(this_alloc, 2));

    perform public.refresh_invoice_payment_status(inv.id);
  end loop;

  return p_payment_id;
end;
$$;

-- Record a receipt against a positive opening (brought-forward) balance.
create or replace function public.apply_payment_to_opening_balance(
  p_client_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_method text,
  p_reference text,
  p_notes text
)
returns uuid
language plpgsql
as $$
declare
  cl public.clients;
  apply_amt numeric(12, 2);
  pay_id uuid;
  new_opening numeric(12, 2);
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  select * into cl from public.clients where id = p_client_id for update;
  if not found then
    raise exception 'Client not found';
  end if;

  if round(coalesce(cl.opening_balance, 0), 2) <= 0 then
    raise exception 'This client has no positive brought-forward balance to pay';
  end if;

  apply_amt := least(round(p_amount, 2), round(cl.opening_balance, 2));
  if apply_amt <= 0 then
    raise exception 'Nothing to apply to the brought-forward balance';
  end if;

  if round(p_amount, 2) > apply_amt then
    raise exception
      'Payment % exceeds the brought-forward balance %. Enter % or less.',
      round(p_amount, 2), apply_amt, apply_amt;
  end if;

  new_opening := round(cl.opening_balance - apply_amt, 2);

  insert into public.payments (
    client_id, amount, payment_date, method, reference, notes, opening_balance_delta
  ) values (
    p_client_id,
    apply_amt,
    coalesce(p_payment_date, current_date),
    coalesce(nullif(trim(p_method), ''), 'cash'),
    nullif(trim(p_reference), ''),
    coalesce(
      nullif(trim(p_notes), ''),
      'Applied to brought-forward balance'
    ),
    -apply_amt
  )
  returning id into pay_id;

  update public.clients
  set
    opening_balance = new_opening,
    opening_balance_date = case when new_opening = 0 then null else opening_balance_date end,
    updated_at = now()
  where id = p_client_id;

  return pay_id;
end;
$$;

-- Consume negative opening (credit) against an open invoice.
create or replace function public.apply_opening_credit_to_invoice(
  p_client_id uuid,
  p_invoice_id uuid,
  p_amount numeric default null
)
returns numeric
language plpgsql
as $$
declare
  cl public.clients;
  inv public.invoices;
  available numeric(12, 2);
  balance_due numeric(12, 2);
  to_apply numeric(12, 2);
  pay_id uuid;
  new_opening numeric(12, 2);
begin
  select * into cl from public.clients where id = p_client_id for update;
  if not found then
    raise exception 'Client not found';
  end if;

  available := round(abs(least(coalesce(cl.opening_balance, 0), 0)), 2);
  if available <= 0 then
    raise exception 'This client has no brought-forward credit to apply';
  end if;

  select * into inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found';
  end if;

  if inv.client_id <> p_client_id then
    raise exception 'Invoice does not belong to this client';
  end if;

  if inv.status not in ('issued', 'partial', 'paid') then
    raise exception 'Credit can only be applied to issued invoices';
  end if;

  balance_due := round(inv.total - coalesce(inv.amount_paid, 0), 2);
  if balance_due <= 0 then
    return 0;
  end if;

  to_apply := least(available, balance_due);
  if p_amount is not null and p_amount > 0 then
    to_apply := least(to_apply, round(p_amount, 2));
  end if;

  if to_apply <= 0 then
    return 0;
  end if;

  new_opening := round(cl.opening_balance + to_apply, 2);

  insert into public.payments (
    client_id, amount, payment_date, method, reference, notes, opening_balance_delta
  ) values (
    p_client_id,
    to_apply,
    current_date,
    'other',
    null,
    'Applied from brought-forward credit',
    to_apply
  )
  returning id into pay_id;

  insert into public.payment_allocations (payment_id, invoice_id, amount)
  values (pay_id, inv.id, to_apply);

  update public.clients
  set
    opening_balance = new_opening,
    opening_balance_date = case when new_opening = 0 then null else opening_balance_date end,
    updated_at = now()
  where id = p_client_id;

  perform public.refresh_invoice_payment_status(inv.id);
  return to_apply;
end;
$$;

grant execute on function public.apply_payment_to_opening_balance(uuid, numeric, date, text, text, text)
  to anon, authenticated;
grant execute on function public.apply_opening_credit_to_invoice(uuid, uuid, numeric)
  to anon, authenticated;
grant execute on function public.payment_unallocated_amount(public.payments)
  to anon, authenticated;

notify pgrst, 'reload schema';
