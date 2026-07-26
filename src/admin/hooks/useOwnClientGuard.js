import { useAuth } from '../../contexts/AuthContext'
import { VIEW_MODES, isOwnClientDocument } from '../../lib/authConfig'

/**
 * Staff-view helpers: hide/block quotes, invoices, payments for the staff member's own client.
 */
export function useOwnClientGuard() {
  const { user, viewMode } = useAuth()

  const ownClientId =
    user?.client_id && viewMode === VIEW_MODES.staff ? user.client_id : null

  function isBlocked(clientId) {
    return isOwnClientDocument(user, clientId, viewMode)
  }

  function filterRows(rows, clientIdKey = 'client_id') {
    if (!ownClientId) return rows || []
    return (rows || []).filter((r) => String(r?.[clientIdKey] || '') !== String(ownClientId))
  }

  function filterClients(clients) {
    if (!ownClientId) return clients || []
    return (clients || []).filter((c) => String(c.id) !== String(ownClientId))
  }

  function blockMessage() {
    return 'You cannot manage your own account documents in staff view. Switch to client view instead.'
  }

  return { ownClientId, isBlocked, filterRows, filterClients, blockMessage }
}
