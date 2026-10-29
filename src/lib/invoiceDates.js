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

function monthSpanLabel(periods) {
  if (!periods.length) return ''
  const first = periods[0]
  const last = periods[periods.length - 1]
  if (first.slice(0, 7) === last.slice(0, 7)) return formatBillingPeriodLabel(first)

  const y1 = first.slice(0, 4)
  const y2 = last.slice(0, 4)
  const m1 = MONTH_ABBR[Number(first.slice(5, 7)) - 1]
  const m2 = MONTH_ABBR[Number(last.slice(5, 7)) - 1]
  if (y1 === y2) return `${m1} - ${m2} ${y2}`
  return `${m1} ${y1} - ${m2} ${y2}`
}

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

function monthStart(iso) {
  const day = String(iso || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return ''
  return `${day.slice(0, 7)}-01`
}

/** Hardware's share of the invoice total, including tax in the same proportion. */
function grossHardware(inv) {
  const part = Number(inv._hardware) || 0
  const sub = Number(inv.subtotal) || Number(inv._lines_subtotal) || 0
  const total = Number(inv.total) || 0
  if (part <= 0.001 || sub <= 0.001 || total <= 0.001) return 0
  return money(total * (part / sub))
}

function grossFee(inv) {
  const part = Number(inv._fee) || 0
  const sub = Number(inv.subtotal) || Number(inv._lines_subtotal) || 0
  const total = Number(inv.total) || 0
  if (part <= 0.001 || sub <= 0.001 || total <= 0.001) return 0
  return money(total * (part / sub))
}

/**
 * Reference for a payment against a brought-forward balance, an installation, and/or monthly fees.
 * Brought forward only → "Previous Bal".
 * Brought forward plus months → "Prev. Bal + September 2026" or "Prev. Bal + Sep - Nov 2026".
 * Installation only → "Supply & Fit".
 * Installation plus months → "Supply & Fit + September 2026" or "Supply & Fit + Sep - Nov 2026".
 * Months are counted from the client's monthly fee, oldest unpaid month first.
 * A partial last month is included. Returns '' when the amount is empty, or when money
 * spills onto an invoice that is neither an installation nor a monthly fee.
 */
export function monthlyFeePaymentReference(openInvoices, amount, openingBalanceDue = 0) {
  const pay = money(amount)
  if (pay <= 0.001) return ''

  const broughtForward = Math.max(0, money(openingBalanceDue))
  const monthlyInvoices = []
  const installation = []
  let otherDue = 0
  let monthlyFee = 0

  for (const inv of openInvoices || []) {
    const due = money(inv._allocatable ?? inv.total)
    if (due <= 0.001) continue
    if (!monthlyFee && Number(inv._client_monthly_fee) > 0.001) {
      monthlyFee = money(inv._client_monthly_fee)
    }
    const period = monthStart(inv.billing_period)
    if (period) {
      monthlyInvoices.push({ period, due, total: money(inv.total) })
      continue
    }
    const hardwareFull = grossHardware(inv)
    if (hardwareFull > 0.001) {
      const paid = Math.max(0, money((Number(inv.total) || 0) - due))
      const hardwareRemaining = Math.min(due, Math.max(0, money(hardwareFull - paid)))
      const feeFull = grossFee(inv)
      const rest = money(due - hardwareRemaining)
      const feeDue = feeFull > 0.001 ? Math.min(rest, feeFull) : 0
      installation.push({
        due: hardwareRemaining,
        issue: monthStart(inv.issue_date),
        fee: feeFull,
        feeDue,
      })
      if (rest > 0.001 && feeDue <= 0.001) otherDue = money(otherDue + rest)
      continue
    }
    otherDue = money(otherDue + due)
  }

  monthlyInvoices.sort((a, b) => a.period.localeCompare(b.period))
  if (!monthlyFee) {
    const latest = monthlyInvoices.filter((row) => row.total > 0.001).at(-1)
    if (latest) monthlyFee = latest.total
  }
  if (!monthlyFee) {
    const onInstall = installation.find((row) => row.fee > 0.001)
    if (onInstall) monthlyFee = onInstall.fee
  }

  if (!broughtForward && !installation.length && !monthlyInvoices.length && otherDue <= 0.001) {
    return ''
  }

  let left = pay
  const paysBroughtForward = broughtForward > 0.001 && left > 0.001
  if (broughtForward > 0.001) left = money(left - broughtForward)

  const installDue = installation.reduce((sum, row) => money(sum + row.due), 0)
  const paysInstall = installDue > 0.001 && left > 0.001
  if (installDue > 0.001) left = money(left - installDue)

  if (otherDue > 0.001 && left > 0.001) return ''

  let span = ''
  if (paysInstall && left > 0.001 && monthlyFee > 0.001) {
    const feeMonth = installation
      .filter((row) => row.feeDue > 0.001 && row.issue)
      .map((row) => row.issue)
      .sort()[0]
    const start =
      feeMonth ||
      monthlyInvoices[0]?.period ||
      installation.map((row) => row.issue).filter(Boolean).sort()[0] ||
      ''
    if (start) {
      const covered = []
      let cursor = start
      let guard = 0
      while (left > 0.001 && guard < 36) {
        covered.push(cursor)
        left = money(left - monthlyFee)
        cursor = nextBillingPeriod(cursor)
        guard += 1
      }
      span = monthSpanLabel(covered)
    }
  } else if (!paysInstall && left > 0.001) {
    const covered = []
    for (const row of monthlyInvoices) {
      if (left <= 0.001) break
      if (!covered.some((period) => period.slice(0, 7) === row.period.slice(0, 7))) {
        covered.push(row.period)
      }
      left = money(left - row.due)
    }
    span = monthSpanLabel(covered)
    if (otherDue > 0.001 && left > 0.001 && !span) return ''
  }

  if (!paysInstall && otherDue > 0.001 && left > 0.001) return ''

  const parts = []
  if (paysBroughtForward) parts.push(paysInstall || span ? 'Prev. Bal' : 'Previous Bal')
  if (paysInstall) parts.push('Supply & Fit')
  if (span) parts.push(span)
  return parts.join(' + ')
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
