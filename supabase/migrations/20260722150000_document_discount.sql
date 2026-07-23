-- Document-level discount (amount) on quotations and invoices.
-- Applied to subtotal before tax: taxable = subtotal - discount_amount.

alter table public.quotations
  add column if not exists discount_amount numeric(12, 2) not null default 0
    check (discount_amount >= 0);

alter table public.invoices
  add column if not exists discount_amount numeric(12, 2) not null default 0
    check (discount_amount >= 0);
