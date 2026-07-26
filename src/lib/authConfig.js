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

export const ROLES = {
  client: 'client',
  staff: 'staff',
  admin: 'admin',
}

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

export const STAFF_LIKE_ROLES = [ROLES.staff, ROLES.admin]
