/**
 * Invoice query / dispute unread helpers.
 * A message is unread for a role when the other side wrote it after that role
 * last opened the thread (null cursor = never opened).
 */

export function disputeUnreadCount(dispute, role) {
  if (!dispute) return 0
  const lastRead =
    role === 'staff' ? dispute.staff_last_read_at : dispute.client_last_read_at
  return (dispute.messages || []).filter((msg) => {
    if (msg.author_role === role) return false
    if (!lastRead) return true
    return String(msg.created_at) > String(lastRead)
  }).length
}

/** Prefer filtered rows; always keep any row with unread so new replies stay visible. */
export function withUnreadRows(filtered, allRows, unreadByInvoiceId) {
  const byId = new Map((allRows || []).map((row) => [row.id, row]))
  const seen = new Set()
  const out = []
  for (const row of filtered || []) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    out.push(row)
  }
  for (const [invoiceId, count] of Object.entries(unreadByInvoiceId || {})) {
    if (!(count > 0) || seen.has(invoiceId)) continue
    const row = byId.get(invoiceId)
    if (!row) continue
    seen.add(invoiceId)
    out.push(row)
  }
  return out
}
