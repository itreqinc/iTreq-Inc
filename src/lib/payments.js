export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'eft', label: 'EFT / bank transfer' },
  { value: 'card', label: 'Card' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'other', label: 'Other' },
]

export function paymentMethodLabel(method) {
  return PAYMENT_METHODS.find((m) => m.value === method)?.label || method || '—'
}

export function invoiceBalanceDue(invoice) {
  const total = Number(invoice.total) || 0
  const paid = Number(invoice.amount_paid) || 0
  return Math.round((total - paid) * 100) / 100
}

/** Invoice statuses that contribute to client account balance. */
export const BALANCE_INVOICE_STATUSES = ['issued', 'partial', 'paid']

export function invoiceAffectsClientBalance(status) {
  return BALANCE_INVOICE_STATUSES.includes(status)
}

/** Local calendar date as YYYY-MM-DD (avoids UTC off-by-one). */
export function localTodayIso(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Issued + past due date → overdue (derived; not stored). */
export function invoiceIsOverdue(invoice, today = localTodayIso()) {
  if (invoice?.status !== 'issued') return false
  const due = invoice?.due_date ? String(invoice.due_date).slice(0, 10) : ''
  return Boolean(due && due < today)
}

/** Status label for UI: overdue replaces issued when past due. */
export function invoiceDisplayStatus(invoice, today = localTodayIso()) {
  if (invoiceIsOverdue(invoice, today)) return 'overdue'
  return invoice?.status || ''
}

/**
 * Spread a payment across selected invoices in list order until funds run out.
 * @returns {{ allocations: Record<string, number>, remaining: number }}
 */
export function autoAllocatePayment(amount, invoices, selectedIds) {
  const selected = new Set(selectedIds || [])
  let remaining = Math.round((Number(amount) || 0) * 100) / 100
  if (remaining < 0) remaining = 0

  const allocations = {}
  for (const inv of invoices || []) {
    allocations[inv.id] = 0
  }

  for (const inv of invoices || []) {
    if (!selected.has(inv.id)) continue
    const due = Math.max(0, Number(inv._allocatable ?? invoiceBalanceDue(inv)) || 0)
    const apply = Math.min(due, remaining)
    const rounded = Math.round(apply * 100) / 100
    allocations[inv.id] = rounded
    remaining = Math.round((remaining - rounded) * 100) / 100
  }

  return { allocations, remaining }
}
