import { invokeFn } from './invokeFn'

/**
 * Call the bundled `auth` Edge Function.
 * Pass withAuth when the action needs the current session bearer token.
 */
export async function authAction(action, body = {}, { withAuth = false } = {}) {
  return invokeFn(
    'auth',
    { body: { action, ...body } },
    { withAuth },
  )
}
