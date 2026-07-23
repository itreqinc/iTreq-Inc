/** First-of-month billing_period → "July 2026". */
export function formatBillingPeriodLabel(isoDate) {
  if (!isoDate) return ''
  const [y, m] = String(isoDate).slice(0, 10).split('-')
  if (!y || !m) return String(isoDate).slice(0, 10)
  const dt = new Date(Number(y), Number(m) - 1, 1)
  return dt.toLocaleString('en-GB', { month: 'long', year: 'numeric' })
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
