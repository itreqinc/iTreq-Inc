-- Prefer simple column name "country" (ISO code, e.g. BW).

alter table public.clients
  add column if not exists country text;

-- Copy from phone_country if that column exists
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'clients'
      and column_name = 'phone_country'
  ) then
    execute 'update public.clients set country = phone_country where country is null and phone_country is not null';
    execute 'alter table public.clients drop column phone_country';
  end if;
end $$;

notify pgrst, 'reload schema';
