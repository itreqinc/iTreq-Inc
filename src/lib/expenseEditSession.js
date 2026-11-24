/**
 * Expense edit deep-links use /admin/expenses/edit/:reference in the URL.
 * The real id is kept in sessionStorage (keyed by that slug) so refreshes work
 * without a uuid in the address bar.
 */

const EDIT_MAP_KEY = 'admin.expenses.editMap'
const EDIT_CURRENT_KEY = 'admin.expenses.editId'

function readMap() {
  if (typeof sessionStorage === 'undefined') return {}
  try {
    const raw = sessionStorage.getItem(EDIT_MAP_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeMap(map) {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(EDIT_MAP_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
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

export function rememberExpenseEditId(id, expenseOrSlug = '') {
  if (typeof sessionStorage === 'undefined' || !id) return
  const slug =
    typeof expenseOrSlug === 'string' && expenseOrSlug
      ? expenseOrSlug
      : expenseEditSlug(expenseOrSlug || {})
  try {
    sessionStorage.setItem(EDIT_CURRENT_KEY, String(id))
    if (slug) {
      const map = readMap()
      map[slug] = String(id)
      writeMap(map)
    }
  } catch {
    /* ignore */
  }
}

/** Resolve id for an edit URL slug (falls back to last opened id). */
export function readExpenseEditId(slug = '') {
  if (typeof sessionStorage === 'undefined') return ''
  try {
    if (slug) {
      const mapped = readMap()[slug]
      if (mapped) return String(mapped)
    }
    return String(sessionStorage.getItem(EDIT_CURRENT_KEY) || '')
  } catch {
    return ''
  }
}

export function clearExpenseEditId() {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.removeItem(EDIT_CURRENT_KEY)
  } catch {
    /* ignore */
  }
}

export function clearExpenseEditSession() {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.removeItem(EDIT_CURRENT_KEY)
    sessionStorage.removeItem(EDIT_MAP_KEY)
  } catch {
    /* ignore */
  }
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
