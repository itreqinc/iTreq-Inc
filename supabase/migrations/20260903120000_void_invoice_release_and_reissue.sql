-- Voiding an invoice releases payments and related allocations so the
-- document can be edited and re-issued. Cash stays on the client account;
-- brought-forward credit applications that only existed for this invoice
-- are reversed so remaining B/F is restored. Quotation links stay until delete.

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

  -- Unallocate every payment / credit application tied to this invoice.
  select coalesce(array_agg(distinct payment_id), '{}') into pay_ids
  from public.payment_allocations
  where invoice_id = p_invoice_id;

  delete from public.payment_allocations
  where invoice_id = p_invoice_id;

  -- Reverse B/F credit applications created only for this invoice.
  -- Regular payments are left as unallocated on-account credit.
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

  -- Already void: do not restore stock again; just clear leftover ties.
  if was_void then
    update public.invoices
    set
      amount_paid = 0,
      updated_at = now()
    where id = p_invoice_id
    returning * into inv;
    return inv;
  end if;

  -- Issued / partial / paid deducted stock; drafts never did.
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

-- Allow re-issue of a voided invoice. Keeps the existing number when present
-- and deducts stock again (void restored it).
create or replace function public.issue_invoice(p_invoice_id uuid)
returns public.invoices
language plpgsql
as $$
declare
  inv public.invoices;
  line record;
  on_hand integer;
  doc_no text;
begin
  select * into inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found';
  end if;
  if inv.status in ('issued', 'partial', 'paid') and inv.number is not null then
    return inv;
  end if;
  if inv.status not in ('draft', 'void') then
    raise exception 'Only draft or voided invoices can be issued';
  end if;

  for line in
    select il.*, p.tracks_stock, p.sku
    from public.invoice_lines il
    left join public.products p on p.id = il.product_id
    where il.invoice_id = p_invoice_id
  loop
    if coalesce(line.tracks_stock, false) then
      select coalesce(sum(quantity_delta), 0)::integer into on_hand
      from public.stock_movements
      where product_id = line.product_id;

      if on_hand < ceil(line.quantity)::integer then
        raise exception 'Insufficient stock for % (need %, have %)',
          coalesce(line.sku, line.description), ceil(line.quantity)::integer, on_hand;
      end if;
    end if;
  end loop;

  if inv.number is null then
    doc_no := public.allocate_document_number('invoice');
  else
    doc_no := inv.number;
  end if;

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
        -ceil(line.quantity)::integer,
        'invoice_issue',
        'Issued invoice',
        'invoice',
        p_invoice_id
      );
    end if;
  end loop;

  update public.invoices
  set
    status = 'issued',
    number = doc_no,
    issue_date = coalesce(issue_date, current_date),
    amount_paid = 0,
    updated_at = now()
  where id = p_invoice_id
  returning * into inv;

  return inv;
end;
$$;

-- Invoices voided before this change may still have allocations attached.
do $$
declare
  r record;
begin
  for r in
    select distinct pa.invoice_id
    from public.payment_allocations pa
    inner join public.invoices i on i.id = pa.invoice_id
    where i.status = 'void'
  loop
    perform public.void_invoice(r.invoice_id);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
