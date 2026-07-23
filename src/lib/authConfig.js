/** Auth bypass for ops development (Phase 0–5). Must be false in production. */
export const AUTH_BYPASS = String(import.meta.env.VITE_AUTH_BYPASS || '')
  .trim()
  .toLowerCase() === 'true'

export const BYPASS_ROLE_KEY = 'itreq_ops_bypass_role'

export const ROLES = {
  staff: 'staff',
  client: 'client',
}

export function normalizeRole(role) {
  return String(role || '')
    .trim()
    .toLowerCase()
}
