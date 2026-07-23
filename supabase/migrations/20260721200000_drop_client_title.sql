-- Drop unused title column (replaced by gender).

alter table public.clients
  drop column if exists title;
