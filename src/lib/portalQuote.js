/** Portal clients may change a quote only while it awaits staff approval. */
export function clientCanEditPortalQuote(quote) {
  return Boolean(quote && quote.source === 'portal' && quote.status === 'draft')
}

export function portalQuoteAwaitingApproval(quote) {
  return clientCanEditPortalQuote(quote)
}

/** Status label for staff + portal UI (derived; stored status stays draft/accepted/…). */
export function quotationDisplayStatus(quote) {
  if (portalQuoteAwaitingApproval(quote)) return 'Awaiting approval'
  if (quote?.status === 'accepted') return 'approved'
  return quote?.status || ''
}

/**
 * Rebuild catalog quantities from saved quote lines (uses trackable_item_id).
 */
export function qtyByTrackableFromQuoteLines(lines, catalog) {
  const next = {}
  for (const item of catalog || []) next[item.id] = ''

  for (const line of lines || []) {
    const itemId = line.trackable_item_id
    if (!itemId || next[itemId] !== '') continue
    const item = (catalog || []).find((i) => i.id === itemId)
    if (!item) continue
    const comps = [...(item.components || [])].sort(
      (a, b) => (a.sort_order || 0) - (b.sort_order || 0),
    )
    const trackerComp =
      comps.find((c) => {
        const p = Array.isArray(c.products) ? c.products[0] : c.products
        return p && p.tracks_stock !== false
      }) || comps[0]
    if (!trackerComp || trackerComp.product_id !== line.product_id) continue
    const unit = Number(trackerComp.quantity) || 1
    const qty = Math.round((Number(line.quantity) / unit) * 100) / 100
    if (qty > 0) next[itemId] = String(qty)
  }
  return next
}
