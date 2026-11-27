-- When generating monthly fee drafts: if a client has exactly one unallocated
-- payment whose remaining amount equals the new invoice total, allocate it now.
-- Drafts keep the allocation reserved; issue refreshes amount_paid/status.

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
  v_auto_allocated_count integer := 0;
  v_month_label text;
  v_unalloc_count integer;
  v_pay_id uuid;
  v_pay_unalloc numeric(12, 2);
  v_auto_allocated boolean;
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

    -- Exact match: one unallocated payment left, equal to this invoice total.
    v_auto_allocated := false;
    if v_total > 0.001 then
      select count(*)::integer into v_unalloc_count
      from public.payments p
      where p.client_id = r.client_id
        and coalesce(p.is_adjustment, false) = false
        and public.payment_unallocated_amount(p) > 0.001;

      if v_unalloc_count = 1 then
        select
          p.id,
          public.payment_unallocated_amount(p)
        into v_pay_id, v_pay_unalloc
        from public.payments p
        where p.client_id = r.client_id
          and coalesce(p.is_adjustment, false) = false
          and public.payment_unallocated_amount(p) > 0.001
        limit 1;

        if v_pay_id is not null and round(v_pay_unalloc, 2) = v_total then
          insert into public.payment_allocations (payment_id, invoice_id, amount)
          values (v_pay_id, v_new_id, v_total);
          v_auto_allocated := true;
          v_auto_allocated_count := v_auto_allocated_count + 1;
        end if;
      end if;
    end if;

    v_created_count := v_created_count + 1;
    v_created := v_created || jsonb_build_array(jsonb_build_object(
      'invoice_id', v_new_id,
      'number', null,
      'status', 'draft',
      'client_id', r.client_id,
      'client_name', r.client_name,
      'total', v_total,
      'auto_allocated', v_auto_allocated
    ));
  end loop;

  return jsonb_build_object(
    'billing_period', v_period,
    'previous_period', v_prev_start,
    'created_count', v_created_count,
    'auto_allocated_count', v_auto_allocated_count,
    'skip_already_billed', v_skip_billed,
    'skip_no_source', v_skip_no_source,
    'skip_marked', v_skip_marked,
    'created', v_created
  );
end;
$$;

revoke all on function public.generate_monthly_fee_invoices(date, uuid[]) from public;
grant execute on function public.generate_monthly_fee_invoices(date, uuid[]) to authenticated, service_role;

-- Apply any allocations already attached to the draft (e.g. monthly fee auto-match).
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

  return public.refresh_invoice_payment_status(p_invoice_id);
end;
$$;

notify pgrst, 'reload schema';
