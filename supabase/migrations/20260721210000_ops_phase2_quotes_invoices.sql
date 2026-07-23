-- Phase 2: quotations, invoices, stock on issue / restore on void.

create table public.quotations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete restrict,
  number text,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'accepted', 'converted', 'cancelled')),
  issue_date date not null default current_date,
  notes text,
  subtotal numeric(12, 2) not null default 0,
  tax_amount numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  converted_invoice_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index quotations_client_idx on public.quotations (client_id);
create index quotations_status_idx on public.quotations (status);
create unique index quotations_number_uidx on public.quotations (number) where number is not null;

create table public.quotation_lines (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  description text not null,
  quantity numeric(12, 2) not null default 1 check (quantity > 0),
  unit_price numeric(12, 2) not null default 0 check (unit_price >= 0),
  line_total numeric(12, 2) not null default 0,
  sort_order integer not null default 1,
  created_at timestamptz not null default now()
);

create index quotation_lines_quotation_idx on public.quotation_lines (quotation_id);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete restrict,
  quotation_id uuid references public.quotations (id) on delete set null,
  number text,
  status text not null default 'draft'
    check (status in ('draft', 'issued', 'partial', 'paid', 'void')),
  issue_date date,
  due_date date,
  notes text,
  subtotal numeric(12, 2) not null default 0,
  tax_amount numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  amount_paid numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index invoices_client_idx on public.invoices (client_id);
create index invoices_status_idx on public.invoices (status);
create unique index invoices_number_uidx on public.invoices (number) where number is not null;

alter table public.quotations
  add constraint quotations_converted_invoice_fkey
  foreign key (converted_invoice_id) references public.invoices (id) on delete set null;

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  description text not null,
  quantity numeric(12, 2) not null default 1 check (quantity > 0),
  unit_price numeric(12, 2) not null default 0 check (unit_price >= 0),
  line_total numeric(12, 2) not null default 0,
  sort_order integer not null default 1,
  created_at timestamptz not null default now()
);

create index invoice_lines_invoice_idx on public.invoice_lines (invoice_id);

-- Atomic document numbering
create or replace function public.allocate_document_number(doc_type text)
returns text
language plpgsql
as $$
declare
  prefix text;
  next_n integer;
  formatted text;
begin
  if doc_type not in ('quote', 'invoice') then
    raise exception 'Invalid document type';
  end if;

  perform pg_advisory_xact_lock(hashtext('doc_number_' || doc_type));

  select
    case when doc_type = 'quote' then quote_prefix else invoice_prefix end,
    case when doc_type = 'quote' then next_quote_number else next_invoice_number end
  into prefix, next_n
  from public.company_settings
  where id = 1
  for update;

  if not found then
    raise exception 'Company settings missing';
  end if;

  formatted := coalesce(nullif(trim(prefix), ''), upper(doc_type)) || '-' || lpad(next_n::text, 5, '0');

  if doc_type = 'quote' then
    update public.company_settings
      set next_quote_number = next_n + 1, updated_at = now()
      where id = 1;
  else
    update public.company_settings
      set next_invoice_number = next_n + 1, updated_at = now()
      where id = 1;
  end if;

  return formatted;
end;
$$;

-- Issue invoice: assign number if needed, deduct stock for tracked products
create or replace function public.issue_invoice(p_invoice_id uuid)
returns public.invoices
language plpgsql
as $$
declare
  inv public.invoices;
  line record;
  on_hand integer;
  prod public.products;
  doc_no text;
begin
  select * into inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found';
  end if;
  if inv.status = 'void' then
    raise exception 'Cannot issue a void invoice';
  end if;
  if inv.status in ('issued', 'partial', 'paid') and inv.number is not null then
    return inv;
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
    updated_at = now()
  where id = p_invoice_id
  returning * into inv;

  return inv;
end;
$$;

-- Void issued invoice and restore stock
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

alter table public.quotations enable row level security;
alter table public.quotation_lines enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;

create policy "TEMP_dev_open_quotations"
  on public.quotations for all to anon, authenticated
  using (true) with check (true);

create policy "TEMP_dev_open_quotation_lines"
  on public.quotation_lines for all to anon, authenticated
  using (true) with check (true);

create policy "TEMP_dev_open_invoices"
  on public.invoices for all to anon, authenticated
  using (true) with check (true);

create policy "TEMP_dev_open_invoice_lines"
  on public.invoice_lines for all to anon, authenticated
  using (true) with check (true);

grant execute on function public.allocate_document_number(text) to anon, authenticated;
grant execute on function public.issue_invoice(uuid) to anon, authenticated;
grant execute on function public.void_invoice(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
