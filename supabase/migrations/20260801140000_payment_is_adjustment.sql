-- Mark opening-credit applications as adjustments (not bank collections).

alter table public.payments
  add column if not exists is_adjustment boolean not null default false;

comment on column public.payments.is_adjustment is
  'True for non-cash applications (e.g. brought-forward credit to invoice). '
  'Excluded from collected-income totals.';

-- Backfill existing opening-credit applications.
update public.payments
set is_adjustment = true
where coalesce(opening_balance_delta, 0) > 0
   or notes = 'Applied from brought-forward credit';

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
  -- Keep the original brought-forward date, not the day credit was applied.
  -- (payment_date set below via coalesce)

  insert into public.payments (
    client_id, amount, payment_date, method, reference, notes,
    opening_balance_delta, is_adjustment
  ) values (
    p_client_id,
    to_apply,
    coalesce(cl.opening_balance_date, current_date),
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
    opening_balance_date = case when new_opening = 0 then null else opening_balance_date end,
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
      client_id, amount, payment_date, method, reference, notes,
      opening_balance_delta, is_adjustment
    ) values (
      p_client_id,
      take,
      coalesce(cl.opening_balance_date, current_date),
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
    opening_balance_date = case when new_opening = 0 then null else opening_balance_date end,
    updated_at = now()
  where id = p_client_id;

  return applied;
end;
$$;

notify pgrst, 'reload schema';
