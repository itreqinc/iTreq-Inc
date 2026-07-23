-- Core client details only (from the paper registration form).
-- Appliances, devices, emergency contacts, payment terms can be added later.

alter table public.clients
  add column if not exists title text,
  add column if not exists first_name text,
  add column if not exists middle_name text,
  add column if not exists surname text,
  add column if not exists id_number text,
  add column if not exists cellphone text,
  add column if not exists landline text,
  add column if not exists postal_address text,
  add column if not exists physical_address text;

create index if not exists clients_id_number_idx on public.clients (id_number);
create index if not exists clients_cellphone_idx on public.clients (cellphone);
