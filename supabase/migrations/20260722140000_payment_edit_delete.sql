-- Edit / delete payments with allocation rebuild and invoice status refresh.

create or replace function public.delete_payment(p_payment_id uuid)
returns void
language plpgsql
as $$
declare
  inv_ids uuid[];
  iid uuid;
begin
  select coalesce(array_agg(invoice_id), '{}'::uuid[])
  into inv_ids
  from public.payment_allocations
  where payment_id = p_payment_id;

  delete from public.payments where id = p_payment_id;
  if not found then
    raise exception 'Payment not found';
  end if;

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
  new_inv_ids uuid[] := '{}'::uuid[];
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

    -- amount_paid was refreshed without this payment's old allocations
    balance_due := round(inv.total - coalesce(inv.amount_paid, 0), 2);
    if this_alloc > balance_due then
      raise exception 'Allocation exceeds balance due on invoice %', coalesce(inv.number, inv.id::text);
    end if;

    insert into public.payment_allocations (payment_id, invoice_id, amount)
    values (p_payment_id, inv.id, round(this_alloc, 2));

    new_inv_ids := array_append(new_inv_ids, inv.id);
    perform public.refresh_invoice_payment_status(inv.id);
  end loop;

  return p_payment_id;
end;
$$;

grant execute on function public.delete_payment(uuid) to anon, authenticated;
grant execute on function public.update_payment(uuid, numeric, date, text, text, text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
