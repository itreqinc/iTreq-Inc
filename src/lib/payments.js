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

/** Display label for a payment row (adjustments are not bank collections). */
export function paymentDisplayMethod(payment) {
  if (payment?.is_adjustment) return 'Adjustment'
  return paymentMethodLabel(payment?.method)
}

/** Display label for a statement line (Accounts / portal / print). */
export function statementLineLabel(line) {
  if (line?.type === 'invoice') return `Invoice ${line.label}`
  if (line?.type === 'quotation') return `Quotation ${line.label}`
  if (line?.type === 'opening_balance') return line.label || 'Opening balance'
  if (line?.method === 'adjustment' || line?.label === 'Opening credit applied') {
    return line.label || 'Opening credit applied'
  }
  return `Payment ${line.label || ''}`.trim()
}

/** Method suffix for statement lines; omit for adjustments (already in the label). */
export function statementLineMethodSuffix(line) {
  if (!line?.method || line.method === 'adjustment') return ''
  return ` (${paymentMethodLabel(line.method)})`
}

/**
 * Statement / AR credit for a payment. Money applied to a positive opening
 * balance is excluded so reducing clients.opening_balance is not double-counted.
 */
export function paymentStatementCredit(payment) {
  const amount = Number(payment?.amount) || 0
  const delta = Number(payment?.opening_balance_delta) || 0
  const openingApplied = Math.max(0, -delta)
  return Math.round((amount - openingApplied) * 100) / 100
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

/**
 * Add calendar months, clamping to the last day of the target month so
 * 31 Jan + 1 month lands on 28/29 Feb rather than spilling into March.
 */
export function addMonthsIso(isoDate, months = 1) {
  const [y, m, d] = String(isoDate || '')
    .slice(0, 10)
    .split('-')
    .map(Number)
  if (!y || !m || !d) return ''
  const shifted = m - 1 + months
  const year = y + Math.floor(shifted / 12)
  const month = ((shifted % 12) + 12) % 12 + 1
  const lastDay = new Date(year, month, 0).getDate()
  const day = Math.min(d, lastDay)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Standard payment terms for one-off invoices (days after issue date). */
export const INVOICE_DUE_DAYS = 5

/** Add calendar days to a YYYY-MM-DD string. */
export function addDaysIso(isoDate, days = 0) {
  const base = String(isoDate || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(base)) return ''
  const [y, m, d] = base.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + Number(days) || 0)
  return localTodayIso(dt)
}

/** Due date for a regular (non–monthly-fee) invoice from its issue date. */
export function dueDateFromIssueDate(issueDate, days = INVOICE_DUE_DAYS) {
  const issue = String(issueDate || '').slice(0, 10)
  if (!issue) return ''
  return addDaysIso(issue, days)
}

/**
 * When payment is expected. Uses the stored due date, falling back to
 * {@link INVOICE_DUE_DAYS} after issue date.
 */
export function invoiceEffectiveDueDate(invoice) {
  const due = invoice?.due_date ? String(invoice.due_date).slice(0, 10) : ''
  if (due) return due
  const issued = invoice?.issue_date ? String(invoice.issue_date).slice(0, 10) : ''
  return issued ? dueDateFromIssueDate(issued) : ''
}

/** Unpaid and past its due date (derived; not stored). Partial payments excluded. */
export function invoiceIsOverdue(invoice, today = localTodayIso()) {
  if (invoice?.status !== 'issued') return false
  const due = invoiceEffectiveDueDate(invoice)
  return Boolean(due && due < today)
}

/** Status label for UI: issued reads as "due" until it tips over into "overdue". */
export function invoiceDisplayStatus(invoice, today = localTodayIso()) {
  if (invoiceIsOverdue(invoice, today)) return 'overdue'
  if (invoice?.status === 'issued') return 'due'
  return invoice?.status || ''
}

/**
 * Split outstanding money into overdue vs not-yet-due buckets.
 * Buckets by due date rather than status so partially paid invoices count too.
 */
export function summarizeReceivables(invoices, today = localTodayIso()) {
  const summary = {
    overdue: 0,
    overdueCount: 0,
    due: 0,
    dueCount: 0,
    total: 0,
    nextDueDate: '',
  }

  for (const inv of invoices || []) {
    if (!invoiceAffectsClientBalance(inv?.status)) continue
    const balance = invoiceBalanceDue(inv)
    if (balance <= 0.001) continue

    const dueDate = invoiceEffectiveDueDate(inv)
    if (dueDate && dueDate < today) {
      summary.overdue += balance
      summary.overdueCount += 1
    } else {
      summary.due += balance
      summary.dueCount += 1
      if (dueDate && (!summary.nextDueDate || dueDate < summary.nextDueDate)) {
        summary.nextDueDate = dueDate
      }
    }
  }

  summary.overdue = Math.round(summary.overdue * 100) / 100
  summary.due = Math.round(summary.due * 100) / 100
  summary.total = Math.round((summary.overdue + summary.due) * 100) / 100
  return summary
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
