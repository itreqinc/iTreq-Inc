-- Allow a single payment to allocate part of the receipt to positive brought-forward
-- balance together with invoice allocations (same Record payment form).

drop function if exists public.record_payment(uuid, numeric, date, text, text, text, jsonb);

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
      opening_balance_date = case when new_opening = 0 then null else opening_balance_date end,
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

drop function if exists public.update_payment(uuid, numeric, date, text, text, text, jsonb);

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

  -- Reverse any previous brought-forward application from this payment.
  if old_delta <> 0 then
    restored_opening := round(coalesce(cl.opening_balance, 0) - old_delta, 2);
    update public.clients
    set
      opening_balance = restored_opening,
      opening_balance_date = case
        when restored_opening = 0 then null
        else coalesce(opening_balance_date, pay.payment_date)
      end,
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
      opening_balance_date = case when new_opening = 0 then null else opening_balance_date end,
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

grant execute on function public.record_payment(uuid, numeric, date, text, text, text, jsonb, numeric)
  to authenticated;
grant execute on function public.update_payment(uuid, numeric, date, text, text, text, jsonb, numeric)
  to authenticated;

notify pgrst, 'reload schema';
