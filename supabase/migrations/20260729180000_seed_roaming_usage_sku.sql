-- Ensure a canonical roaming usage SKU exists for invoice helpers.

insert into public.products (sku, name, unit_price, tracks_stock, product_kind, active)
values (
  'FEE-ROAMING',
  'Roaming - Across the border monitoring',
  0,
  false,
  'usage',
  true
)
on conflict (sku) do update
set
  product_kind = 'usage',
  tracks_stock = false,
  name = case
    when public.products.name ilike '%roam%' or public.products.name ilike '%border%'
      then public.products.name
    else excluded.name
  end,
  updated_at = now();

-- Reclassify any remaining non-stock roam/border products that were missed.
update public.products
set
  product_kind = 'usage',
  tracks_stock = false,
  updated_at = now()
where tracks_stock = false
  and product_kind <> 'usage'
  and (
    sku ilike '%roam%'
    or name ilike '%roam%'
    or name ilike '%border%'
  );
