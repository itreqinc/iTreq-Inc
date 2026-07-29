-- Standard roaming line caption (product name → default invoice description).
update public.products
set name = 'Roaming - Across the border monitoring'
where product_kind = 'usage'
  and (
    sku ilike '%roam%'
    or name ilike '%roam%'
    or name ilike '%border%'
  );
