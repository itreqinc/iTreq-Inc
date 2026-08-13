/** Query flag: opened from Clients → Accounts; return there on close/save. */
export const CLIENTS_RETURN_FROM = 'clients'

const RETURN_CLIENT_KEY = 'itreq_return_to_client'

export function clientsAccountsUrl(clientId) {
  const params = new URLSearchParams()
  params.set('view', 'accounts')
  if (clientId) params.set('account', String(clientId))
  return `/admin/clients?${params}`
}

export function stashClientsReturn(clientId) {
  const id = String(clientId || '').trim()
  if (!id || typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(RETURN_CLIENT_KEY, id)
  } catch {
    /* ignore */
  }
}

export function peekClientsReturn() {
  if (typeof sessionStorage === 'undefined') return null
  try {
    return String(sessionStorage.getItem(RETURN_CLIENT_KEY) || '').trim() || null
  } catch {
    return null
  }
}

export function takeClientsReturn() {
  const id = peekClientsReturn()
  clearClientsReturn()
  return id
}

export function clearClientsReturn() {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.removeItem(RETURN_CLIENT_KEY)
  } catch {
    /* ignore */
  }
}

/** Build Payments URL when launching from Clients Accounts. */
export function paymentUrlFromClients(clientId, { openPaymentId } = {}) {
  if (clientId) stashClientsReturn(clientId)
  const params = new URLSearchParams()
  if (openPaymentId) params.set('open', openPaymentId)
  else if (clientId) params.set('client', clientId)
  const q = params.toString()
  return q ? `/admin/payments?${q}` : '/admin/payments'
}

/** Build Invoices URL when launching from Clients Accounts. */
export function invoiceUrlFromClients(clientId, { openInvoiceId } = {}) {
  if (clientId) stashClientsReturn(clientId)
  const params = new URLSearchParams()
  if (openInvoiceId) params.set('open', openInvoiceId)
  else if (clientId) params.set('client', clientId)
  const q = params.toString()
  return q ? `/admin/invoices?${q}` : '/admin/invoices'
}

/** @deprecated kept for any leftover URL flags */
export function readClientsReturnFromParams(params) {
  if (params.get('from') !== CLIENTS_RETURN_FROM) return null
  const clientId = String(params.get('client') || '').trim()
  return clientId || null
}

/** @deprecated */
export function clearClientsReturnParams(params) {
  params.delete('from')
  params.delete('client')
}
