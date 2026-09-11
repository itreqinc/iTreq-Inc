-- Copy monthly-fee lines from one invoice onto a new draft dated the first
-- of a chosen month. Product stays the source SKU; description is copied with
-- only the month in brackets updated.

create or replace function public.copy_monthly_fee_invoice(
  p_source_invoice_id uuid,
  p_billing_period date
)
returns public.invoices
language plpgsql
as $$
declare
  src public.invoices;
  v_period date := public.month_start(coalesce(p_billing_period, current_date));
  v_due date := (v_period + interval '9 days')::date;
  v_tax numeric(5, 2);
  v_new_id uuid;
  v_subtotal numeric(12, 2) := 0;
  v_tax_amount numeric(12, 2);
  v_total numeric(12, 2);
  v_sort integer := 0;
  v_desc text;
  v_period_to_store date := v_period;
  line record;
  inv public.invoices;
begin
  select * into src from public.invoices where id = p_source_invoice_id;
  if not found then
    raise exception 'Invoice not found';
  end if;

  if not exists (
    select 1
    from public.invoice_lines il
    join public.products p on p.id = il.product_id
    where il.invoice_id = src.id
      and p.product_kind = 'monthly_fee'
  ) then
    raise exception 'This invoice has no monthly fee lines to copy';
  end if;

  if exists (
    select 1 from public.invoices i
    where i.client_id = src.client_id
      and i.billing_period = v_period
      and i.status <> 'void'
  ) then
    v_period_to_store := null;
  end if;

  select coalesce(default_tax_rate, 0) into v_tax
  from public.company_settings where id = 1;

  insert into public.invoices (
    client_id,
    status,
    issue_date,
    due_date,
    notes,
    billing_period,
    discount_amount,
    subtotal,
    tax_amount,
    total,
    amount_paid
  ) values (
    src.client_id,
    'draft',
    v_period,
    v_due,
    src.notes,
    v_period_to_store,
    0,
    0,
    0,
    0,
    0
  )
  returning id into v_new_id;

  for line in
    select
      il.product_id,
      il.trackable_item_id,
      il.description,
      il.quantity,
      il.unit_price,
      round((il.quantity * il.unit_price)::numeric, 2) as line_total
    from public.invoice_lines il
    join public.products p on p.id = il.product_id
    where il.invoice_id = src.id
      and p.product_kind = 'monthly_fee'
    order by il.sort_order, il.created_at
  loop
    v_sort := v_sort + 1;
    v_desc := public.replace_line_month_abbr(line.description, v_period);
    insert into public.invoice_lines (
      invoice_id,
      product_id,
      trackable_item_id,
      description,
      quantity,
      unit_price,
      line_total,
      sort_order
    ) values (
      v_new_id,
      line.product_id,
      line.trackable_item_id,
      v_desc,
      line.quantity,
      line.unit_price,
      line.line_total,
      v_sort
    );
    v_subtotal := v_subtotal + line.line_total;
  end loop;

  v_subtotal := round(v_subtotal::numeric, 2);
  v_tax_amount := round((v_subtotal * (v_tax / 100.0))::numeric, 2);
  v_total := round((v_subtotal + v_tax_amount)::numeric, 2);

  update public.invoices
  set
    subtotal = v_subtotal,
    tax_amount = v_tax_amount,
    total = v_total,
    updated_at = now()
  where id = v_new_id
  returning * into inv;

  return inv;
end;
$$;

grant execute on function public.copy_monthly_fee_invoice(uuid, date) to authenticated;
revoke execute on function public.copy_monthly_fee_invoice(uuid, date) from anon;

notify pgrst, 'reload schema';
