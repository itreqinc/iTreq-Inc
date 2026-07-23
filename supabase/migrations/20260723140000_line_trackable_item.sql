-- Persist catalog item on quote/invoice lines so "Item to track" survives reload.

alter table public.quotation_lines
  add column if not exists trackable_item_id uuid
    references public.trackable_items (id) on delete set null;

alter table public.invoice_lines
  add column if not exists trackable_item_id uuid
    references public.trackable_items (id) on delete set null;

create index if not exists quotation_lines_trackable_item_idx
  on public.quotation_lines (trackable_item_id);

create index if not exists invoice_lines_trackable_item_idx
  on public.invoice_lines (trackable_item_id);
