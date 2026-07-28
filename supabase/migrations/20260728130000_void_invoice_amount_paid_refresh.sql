-- Keep amount_paid accurate on void invoices when payment allocations change.
-- Previously refresh_invoice_payment_status skipped void rows, leaving stale amount_paid
-- and blocking admin delete even after all payments were removed.

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

  select coalesce(sum(amount), 0) into paid
  from public.payment_allocations
  where invoice_id = p_invoice_id;

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

-- Repair any void invoices that still show a balance after allocations were removed.
update public.invoices i
set
  amount_paid = coalesce((
    select round(sum(pa.amount), 2)
    from public.payment_allocations pa
    where pa.invoice_id = i.id
  ), 0),
  updated_at = now()
where i.status = 'void';

notify pgrst, 'reload schema';
