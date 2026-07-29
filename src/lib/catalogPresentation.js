import { formatPula } from './money'
import { normalizeProductKind, PRODUCT_KIND, productKindPriceSuffix } from './productKind'

export { productKindLabel } from './productKind'

export function productFromComponent(comp, productsById) {
  if (comp?.products) {
    const p = comp.products
    return Array.isArray(p) ? p[0] : p
  }
  if (productsById instanceof Map) {
    return productsById.get(comp.product_id) || null
  }
  return (productsById || []).find((p) => p.id === comp.product_id) || null
}

/** Whether every component row has a product selected. */
export function isBundleComplete(components) {
  const rows = components || []
  if (!rows.length) return false
  return rows.every((c) => Boolean(c.product_id))
}

/** Whether a saved catalog item is ready for the portal. */
export function isPortalReady(item) {
  return Boolean(item?.active) && isBundleComplete(item?.components)
}

/** Counts for catalog health overview. */
export function catalogHealthCounts(items = []) {
  let portalReady = 0
  let incomplete = 0
  let draft = 0
  for (const item of items) {
    if (isPortalReady(item)) portalReady += 1
    else if (item?.active) incomplete += 1
    else draft += 1
  }
  return {
    total: items.length,
    portalReady,
    incomplete,
    draft,
  }
}

/** Map product_id → trackable items that include it in their bundle. */
export function bundleRefsByProductId(items = []) {
  const map = new Map()
  for (const item of items) {
    if (!item?.id) continue
    const ref = { id: item.id, name: item.name || 'Untitled' }
    for (const c of item?.components || []) {
      if (!c?.product_id) continue
      const list = map.get(c.product_id) || []
      if (!list.some((r) => r.id === ref.id)) list.push(ref)
      map.set(c.product_id, list)
    }
  }
  return map
}

/** @deprecated prefer bundleRefsByProductId */
export function bundleNamesByProductId(items = []) {
  const refs = bundleRefsByProductId(items)
  const map = new Map()
  for (const [productId, list] of refs) {
    map.set(
      productId,
      list.map((r) => r.name),
    )
  }
  return map
}

/** One-line bundle summary for list display, e.g. "iTreq760 + P125/mo". */
export function bundleSummaryText(item, products = []) {
  const byId =
    products instanceof Map ? products : new Map((products || []).map((p) => [p.id, p]))
  const comps = item?.components || []
  const mapped = comps.filter((c) => c.product_id)

  if (!mapped.length) {
    return { complete: false, text: 'No bundle yet' }
  }

  const parts = mapped.map((c) => {
    const p = productFromComponent(c, byId)
    if (!p) return '?'
    const kind = normalizeProductKind(p)
    if (kind === PRODUCT_KIND.hardware) return p.sku
    const suffix = productKindPriceSuffix(kind)
    return `${formatPula(p.unit_price)}${suffix}`
  })

  return {
    complete: mapped.length === comps.length && comps.length > 0,
    text: parts.join(' + '),
  }
}

/** Build a trackable item shape for line preview from form state. */
export function trackableItemForPreview({ id, name, components, products }) {
  const byId = new Map((products || []).map((p) => [p.id, p]))
  return {
    id: id || 'preview',
    name: name || 'New item',
    components: (components || [])
      .filter((c) => c.product_id)
      .map((c) => ({
        ...c,
        products: byId.get(c.product_id),
      })),
  }
}
