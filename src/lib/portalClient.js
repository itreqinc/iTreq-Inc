import { AUTH_BYPASS } from './authConfig'

/**
 * Which client the portal shows.
 * Authenticated clients use users.client_id from the session.
 * Auth bypass still uses localStorage via the header picker.
 */

export const PORTAL_CLIENT_ID_KEY = 'itreq_portal_client_id'

export function getStoredPortalClientId() {
  try {
    return localStorage.getItem(PORTAL_CLIENT_ID_KEY) || null
  } catch {
    return null
  }
}

export function setPortalClientId(clientId) {
  try {
    if (clientId) localStorage.setItem(PORTAL_CLIENT_ID_KEY, clientId)
    else localStorage.removeItem(PORTAL_CLIENT_ID_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Resolve portal client id from the logged-in user, falling back to
 * localStorage only under auth bypass.
 */
export function getPortalClientId(user = null) {
  if (user?.client_id && !user?.bypass) return user.client_id
  if (AUTH_BYPASS || user?.bypass) return getStoredPortalClientId()
  return user?.client_id || null
}
