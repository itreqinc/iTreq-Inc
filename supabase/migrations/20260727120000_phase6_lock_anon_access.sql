-- Phase 6: lock down anon PostgREST access. Ops/portal data flows through Edge (service role).

-- ---------------------------------------------------------------------------
-- Drop TEMP open RLS policies (phase 1–5 dev bypass)
-- ---------------------------------------------------------------------------

drop policy if exists "TEMP_dev_open_clients" on public.clients;
drop policy if exists "TEMP_dev_open_products" on public.products;
drop policy if exists "TEMP_dev_open_stock_movements" on public.stock_movements;
drop policy if exists "TEMP_dev_open_company_settings" on public.company_settings;

drop policy if exists "TEMP_dev_open_quotations" on public.quotations;
drop policy if exists "TEMP_dev_open_quotation_lines" on public.quotation_lines;
drop policy if exists "TEMP_dev_open_invoices" on public.invoices;
drop policy if exists "TEMP_dev_open_invoice_lines" on public.invoice_lines;

drop policy if exists "TEMP_dev_open_payments" on public.payments;
drop policy if exists "TEMP_dev_open_payment_allocations" on public.payment_allocations;

drop policy if exists "TEMP_dev_open_expense_categories" on public.expense_categories;
drop policy if exists "TEMP_dev_open_expenses" on public.expenses;

drop policy if exists "TEMP_dev_open_trackable_items" on public.trackable_items;
drop policy if exists "TEMP_dev_open_trackable_item_components" on public.trackable_item_components;

drop policy if exists "TEMP_dev_open_purchase_orders" on public.purchase_orders;
drop policy if exists "TEMP_dev_open_purchase_order_lines" on public.purchase_order_lines;
drop policy if exists "TEMP_dev_open_purchase_receipts" on public.purchase_receipts;
drop policy if exists "TEMP_dev_open_purchase_receipt_lines" on public.purchase_receipt_lines;

drop policy if exists "TEMP_dev_open_payment_notifications" on public.payment_notifications;
drop policy if exists "TEMP_dev_open_invoice_disputes" on public.invoice_disputes;
drop policy if exists "TEMP_dev_open_invoice_dispute_messages" on public.invoice_dispute_messages;

drop policy if exists "TEMP_dev_open_staff_employment" on public.staff_employment;
drop policy if exists "TEMP_dev_open_staff_benefit_types" on public.staff_benefit_types;
drop policy if exists "TEMP_dev_open_staff_benefit_assignments" on public.staff_benefit_assignments;
drop policy if exists "TEMP_dev_open_salary_advances" on public.salary_advances;
drop policy if exists "TEMP_dev_open_pay_runs" on public.pay_runs;
drop policy if exists "TEMP_dev_open_payslips" on public.payslips;

-- Storage: client proof bucket
drop policy if exists "TEMP_dev_open_client_proofs_read" on storage.objects;
drop policy if exists "TEMP_dev_open_client_proofs_write" on storage.objects;

-- ---------------------------------------------------------------------------
-- Revoke anon EXECUTE on financial RPCs (Edge uses service role)
-- ---------------------------------------------------------------------------

revoke execute on function public.allocate_document_number(text) from anon;
revoke execute on function public.issue_invoice(uuid) from anon;
revoke execute on function public.void_invoice(uuid) from anon;

revoke execute on function public.record_payment(uuid, numeric, date, text, text, text, jsonb) from anon;
revoke execute on function public.refresh_invoice_payment_status(uuid) from anon;
revoke execute on function public.update_payment(uuid, numeric, date, text, text, text, jsonb) from anon;
revoke execute on function public.delete_payment(uuid) from anon;

revoke execute on function public.get_client_credit_balance(uuid) from anon;
revoke execute on function public.apply_client_credit_to_invoice(uuid, numeric) from anon;

revoke execute on function public.month_start(date) from anon;
revoke execute on function public.find_monthly_fee_source_invoice(uuid, date) from anon;
revoke execute on function public.preview_monthly_fee_invoices(date) from anon;
revoke execute on function public.generate_monthly_fee_invoices(date) from anon;

-- stock_levels view was granted to anon for dev reads
revoke select on public.stock_levels from anon;

-- contact form remains: insert-only policy on contact_submissions (unchanged)
