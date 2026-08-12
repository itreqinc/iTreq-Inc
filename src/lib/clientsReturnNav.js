/** Query flag: opened from Clients → Accounts; return there on close/save. */
export const CLIENTS_RETURN_FROM = 'clients'

export function clientsAccountsUrl(clientId) {
  if (!clientId) return '/admin/clients'
  return `/admin/clients?account=${encodeURIComponent(clientId)}`
}

/** Build Payments URL when launching from Clients Accounts. */
export function paymentUrlFromClients(clientId, { openPaymentId } = {}) {
  const params = new URLSearchParams()
  params.set('from', CLIENTS_RETURN_FROM)
  if (openPaymentId) {
    params.set('open', openPaymentId)
    if (clientId) params.set('client', clientId)
  } else if (clientId) {
    params.set('client', clientId)
  }
  return `/admin/payments?${params}`
}

/** Build Invoices URL when launching from Clients Accounts. */
export function invoiceUrlFromClients(clientId, { openInvoiceId } = {}) {
  const params = new URLSearchParams()
  params.set('from', CLIENTS_RETURN_FROM)
  if (openInvoiceId) {
    params.set('open', openInvoiceId)
    if (clientId) params.set('client', clientId)
  } else if (clientId) {
    params.set('client', clientId)
  }
  return `/admin/invoices?${params}`
}

/** Read return target from URL search params before they are cleared. */
export function readClientsReturnFromParams(params) {
  if (params.get('from') !== CLIENTS_RETURN_FROM) return null
  const clientId = String(params.get('client') || '').trim()
  return clientId || null
}

/** Strip return-navigation params after consuming them. */
export function clearClientsReturnParams(params) {
  params.delete('from')
  params.delete('client')
}
