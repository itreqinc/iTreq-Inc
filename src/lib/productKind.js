/** Product kinds — stored on `products.product_kind`. */
export const PRODUCT_KIND = {
  hardware: 'hardware',
  monthlyFee: 'monthly_fee',
  usage: 'usage',
}

export function normalizeProductKind(product) {
  if (product?.product_kind) return product.product_kind
  if (product?.tracks_stock) return PRODUCT_KIND.hardware
  return PRODUCT_KIND.monthlyFee
}

export function productKindLabel(kindOrProduct) {
  const kind =
    typeof kindOrProduct === 'string'
      ? kindOrProduct
      : normalizeProductKind(kindOrProduct)
  switch (kind) {
    case PRODUCT_KIND.hardware:
      return 'Hardware'
    case PRODUCT_KIND.usage:
      return 'Usage charge'
    case PRODUCT_KIND.monthlyFee:
    default:
      return 'Monthly fee'
  }
}

export function productKindTracksStock(kind) {
  return kind === PRODUCT_KIND.hardware
}

/** Price suffix for list summaries. */
export function productKindPriceSuffix(kindOrProduct) {
  const kind =
    typeof kindOrProduct === 'string'
      ? kindOrProduct
      : normalizeProductKind(kindOrProduct)
  if (kind === PRODUCT_KIND.usage) return '/day'
  if (kind === PRODUCT_KIND.monthlyFee) return '/mo'
  return ''
}

export function isMonthlyFeeProduct(product) {
  return normalizeProductKind(product) === PRODUCT_KIND.monthlyFee
}

export function isUsageProduct(product) {
  return normalizeProductKind(product) === PRODUCT_KIND.usage
}

/** SKUs suitable for client catalog bundles (tracker + recurring fee). */
export function isBundleProduct(product) {
  const kind = normalizeProductKind(product)
  return kind === PRODUCT_KIND.hardware || kind === PRODUCT_KIND.monthlyFee
}

export function rowFromProductKind(kind) {
  return {
    product_kind: kind,
    tracks_stock: productKindTracksStock(kind),
  }
}

/**
 * Quote/invoice line description from a catalog bundle component.
 * Usage charges should not normally appear in bundles; if they do, use the product name.
 */
export function catalogComponentDescription(itemName, product) {
  const kind = normalizeProductKind(product)
  const name = itemName || 'Item'
  if (kind === PRODUCT_KIND.monthlyFee) {
    return `${name} — ${product?.name || 'Monthly fee'}`
  }
  if (kind === PRODUCT_KIND.usage) {
    return product?.name || 'Usage charge'
  }
  return `${name} - Tracker Installation`
}

/** True when product is hardware (stocked tracker). */
export function isHardwareProduct(product) {
  return normalizeProductKind(product) === PRODUCT_KIND.hardware
}
