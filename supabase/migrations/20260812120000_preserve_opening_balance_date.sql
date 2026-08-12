-- Keep opening_balance_date when balance reaches zero via payments or credit
-- application so Accounts can show historical carry-in after settlement.
-- Staff clearing via update_client_opening_balance(amount=0) still nulls the date.

create or replace function public.record_payment(
  p_client_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_method text,
  p_reference text,
  p_notes text,
  p_allocations jsonb,
  p_opening_amount numeric default 0
)
returns uuid
language plpgsql
as $$
declare
  pay_id uuid;
  inv public.invoices;
  cl public.clients;
  alloc_sum numeric(12, 2) := 0;
  opening_amt numeric(12, 2) := round(coalesce(p_opening_amount, 0), 2);
  balance_due numeric(12, 2);
  item jsonb;
  alloc_len int := 0;
  new_opening numeric(12, 2);
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
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
    raise exception 'Allocated amounts cannot exceed the payment total';
  end if;

  if opening_amt > 0 then
    select * into cl from public.clients where id = p_client_id for update;
    if not found then
      raise exception 'Client not found';
    end if;
    if round(coalesce(cl.opening_balance, 0), 2) <= 0 then
      raise exception 'This client has no positive brought-forward balance to pay';
    end if;
    if opening_amt > round(cl.opening_balance, 2) + 0.001 then
      raise exception
        'Brought-forward allocation % exceeds the balance %',
        opening_amt,
        round(cl.opening_balance, 2);
    end if;
  end if;

  insert into public.payments (
    client_id, amount, payment_date, method, reference, notes, opening_balance_delta
  ) values (
    p_client_id,
    round(p_amount, 2),
    coalesce(p_payment_date, current_date),
    coalesce(nullif(trim(p_method), ''), 'cash'),
    nullif(trim(p_reference), ''),
    nullif(trim(p_notes), ''),
    case when opening_amt > 0 then -opening_amt else 0 end
  )
  returning id into pay_id;

  if opening_amt > 0 then
    new_opening := round(cl.opening_balance - opening_amt, 2);
    update public.clients
    set
      opening_balance = new_opening,
      updated_at = now()
    where id = p_client_id;
  end if;

  if alloc_len = 0 then
    return pay_id;
  end if;

  for item in select * from jsonb_array_elements(p_allocations)
  loop
    if coalesce((item->>'amount')::numeric, 0) <= 0 then
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

create or replace function public.update_payment(
  p_payment_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_method text,
  p_reference text,
  p_notes text,
  p_allocations jsonb,
  p_opening_amount numeric default 0
)
returns uuid
language plpgsql
as $$
declare
  pay public.payments;
  inv public.invoices;
  cl public.clients;
  old_inv_ids uuid[];
  alloc_sum numeric(12, 2) := 0;
  opening_amt numeric(12, 2) := round(coalesce(p_opening_amount, 0), 2);
  balance_due numeric(12, 2);
  item jsonb;
  alloc_len int := 0;
  iid uuid;
  this_alloc numeric(12, 2);
  old_delta numeric(12, 2);
  restored_opening numeric(12, 2);
  new_opening numeric(12, 2);
begin
  select * into pay from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Payment not found';
  end if;

  if coalesce(pay.is_adjustment, false) then
    raise exception
      'This payment is an adjustment. Delete it instead of editing, then record a new one.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
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
    raise exception 'Allocated amounts cannot exceed the payment total';
  end if;

  old_delta := coalesce(pay.opening_balance_delta, 0);

  select * into cl from public.clients where id = pay.client_id for update;
  if not found then
    raise exception 'Client not found';
  end if;

  if old_delta <> 0 then
    restored_opening := round(coalesce(cl.opening_balance, 0) - old_delta, 2);
    update public.clients
    set
      opening_balance = restored_opening,
      opening_balance_date = coalesce(opening_balance_date, pay.payment_date),
      updated_at = now()
    where id = pay.client_id;
    cl.opening_balance := restored_opening;
  end if;

  if opening_amt > 0 then
    if round(coalesce(cl.opening_balance, 0), 2) <= 0 then
      raise exception 'This client has no positive brought-forward balance to pay';
    end if;
    if opening_amt > round(cl.opening_balance, 2) + 0.001 then
      raise exception
        'Brought-forward allocation % exceeds the balance %',
        opening_amt,
        round(cl.opening_balance, 2);
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
    opening_balance_delta = case when opening_amt > 0 then -opening_amt else 0 end,
    updated_at = now()
  where id = p_payment_id;

  if opening_amt > 0 then
    new_opening := round(cl.opening_balance - opening_amt, 2);
    update public.clients
    set
      opening_balance = new_opening,
      updated_at = now()
    where id = pay.client_id;
  end if;

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
    updated_at = now()
  where id = p_client_id;

  return pay_id;
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
      opening_balance_date = coalesce(opening_balance_date, pay.payment_date),
      updated_at = now()
    where id = pay.client_id;
  end if;

  delete from public.payments where id = p_payment_id;

  foreach iid in array inv_ids
  loop
    perform public.refresh_invoice_payment_status(iid);
  end loop;
end;
$$;

