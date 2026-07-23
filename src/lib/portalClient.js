/**
 * Which client the portal shows.
 * Phase 5 (auth bypass): stored in localStorage via the header picker.
 * Phase 6: replace with users.client_id from the JWT session — keep call sites on these helpers.
 */

export const PORTAL_CLIENT_ID_KEY = 'itreq_portal_client_id'

export function getPortalClientId() {
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
