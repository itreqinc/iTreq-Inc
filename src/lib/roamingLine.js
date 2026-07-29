/** Inclusive day count between two YYYY-MM-DD strings. */
export function inclusiveDayCount(fromIso, toIso) {
  if (!fromIso || !toIso) return 0
  const from = new Date(`${fromIso}T00:00:00`)
  const to = new Date(`${toIso}T00:00:00`)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) return 0
  return Math.round((to - from) / 86400000) + 1
}

function formatDayMonth(iso) {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Human date range for invoice captions, e.g. "12–15 Jul 2026". */
export function formatRoamingDateRange(fromIso, toIso) {
  if (!fromIso) return ''
  if (!toIso || toIso === fromIso) return formatDayMonth(fromIso)
  const from = new Date(`${fromIso}T00:00:00`)
  const to = new Date(`${toIso}T00:00:00`)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return `${fromIso} – ${toIso}`
  }
  const sameMonth =
    from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth()
  if (sameMonth) {
    const monthYear = to.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
    return `${from.getDate()}–${to.getDate()} ${monthYear}`
  }
  return `${formatDayMonth(fromIso)} – ${formatDayMonth(toIso)}`
}

/** Default invoice description for a roaming / usage charge line. */
export function buildRoamingDescription(productName, registration, fromIso, toIso) {
  const base = String(productName || 'Roaming').trim()
  const reg = String(registration || '').trim()
  const range = formatRoamingDateRange(fromIso, toIso)
  const parts = [base]
  if (reg || range) {
    parts.push('—')
    parts.push([reg, range].filter(Boolean).join(', '))
  }
  return parts.join(' ')
}
