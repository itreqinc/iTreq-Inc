/** @returns {number} days in month (1–12) for a given year */
export function daysInMonth(year, month) {
  const y = Number(year)
  const m = Number(month)
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return 31
  return new Date(y, m, 0).getDate()
}

export function parseYmd(value) {
  const s = String(value ?? '').trim()
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return { year: '', month: '', day: '' }
  return { year: m[1], month: String(Number(m[2])), day: String(Number(m[3])) }
}

/** Build YYYY-MM-DD when year, month (1–12), and day are all chosen; otherwise "". */
export function buildYmd(year, month, day) {
  const y = String(year ?? '').trim()
  const mo = String(month ?? '').trim()
  const d = String(day ?? '').trim()
  if (!y || !mo || !d) return ''
  if (!/^\d{4}$/.test(y)) return ''
  const monthNum = Number(mo)
  const dayNum = Number(d)
  if (!Number.isFinite(monthNum) || monthNum < 1 || monthNum > 12) return ''
  const maxDay = daysInMonth(Number(y), monthNum)
  if (!Number.isFinite(dayNum) || dayNum < 1 || dayNum > maxDay) return ''
  return `${y}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
}

export function yearOptions(minYear, maxYear) {
  const lo = Math.min(minYear, maxYear)
  const hi = Math.max(minYear, maxYear)
  const out = []
  for (let y = hi; y >= lo; y--) out.push(y)
  return out
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export function monthOptions({ short = false } = {}) {
  return MONTH_NAMES.map((name, i) => ({
    value: i + 1,
    label: short ? name.slice(0, 3) : name,
  }))
}

export function dayOptions(year, month) {
  if (!year || !month) return []
  const max = daysInMonth(year, month)
  const out = []
  for (let d = 1; d <= max; d++) out.push(d)
  return out
}

/** Clamp YMD parts to min/max bounds (YYYY-MM-DD strings). */
export function clampYmdParts(year, month, day, minYmd, maxYmd) {
  const built = buildYmd(year, month, day)
  if (!built) return { year, month, day }
  let v = built
  if (minYmd && v < minYmd) v = minYmd
  if (maxYmd && v > maxYmd) v = maxYmd
  return parseYmd(v)
}
