/**
 * Expense edit deep-links use /admin/expenses/edit/:reference in the URL.
 * The real id is kept in sessionStorage so refreshes work without a uuid in the address bar.
 */

const EDIT_ID_KEY = 'admin.expenses.editId'

export function rememberExpenseEditId(id) {
  if (typeof sessionStorage === 'undefined') return
  try {
    if (id) sessionStorage.setItem(EDIT_ID_KEY, String(id))
    else sessionStorage.removeItem(EDIT_ID_KEY)
  } catch {
    /* ignore */
  }
}

export function readExpenseEditId() {
  if (typeof sessionStorage === 'undefined') return ''
  try {
    return String(sessionStorage.getItem(EDIT_ID_KEY) || '')
  } catch {
    return ''
  }
}

export function clearExpenseEditId() {
  rememberExpenseEditId('')
}

/** URL-safe path segment from the expense reference (fallback: date or "record"). */
export function expenseEditSlug(expense) {
  const ref = String(expense?.reference || '').trim()
  if (ref) {
    return encodeURIComponent(ref)
      .replace(/%2F/gi, '-')
      .replace(/%20/g, '-')
  }
  const day = String(expense?.expense_date || '').slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return day
  return 'record'
}

export function expenseNewPath() {
  return '/admin/expenses/new'
}

export function expenseEditPath(expense) {
  return `/admin/expenses/edit/${expenseEditSlug(expense)}`
}

export function expenseListPath() {
  return '/admin/expenses'
}
