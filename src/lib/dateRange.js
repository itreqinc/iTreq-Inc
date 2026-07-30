/**
 * Inclusive date-range filtering for list pages (YYYY-MM-DD strings compare
 * lexicographically, so no Date parsing is needed).
 */

export function todayIso() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function currentMonthStartIso() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

/** Last calendar day of the month after today (YYYY-MM-DD). */
export function endOfNextMonthIso(from = new Date()) {
  const d = from instanceof Date ? from : new Date()
  // Day 0 of month+2 is the last day of month+1.
  const end = new Date(d.getFullYear(), d.getMonth() + 2, 0)
  return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`
}

/** Blank bounds mean "unbounded"; rows with no date drop out once a bound is set. */
export function withinDateRange(value, from, to) {
  const day = String(value ?? '').slice(0, 10)
  if (!day) return !from && !to
  if (from && day < from) return false
  if (to && day > to) return false
  return true
}

export function filterByDateRange(rows, from, to, pickDate) {
  const list = rows || []
  if (!from && !to) return list
  return list.filter((row) => withinDateRange(pickDate(row), from, to))
}

/**
 * Newest dates first; within the same date, client/recipient name A→Z.
 * Rows with no date sort after dated rows.
 */
export function sortByDateDescThenNameAsc(rows, pickDate, pickName) {
  return [...(rows || [])].sort((a, b) => {
    const da = String(pickDate(a) ?? '').slice(0, 10)
    const db = String(pickDate(b) ?? '').slice(0, 10)
    if (da !== db) {
      if (!da) return 1
      if (!db) return -1
      return db.localeCompare(da)
    }
    const na = String(pickName(a) ?? '')
      .trim()
      .toLowerCase()
    const nb = String(pickName(b) ?? '')
      .trim()
      .toLowerCase()
    return na.localeCompare(nb, undefined, { sensitivity: 'base' })
  })
}

export function dateRangeIsBackwards(from, to) {
  return Boolean(from && to && from > to)
}

/** Calendar day before YYYY-MM-DD (local). Empty input → ''. */
export function dayBeforeIso(ymd) {
  const day = String(ymd || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return ''
  const [y, m, d] = day.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() - 1)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

/** Documents keep their issue date; drafts have none yet, so fall back to capture time. */
export function documentFilterDate(doc) {
  return doc?.issue_date || doc?.created_at || ''
}
