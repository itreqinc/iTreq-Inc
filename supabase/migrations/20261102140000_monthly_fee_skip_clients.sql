-- Staff can leave named clients out of a monthly fee run.
-- The extra argument defaults to none, so a one-argument call still bills everyone.

drop function if exists public.generate_monthly_fee_invoices(date);

create or replace function public.generate_monthly_fee_invoices(
  p_billing_period date,
  p_skip_client_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
as $$
declare
  v_period date := public.month_start(p_billing_period);
  v_due date := (v_period + interval '9 days')::date;
  v_prev_start date := public.month_start((v_period - interval '1 month')::date);
  v_tax numeric(5, 2);
  v_notes text;
  r record;
  v_source uuid;
  v_new_id uuid;
  v_subtotal numeric(12, 2);
  v_tax_amount numeric(12, 2);
  v_total numeric(12, 2);
  v_sort integer;
  line record;
  v_desc text;
  v_created jsonb := '[]'::jsonb;
  v_created_count integer := 0;
  v_skip_billed integer := 0;
  v_skip_no_source integer := 0;
  v_skip_marked integer := 0;
  v_month_label text;
begin
  select coalesce(default_tax_rate, 0) into v_tax
  from public.company_settings where id = 1;

  v_month_label := to_char(v_period, 'FMMonth YYYY');
  v_notes := 'Monthly monitoring fees — ' || v_month_label;

  for r in
    select c.id as client_id, c.name as client_name
    from public.clients c
    order by c.name
  loop
    if exists (
      select 1 from public.invoices i
      where i.client_id = r.client_id
        and i.billing_period = v_period
        and i.status <> 'void'
    ) then
      v_skip_billed := v_skip_billed + 1;
      continue;
    end if;

    v_source := public.find_monthly_fee_source_invoice(r.client_id, v_prev_start);
    if v_source is null then
      continue;
    end if;

    if not exists (
      select 1
      from public.invoice_lines il
      join public.products p on p.id = il.product_id
      where il.invoice_id = v_source and p.product_kind = 'monthly_fee'
    ) then
      v_skip_no_source := v_skip_no_source + 1;
      continue;
    end if;

    if r.client_id = any(coalesce(p_skip_client_ids, '{}'::uuid[])) then
      v_skip_marked := v_skip_marked + 1;
      continue;
    end if;

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
      r.client_id,
      'draft',
      current_date,
      v_due,
      v_notes,
      v_period,
      0,
      0,
      0,
      0,
      0
    )
    returning id into v_new_id;

    v_subtotal := 0;
    v_sort := 0;
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
      where il.invoice_id = v_source
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
    where id = v_new_id;

    v_created_count := v_created_count + 1;
    v_created := v_created || jsonb_build_array(jsonb_build_object(
      'invoice_id', v_new_id,
      'number', null,
      'status', 'draft',
      'client_id', r.client_id,
      'client_name', r.client_name,
      'total', v_total
    ));
  end loop;

  return jsonb_build_object(
    'billing_period', v_period,
    'previous_period', v_prev_start,
    'created_count', v_created_count,
    'skip_already_billed', v_skip_billed,
    'skip_no_source', v_skip_no_source,
    'skip_marked', v_skip_marked,
    'created', v_created
  );
end;
$$;

revoke all on function public.generate_monthly_fee_invoices(date, uuid[]) from public;
grant execute on function public.generate_monthly_fee_invoices(date, uuid[]) to authenticated, service_role;

notify pgrst, 'reload schema';
