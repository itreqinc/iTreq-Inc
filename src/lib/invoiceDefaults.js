import { todayIso } from './dateRange'

const NEW_ISSUE_DATE_KEY = 'itreq.invoice.newIssueDate'

function isValidYmd(value) {
  if (!value || typeof value !== 'string') return false
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
}

/** Issue date for new invoices; falls back to today when nothing is stored. */
export function getDefaultNewInvoiceIssueDate() {
  if (typeof window === 'undefined') return todayIso()
  try {
    const stored = localStorage.getItem(NEW_ISSUE_DATE_KEY)
    if (isValidYmd(stored)) return stored
  } catch {
    /* ignore */
  }
  return todayIso()
}

/** Remember the issue date from the latest saved new invoice. */
export function setDefaultNewInvoiceIssueDate(issueDate) {
  if (typeof window === 'undefined' || !isValidYmd(issueDate)) return
  try {
    localStorage.setItem(NEW_ISSUE_DATE_KEY, issueDate)
  } catch {
    /* ignore */
  }
}

/** Reset new-invoice issue date back to today on every new form. */
export function clearDefaultNewInvoiceIssueDate() {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(NEW_ISSUE_DATE_KEY)
  } catch {
    /* ignore */
  }
}
