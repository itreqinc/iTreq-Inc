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

export function dateRangeIsBackwards(from, to) {
  return Boolean(from && to && from > to)
}

/** Documents keep their issue date; drafts have none yet, so fall back to capture time. */
export function documentFilterDate(doc) {
  return doc?.issue_date || doc?.created_at || ''
}
