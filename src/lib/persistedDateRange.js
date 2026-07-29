const PREFIX = 'itreq.dateRange.'

function isValidYmd(value) {
  if (value === '') return true
  if (!value || typeof value !== 'string') return false
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
}

/** @returns {{ from: string, to: string } | null} */
export function readPersistedDateRange(key) {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const from = parsed?.from
    const to = parsed?.to
    if (!isValidYmd(from) || !isValidYmd(to)) return null
    return { from, to }
  } catch {
    return null
  }
}

export function writePersistedDateRange(key, { from, to }) {
  if (typeof window === 'undefined') return
  const nextFrom = from ?? ''
  const nextTo = to ?? ''
  if (!isValidYmd(nextFrom) || !isValidYmd(nextTo)) return
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ from: nextFrom, to: nextTo }))
  } catch {
    /* quota / private mode */
  }
}

export function clearPersistedDateRange(key) {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(PREFIX + key)
  } catch {
    /* ignore */
  }
}
