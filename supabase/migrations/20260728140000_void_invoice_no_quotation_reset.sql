-- Quotation reopen happens on invoice DELETE (app layer), not void.
-- Restore void_invoice to stock-restore-only (no quotation status change).

create or replace function public.void_invoice(p_invoice_id uuid)
returns public.invoices
language plpgsql
as $$
declare
  inv public.invoices;
  line record;
begin
  select * into inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found';
  end if;
  if inv.status = 'void' then
    return inv;
  end if;
  if inv.status = 'draft' then
    update public.invoices
      set status = 'void', updated_at = now()
      where id = p_invoice_id
      returning * into inv;
    return inv;
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
        ceil(line.quantity)::integer,
        'invoice_void',
        'Voided invoice — stock restored',
        'invoice',
        p_invoice_id
      );
    end if;
  end loop;

  update public.invoices
  set status = 'void', updated_at = now()
  where id = p_invoice_id
  returning * into inv;

  return inv;
end;
$$;

notify pgrst, 'reload schema';