create or replace function public.apply_client_credit_to_opening_balance(
  p_client_id uuid,
  p_amount numeric default null
)
returns numeric
language plpgsql
as $$
declare
  cl public.clients;
  credit numeric(12, 2);
  opening numeric(12, 2);
  to_apply numeric(12, 2);
  remaining numeric(12, 2);
  pay record;
  take numeric(12, 2);
  applied numeric(12, 2) := 0;
  new_opening numeric(12, 2);
begin
  select * into cl from public.clients where id = p_client_id for update;
  if not found then
    raise exception 'Client not found';
  end if;

  opening := round(coalesce(cl.opening_balance, 0), 2);
  if opening <= 0 then
    raise exception 'This client has no positive brought-forward balance';
  end if;

  credit := public.get_client_credit_balance(p_client_id);
  if credit <= 0 then
    raise exception 'This client has no unapplied payment to use';
  end if;

  to_apply := least(credit, opening);
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
    where p.client_id = p_client_id
    order by p.payment_date asc, p.created_at asc
  loop
    if pay.unallocated <= 0 then
      continue;
    end if;

    take := least(remaining, pay.unallocated);
    if take <= 0 then
      continue;
    end if;

    update public.payments
    set
      opening_balance_delta = round(coalesce(opening_balance_delta, 0) - take, 2),
      updated_at = now()
    where id = pay.payment_id;

    remaining := round(remaining - take, 2);
    applied := round(applied + take, 2);

    if remaining <= 0 then
      exit;
    end if;
  end loop;

  if remaining > 0.01 then
    raise exception 'Could not apply the requested credit (insufficient unallocated payments)';
  end if;

  new_opening := round(opening - applied, 2);
  update public.clients
  set
    opening_balance = new_opening,
    updated_at = now()
  where id = p_client_id;

  return applied;
end;
$$;

-- Latest versions from 20260801160000_adjustment_timeline_source_date.sql
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
  apply_date date := current_date;
  origin_date date;
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
  origin_date := coalesce(cl.opening_balance_date, apply_date);

  insert into public.payments (
    client_id, amount, payment_date, source_date, method, reference, notes,
    opening_balance_delta, is_adjustment
  ) values (
    p_client_id,
    to_apply,
    apply_date,
    origin_date,
    'other',
    null,
    'Applied from brought-forward credit',
    to_apply,
    true
  )
  returning id into pay_id;

  insert into public.payment_allocations (payment_id, invoice_id, amount)
  values (pay_id, inv.id, to_apply);

  update public.clients
  set
    opening_balance = new_opening,
    updated_at = now()
  where id = p_client_id;

  perform public.refresh_invoice_payment_status(inv.id);
  return to_apply;
end;
$$;

create or replace function public.apply_opening_credit_to_invoices(
  p_client_id uuid,
  p_allocations jsonb
)
returns numeric
language plpgsql
as $$
declare
  cl public.clients;
  available numeric(12, 2);
  remaining_credit numeric(12, 2);
  item jsonb;
  inv public.invoices;
  balance_due numeric(12, 2);
  take numeric(12, 2);
  applied numeric(12, 2) := 0;
  pay_id uuid;
  new_opening numeric(12, 2);
  alloc_len int := 0;
  apply_date date := current_date;
  origin_date date;
begin
  if p_allocations is null or jsonb_typeof(p_allocations) <> 'array' then
    raise exception 'Select at least one invoice';
  end if;
  alloc_len := jsonb_array_length(p_allocations);
  if alloc_len = 0 then
    raise exception 'Select at least one invoice';
  end if;

  select * into cl from public.clients where id = p_client_id for update;
  if not found then
    raise exception 'Client not found';
  end if;

  available := round(abs(least(coalesce(cl.opening_balance, 0), 0)), 2);
  if available <= 0 then
    raise exception 'This client has no brought-forward credit to apply';
  end if;

  remaining_credit := available;
  origin_date := coalesce(cl.opening_balance_date, apply_date);

  for item in select * from jsonb_array_elements(p_allocations)
  loop
    take := round(coalesce((item->>'amount')::numeric, 0), 2);
    if take <= 0 then
      continue;
    end if;
    if take > remaining_credit then
      raise exception 'Allocated amounts exceed the brought-forward credit available';
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
      raise exception 'Credit can only be applied to issued invoices';
    end if;

    balance_due := round(inv.total - coalesce(inv.amount_paid, 0), 2);
    if take > balance_due then
      raise exception 'Allocation exceeds balance due on invoice %', coalesce(inv.number, inv.id::text);
    end if;

    insert into public.payments (
      client_id, amount, payment_date, source_date, method, reference, notes,
      opening_balance_delta, is_adjustment
    ) values (
      p_client_id,
      take,
      apply_date,
      origin_date,
      'other',
      null,
      'Applied from brought-forward credit',
      take,
      true
    )
    returning id into pay_id;

    insert into public.payment_allocations (payment_id, invoice_id, amount)
    values (pay_id, inv.id, take);

    perform public.refresh_invoice_payment_status(inv.id);

    remaining_credit := round(remaining_credit - take, 2);
    applied := round(applied + take, 2);
  end loop;

  if applied <= 0 then
    return 0;
  end if;

  new_opening := round(cl.opening_balance + applied, 2);
  update public.clients
  set
    opening_balance = new_opening,
    updated_at = now()
  where id = p_client_id;

  return applied;
end;
$$;

notify pgrst, 'reload schema';
