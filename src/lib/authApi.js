import { invokeFn } from './invokeFn'
import { AUTH_BYPASS } from './authConfig'

const BYPASS_SESSION_MSG =
  'This action needs a real session. Set VITE_AUTH_BYPASS=false and sign in.'

/**
 * Call the bundled `auth` Edge Function.
 * Pass withAuth when the action needs the current session bearer token.
 * Under AUTH_BYPASS there is no session token — skip the fake "expired" path.
 */
export async function authAction(action, body = {}, { withAuth = false } = {}) {
  if (AUTH_BYPASS && withAuth) {
    return {
      data: null,
      error: { message: BYPASS_SESSION_MSG, bypass: true },
    }
  }
  return invokeFn('auth', { body: { action, ...body } }, { withAuth })
}

export function resetClientPassword(clientId) {
  return authAction('reset_client_password', { client_id: clientId }, { withAuth: true })
}

export function syncClientLoginEmail(clientId) {
  return authAction('sync_client_login_email', { client_id: clientId }, { withAuth: true })
}
