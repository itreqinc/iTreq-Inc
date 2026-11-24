import { todayIso } from './dateRange'

const LAST_DATE_KEY = 'admin.expenses.lastDate'

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').slice(0, 10))
}

/** Date for a new expense form: last saved this login, else today. */
export function readLastExpenseDate() {
  if (typeof sessionStorage === 'undefined') return todayIso()
  try {
    const stored = String(sessionStorage.getItem(LAST_DATE_KEY) || '').slice(0, 10)
    if (isIsoDate(stored)) return stored
  } catch {
    /* ignore */
  }
  return todayIso()
}

/** Remember the date used when an expense is saved (until logout). */
export function rememberLastExpenseDate(isoDate) {
  const day = String(isoDate || '').slice(0, 10)
  if (!isIsoDate(day) || typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(LAST_DATE_KEY, day)
  } catch {
    /* ignore */
  }
}

/** Clear on logout so the next login starts from today again. */
export function clearLastExpenseDate() {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.removeItem(LAST_DATE_KEY)
  } catch {
    /* ignore */
  }
}
