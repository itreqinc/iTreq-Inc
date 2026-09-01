/**
 * Invoices list return-focus only.
 *
 * Independent of Clients Accounts (`clientsReturnNav`, `data-accounts-client`,
 * third-row-in-list). Do not reuse those keys or selectors here.
 */

/** Park this invoice as the second band below the sticky admin header. */
export function scrollInvoiceRowSecondFromTop(invoiceId) {
  const id = String(invoiceId || '').trim()
  if (!id || typeof document === 'undefined') return

  const el = document.querySelector(`[data-invoice-row="${id}"]`)
  if (!el) return

  const header = document.querySelector('header.sticky')
  const headerH = header?.getBoundingClientRect().height || 0
  const eRect = el.getBoundingClientRect()
  const rowH = eRect.height || 40
  const gapAbove = rowH
  const target = Math.max(0, window.scrollY + eRect.top - headerH - gapAbove)

  if (typeof el.focus === 'function') {
    el.focus({ preventScroll: true })
  }
  window.scrollTo({ top: target, behavior: 'smooth' })
}
