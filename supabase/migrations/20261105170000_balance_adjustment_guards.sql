-- Tighten balance adjustments: full allocation required, and invoices must
-- already exist as of the adjustment date.

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
  cl public.clients;
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
  inv_issue date;
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

  if round(alloc_sum + opening_amt, 2) <> round(p_amount, 2) then
    raise exception
      'Allocate the full adjustment amount to invoices and/or brought forward (allocated %, required %)',
      round(alloc_sum + opening_amt, 2),
      round(p_amount, 2);
  end if;

  select * into cl from public.clients where id = p_client_id for update;
  if not found then
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
    if cl.opening_balance_date is null or cl.opening_balance_date > adj_date then
      raise exception
        'Brought-forward cannot be settled on %; opening balance date is %',
        adj_date,
        coalesce(cl.opening_balance_date::text, 'not set');
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

      inv_issue := coalesce(inv.issue_date, inv.created_at::date);
      if inv_issue is null or inv_issue > adj_date then
        raise exception
          'Invoice % is dated after the adjustment date %',
          coalesce(inv.number, inv.id::text),
          adj_date;
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

notify pgrst, 'reload schema';
