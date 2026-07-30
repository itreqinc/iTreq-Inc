-- Opening balance on clients (carry-in amount owed as of a given date).
-- Positive = client owes iTreq (same sign as invoice totals on statements).

alter table public.clients
  add column if not exists opening_balance numeric(12, 2) not null default 0,
  add column if not exists opening_balance_date date;

comment on column public.clients.opening_balance is
  'Carry-in balance. Positive = amount the client owes as of opening_balance_date.';
comment on column public.clients.opening_balance_date is
  'Effective date for opening_balance; required when opening_balance is non-zero.';
