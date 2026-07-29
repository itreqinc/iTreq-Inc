-- Distinguish hardware, recurring monthly fees, and usage charges (e.g. roaming billed daily).

alter table public.products
  add column if not exists product_kind text;

update public.products
set product_kind = 'hardware'
where tracks_stock = true;

update public.products
set product_kind = 'usage'
where tracks_stock = false
  and (
    sku ilike '%roam%'
    or name ilike '%roam%'
    or name ilike '%cross%border%'
  );

update public.products
set product_kind = 'monthly_fee'
where tracks_stock = false
  and product_kind is null;

alter table public.products
  alter column product_kind set default 'monthly_fee';

alter table public.products
  alter column product_kind set not null;

alter table public.products
  drop constraint if exists products_product_kind_check;

alter table public.products
  add constraint products_product_kind_check
  check (product_kind in ('hardware', 'monthly_fee', 'usage'));

alter table public.products
  drop constraint if exists products_kind_stock_check;

alter table public.products
  add constraint products_kind_stock_check
  check (
    (product_kind = 'hardware' and tracks_stock = true)
    or (product_kind in ('monthly_fee', 'usage') and tracks_stock = false)
  );

comment on column public.products.product_kind is
  'hardware = stocked trackers; monthly_fee = recurring monitoring; usage = ad-hoc charges such as daily roaming.';

create or replace function public.find_monthly_fee_source_invoice(
  p_client_id uuid,
  p_prev_period date
)
returns uuid
language plpgsql
stable
as $$
declare
  v_id uuid;
  v_prev_start date := public.month_start(p_prev_period);
  v_prev_end date := (v_prev_start + interval '1 month' - interval '1 day')::date;
begin
  select i.id into v_id
  from public.invoices i
  where i.client_id = p_client_id
    and i.billing_period = v_prev_start
    and i.status <> 'void'
    and exists (
      select 1
      from public.invoice_lines il
      join public.products p on p.id = il.product_id
      where il.invoice_id = i.id
        and p.product_kind = 'monthly_fee'
    )
  order by i.issue_date desc nulls last, i.created_at desc
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  select i.id into v_id
  from public.invoices i
  where i.client_id = p_client_id
    and i.status <> 'void'
    and i.issue_date is not null
    and i.issue_date >= v_prev_start
    and i.issue_date <= v_prev_end
    and exists (
      select 1
      from public.invoice_lines il
      join public.products p on p.id = il.product_id
      where il.invoice_id = i.id
        and p.product_kind = 'monthly_fee'
    )
  order by i.issue_date desc, i.created_at desc
  limit 1;

  return v_id;
end;
$$;

create or replace function public.preview_monthly_fee_invoices(p_billing_period date)
returns jsonb
language plpgsql
stable
as $$
declare
  v_period date := public.month_start(p_billing_period);
  v_prev date := (v_period - interval '1 month')::date;
  v_prev_start date := public.month_start(v_prev);
  v_rows jsonb := '[]'::jsonb;
  r record;
  v_source uuid;
  v_already boolean;
  v_client_name text;
  v_source_number text;
  v_fee_count integer;
  v_would_create integer := 0;
  v_skip_billed integer := 0;
  v_skip_no_source integer := 0;
begin
  for r in
    select distinct c.id as client_id, c.name as client_name
    from public.clients c
    order by c.name
  loop
    v_client_name := r.client_name;
    v_already := exists (
      select 1 from public.invoices i
      where i.client_id = r.client_id
        and i.billing_period = v_period
        and i.status <> 'void'
    );

    if v_already then
      v_skip_billed := v_skip_billed + 1;
      v_rows := v_rows || jsonb_build_array(jsonb_build_object(
        'client_id', r.client_id,
        'client_name', v_client_name,
        'action', 'skip_already_billed',
        'source_invoice_id', null,
        'source_number', null,
        'fee_line_count', 0
      ));
      continue;
    end if;

    v_source := public.find_monthly_fee_source_invoice(r.client_id, v_prev_start);
    if v_source is null then
      if exists (
        select 1 from public.invoices i
        where i.client_id = r.client_id and i.status <> 'void'
      ) then
        v_skip_no_source := v_skip_no_source + 1;
        v_rows := v_rows || jsonb_build_array(jsonb_build_object(
          'client_id', r.client_id,
          'client_name', v_client_name,
          'action', 'skip_no_source',
          'source_invoice_id', null,
          'source_number', null,
          'fee_line_count', 0
        ));
      end if;
      continue;
    end if;

    select i.number into v_source_number from public.invoices i where i.id = v_source;
    select count(*)::integer into v_fee_count
    from public.invoice_lines il
    join public.products p on p.id = il.product_id
    where il.invoice_id = v_source and p.product_kind = 'monthly_fee';

    v_would_create := v_would_create + 1;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'client_id', r.client_id,
      'client_name', v_client_name,
      'action', 'create',
      'source_invoice_id', v_source,
      'source_number', v_source_number,
      'fee_line_count', v_fee_count
    ));
  end loop;

  return jsonb_build_object(
    'billing_period', v_period,
    'previous_period', v_prev_start,
    'would_create', v_would_create,
    'skip_already_billed', v_skip_billed,
    'skip_no_source', v_skip_no_source,
    'rows', v_rows
  );
end;
$$;

create or replace function public.generate_monthly_fee_invoices(p_billing_period date)
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
  v_issued public.invoices;
  v_created jsonb := '[]'::jsonb;
  v_created_count integer := 0;
  v_skip_billed integer := 0;
  v_skip_no_source integer := 0;
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
      insert into public.invoice_lines (
        invoice_id, product_id, description, quantity, unit_price, line_total, sort_order
      ) values (
        v_new_id,
        line.product_id,
        line.description,
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

    begin
      v_issued := public.issue_invoice(v_new_id);
    exception when others then
      delete from public.invoices where id = v_new_id;
      raise;
    end;

    v_created_count := v_created_count + 1;
    v_created := v_created || jsonb_build_array(jsonb_build_object(
      'invoice_id', v_issued.id,
      'number', v_issued.number,
      'client_id', r.client_id,
      'client_name', r.client_name,
      'total', v_issued.total
    ));
  end loop;

  return jsonb_build_object(
    'billing_period', v_period,
    'previous_period', v_prev_start,
    'created_count', v_created_count,
    'skip_already_billed', v_skip_billed,
    'skip_no_source', v_skip_no_source,
    'created', v_created
  );
end;
$$;
