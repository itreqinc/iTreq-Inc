/** Shared money display for ops UI and printable documents. */

export function formatPula(amount) {
  const n = Number(amount)
  if (Number.isNaN(n)) return '—'
  return `P${n.toLocaleString('en-BW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/**
 * Document/print money. Botswana Pula uses the same "P" format as formatPula.
 * Other currency codes are shown as "{CODE} {amount}".
 */
export function formatDocMoney(amount, currency = 'BWP') {
  if (currency === 'BWP' || !currency) return formatPula(amount)
  const n = Number(amount)
  if (Number.isNaN(n)) return '—'
  const formatted = n.toLocaleString('en-BW', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${currency} ${formatted}`
}

export function currencyDisplayLabel(currency = 'BWP') {
  if (currency === 'BWP' || !currency) return 'P'
  return currency
}
