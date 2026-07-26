/** Next payday helpers (Africa/Gaborone calendar dates). */

const OPS_TZ = 'Africa/Gaborone'

function ymdInTz(date = new Date(), timeZone = OPS_TZ) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  // en-CA → YYYY-MM-DD
  return fmt.format(date)
}

function parseYmd(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number)
  return { y, m, d }
}

function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** weekday: 0=Sun … 6=Sat in UTC for that calendar Y-M-D */
function weekdayUtc(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

function lastWeekdayOfMonth(y, m, weekday) {
  // weekday: 0 Sun … 2 Tue … 4 Thu
  let d = daysInMonth(y, m)
  while (d >= 1) {
    if (weekdayUtc(y, m, d) === weekday) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    }
    d -= 1
  }
  return null
}

/** Later of last Tuesday and last Thursday of month. */
export function autoPaydayForMonth(y, m) {
  const tue = lastWeekdayOfMonth(y, m, 2)
  const thu = lastWeekdayOfMonth(y, m, 4)
  return tue >= thu ? tue : thu
}

function clampDom(y, m, dom) {
  const dim = daysInMonth(y, m)
  const d = Math.min(Math.max(1, Number(dom) || 1), dim)
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * Resolve next payday on/after `fromYmd` (default today in Gaborone).
 * settings: { payroll_payday_mode, payroll_payday_override_date, payroll_payday_override_dom }
 */
export function nextPayrollDate(settings = {}, fromDate = new Date()) {
  const fromYmd = typeof fromDate === 'string' ? fromDate : ymdInTz(fromDate)
  const { y: fy, m: fm, d: fd } = parseYmd(fromYmd)
  const mode = settings.payroll_payday_mode || 'auto_last_tue_thu'

  if (mode === 'override_date' && settings.payroll_payday_override_date) {
    const od = String(settings.payroll_payday_override_date).slice(0, 10)
    if (od >= fromYmd) return od
    // past override → fall through to auto from next month of from-date
  }

  if (mode === 'override_day_of_month' && settings.payroll_payday_override_dom) {
    let y = fy
    let m = fm
    let candidate = clampDom(y, m, settings.payroll_payday_override_dom)
    if (candidate < fromYmd) {
      m += 1
      if (m > 12) {
        m = 1
        y += 1
      }
      candidate = clampDom(y, m, settings.payroll_payday_override_dom)
    }
    return candidate
  }

  // auto_last_tue_thu (also used when override_date is in the past)
  let y = fy
  let m = fm
  let candidate = autoPaydayForMonth(y, m)
  if (candidate < fromYmd) {
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
    candidate = autoPaydayForMonth(y, m)
  }
  return candidate
}

export function paydayLabel(settings = {}) {
  const mode = settings.payroll_payday_mode || 'auto_last_tue_thu'
  if (mode === 'override_date' && settings.payroll_payday_override_date) {
    return `Override date ${String(settings.payroll_payday_override_date).slice(0, 10)}`
  }
  if (mode === 'override_day_of_month' && settings.payroll_payday_override_dom) {
    return `Override day-of-month ${settings.payroll_payday_override_dom}`
  }
  return 'Auto: later of last Tuesday / last Thursday'
}

export { ymdInTz }
