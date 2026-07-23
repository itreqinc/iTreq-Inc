-- Store phone country (ISO) for CountryPhoneInput; phone stored as dial+digits in cellphone/phone.

alter table public.clients
  add column if not exists country text;

comment on column public.clients.name is
  'Display name auto-built from first_name + middle_name + surname (not user-entered).';

comment on column public.clients.phone is
  'Legacy/sync of cellphone (E.164-style with dial code).';

comment on column public.clients.cellphone is
  'Primary mobile with country dial code, e.g. +26771234567.';
