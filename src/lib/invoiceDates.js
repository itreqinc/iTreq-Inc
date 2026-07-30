const MONTH_ABBR = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

/** First-of-month billing_period → "July 2026". */
export function formatBillingPeriodLabel(isoDate) {
  if (!isoDate) return ''
  const [y, m] = String(isoDate).slice(0, 10).split('-')
  if (!y || !m) return String(isoDate).slice(0, 10)
  const dt = new Date(Number(y), Number(m) - 1, 1)
  return dt.toLocaleString('en-GB', { month: 'long', year: 'numeric' })
}

/** First-of-month billing_period → "Jul 2026" (matches Postgres to_char Mon YYYY). */
export function formatBillingPeriodMonthAbbr(isoDate) {
  if (!isoDate) return ''
  const y = String(isoDate).slice(0, 4)
  const m = Number(String(isoDate).slice(5, 7))
  if (!y || !m || m < 1 || m > 12) return ''
  return `${MONTH_ABBR[m - 1]} ${y}`
}

/**
 * Client-facing billing period label when the invoice has a billing_period.
 */
export function clientInvoiceBillingDisplay(invoice) {
  if (!invoice?.billing_period) {
    return { label: 'Billing', value: '' }
  }
  return {
    label: 'Billing',
    value: formatBillingPeriodLabel(invoice.billing_period),
  }
}

/** First day of the month after the given first-of-month period. */
export function nextBillingPeriod(periodIso) {
  const [y, m] = String(periodIso || '')
    .slice(0, 10)
    .split('-')
    .map(Number)
  if (!y || !m) return ''
  const year = m === 12 ? y + 1 : y
  const month = m === 12 ? 1 : m + 1
  return `${year}-${String(month).padStart(2, '0')}-01`
}

/** Monthly fees fall due on the 10th (see monthly_fee_due_tenth migration). */
export const MONTHLY_FEE_DUE_DAY = 10

export function monthlyFeeDueDate(periodIso) {
  const period = String(periodIso || '').slice(0, 10)
  if (!period) return ''
  return `${period.slice(0, 7)}-${String(MONTHLY_FEE_DUE_DAY).padStart(2, '0')}`
}

/**
 * For a recurring monthly-fee invoice, when the next one is expected.
 * Returns null for one-off invoices, which have no billing period.
 */
export function nextBillingSummary(invoice) {
  if (!invoice?.billing_period) return null
  const period = nextBillingPeriod(invoice.billing_period)
  if (!period) return null
  return {
    period,
    periodLabel: formatBillingPeriodLabel(period),
    dueDate: monthlyFeeDueDate(period),
  }
}
