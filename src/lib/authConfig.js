/** Auth bypass for ops development. Must be false in production. */
export const AUTH_BYPASS = String(import.meta.env.VITE_AUTH_BYPASS || '')
  .trim()
  .toLowerCase() === 'true'

/** Local-only user switcher (never enable in production builds). */
export const DEV_AUTH_SWITCHER =
  import.meta.env.DEV &&
  String(import.meta.env.VITE_DEV_AUTH_SWITCHER || '')
    .trim()
    .toLowerCase() === 'true'

export const BYPASS_ROLE_KEY = 'itreq_ops_bypass_role'
/** Cached signed-in role for client-side admin checks (opsApi). */
export const SESSION_ROLE_KEY = 'itreq_ops_role'
export const VIEW_MODE_KEY = 'itreq_view_mode'

export const ROLES = {
  client: 'client',
  staff: 'staff',
  admin: 'admin',
}

export const VIEW_MODES = {
  staff: 'staff',
  client: 'client',
}

/** Ops hours: Mon–Fri 07:00–18:00 Africa/Gaborone */
export const OPS_TZ = 'Africa/Gaborone'
export const OPS_START_HOUR = 7
export const OPS_END_HOUR = 18

export function normalizeRole(role) {
  return String(role || '')
    .trim()
    .toLowerCase()
}

/** Staff and admin share the ops (/admin) area. */
export function isStaffLike(role) {
  const r = normalizeRole(role)
  return r === ROLES.staff || r === ROLES.admin
}

export function isAdmin(role) {
  return normalizeRole(role) === ROLES.admin
}

/** Role currently signed in (session or auth bypass). Used by opsApi admin gates. */
export function readSessionRole() {
  try {
    if (AUTH_BYPASS) {
      return normalizeRole(localStorage.getItem(BYPASS_ROLE_KEY) || ROLES.staff)
    }
    return normalizeRole(localStorage.getItem(SESSION_ROLE_KEY) || '')
  } catch {
    return ''
  }
}

export function writeSessionRole(role) {
  try {
    const r = normalizeRole(role)
    if (r) localStorage.setItem(SESSION_ROLE_KEY, r)
    else localStorage.removeItem(SESSION_ROLE_KEY)
  } catch {
    /* ignore */
  }
}

export function clearSessionRole() {
  try {
    localStorage.removeItem(SESSION_ROLE_KEY)
  } catch {
    /* ignore */
  }
}

export function isDualRole(user) {
  return !!(user && isStaffLike(user.role) && user.client_id)
}

export const STAFF_LIKE_ROLES = [ROLES.staff, ROLES.admin]

/**
 * Parts in Africa/Gaborone via Intl (no extra deps).
 */
export function getGaboroneParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: OPS_TZ,
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
    minute: 'numeric',
  })
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((p) => [p.type, p.value]),
  )
  const weekday = parts.weekday
  const hour = Number(parts.hour === '24' ? 0 : parts.hour)
  const minute = Number(parts.minute)
  return { weekday, hour, minute }
}

export function isWithinOpsHours(date = new Date()) {
  const { weekday, hour, minute } = getGaboroneParts(date)
  const weekend = weekday === 'Sat' || weekday === 'Sun'
  if (weekend) return false
  const mins = hour * 60 + minute
  return mins >= OPS_START_HOUR * 60 && mins < OPS_END_HOUR * 60
}

/**
 * Whether this user may use /admin right now.
 * Prefer server-provided ops_access when present.
 */
export function canAccessOps(user, opsAccess = null) {
  if (!user || !isStaffLike(user.role)) return false
  if (AUTH_BYPASS || user.bypass) return true
  if (opsAccess && typeof opsAccess.allowed === 'boolean') return opsAccess.allowed
  if (isAdmin(user.role)) return true
  if (isAfterHoursActive(user.after_hours_until)) return true
  return isWithinOpsHours()
}

/** True when after_hours_until is set and still in the future. */
export function isAfterHoursActive(until) {
  if (!until) return false
  const t = new Date(until).getTime()
  return Number.isFinite(t) && t > Date.now()
}

export function truncateEmail(email) {
  const value = String(email || '').trim()
  const at = value.indexOf('@')
  if (at <= 0) return value
  const local = value.slice(0, at)
  const domain = value.slice(at + 1)
  const visible = local.slice(0, 1)
  return `${visible}***@${domain}`
}

export function readViewMode() {
  try {
    const stored = localStorage.getItem(VIEW_MODE_KEY)
    if (stored === VIEW_MODES.client || stored === VIEW_MODES.staff) return stored
  } catch {
    /* ignore */
  }
  return VIEW_MODES.staff
}

export function writeViewMode(mode) {
  try {
    localStorage.setItem(VIEW_MODE_KEY, mode)
  } catch {
    /* ignore */
  }
}

/** Staff-view: block quotes/invoices/payments for the staff member's own client. */
export function isOwnClientDocument(user, clientId, viewMode = VIEW_MODES.staff) {
  if (!user?.client_id || !clientId) return false
  if (viewMode !== VIEW_MODES.staff) return false
  if (!isStaffLike(user.role)) return false
  return String(user.client_id) === String(clientId)
}
