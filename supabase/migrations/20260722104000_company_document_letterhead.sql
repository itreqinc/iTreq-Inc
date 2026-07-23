-- Letterhead and banking on printed quotations / invoices (editable in Admin → Settings).

alter table public.company_settings
  add column if not exists letterhead_address text,
  add column if not exists letterhead_phone text,
  add column if not exists letterhead_email text,
  add column if not exists banking_details text;

comment on column public.company_settings.letterhead_address is
  'Address lines on quote/invoice letterhead (one line per row).';
comment on column public.company_settings.letterhead_phone is
  'Phone shown as Contact on quote/invoice letterhead.';
comment on column public.company_settings.letterhead_email is
  'Optional email on quote/invoice letterhead / correspondence.';
comment on column public.company_settings.banking_details is
  'Banking block on quotes/invoices (one line per row).';
