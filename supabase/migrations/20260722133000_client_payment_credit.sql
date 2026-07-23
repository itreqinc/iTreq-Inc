-- Client account credit: payments without invoices, apply credit when invoicing.

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
    ), 0),
    2
  );
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
  inv public.invoices;
  alloc_sum numeric(12, 2) := 0;
  balance_due numeric(12, 2);
  item jsonb;
  alloc_len int := 0;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  if p_allocations is not null and jsonb_typeof(p_allocations) = 'array' then
    alloc_len := jsonb_array_length(p_allocations);
  end if;

  if alloc_len > 0 then
    for item in select * from jsonb_array_elements(p_allocations)
    loop
      alloc_sum := alloc_sum + (item->>'amount')::numeric;
    end loop;

    if round(alloc_sum, 2) > round(p_amount, 2) then
      raise exception 'Allocated amounts cannot exceed the payment total';
    end if;
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
      round(
        p.amount - coalesce((
          select sum(pa.amount)
          from public.payment_allocations pa
          where pa.payment_id = p.id
        ), 0),
        2
      ) as unallocated
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

grant execute on function public.get_client_credit_balance(uuid) to anon, authenticated;
grant execute on function public.apply_client_credit_to_invoice(uuid, numeric) to anon, authenticated;

notify pgrst, 'reload schema';
