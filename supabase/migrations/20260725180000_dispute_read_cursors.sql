-- Per-role "last read" cursors for invoice query threads.
-- A message is unread for a role when it was written by the other side
-- after that role's last_read_at (null = never opened the thread).

alter table public.invoice_disputes
  add column if not exists client_last_read_at timestamptz,
  add column if not exists staff_last_read_at timestamptz;
