export function calcLineTotal(quantity, unitPrice) {
  const q = Number(quantity) || 0
  const p = Number(unitPrice) || 0
  return Math.round(q * p * 100) / 100
}

/**
 * @param {array} lines
 * @param {number} taxRate percent
 * @param {number} discountAmount money off subtotal (before tax)
 */
export function calcDocTotals(lines, taxRate = 0, discountAmount = 0) {
  const subtotal = (lines || []).reduce(
    (sum, line) => sum + calcLineTotal(line.quantity, line.unit_price),
    0,
  )
  const sub = Math.round(subtotal * 100) / 100
  let discount_amount = Math.round((Number(discountAmount) || 0) * 100) / 100
  if (discount_amount < 0) discount_amount = 0
  if (discount_amount > sub) discount_amount = sub

  const taxable = Math.round((sub - discount_amount) * 100) / 100
  const rate = Number(taxRate) || 0
  const tax_amount = Math.round(taxable * (rate / 100) * 100) / 100
  const total = Math.round((taxable + tax_amount) * 100) / 100
  return {
    subtotal: sub,
    discount_amount,
    tax_amount,
    total,
  }
}

export function emptyLine(sortOrder = 1) {
  return {
    product_id: '',
    trackable_item_id: '',
    description: '',
    quantity: 1,
    unit_price: 0,
    sort_order: sortOrder,
  }
}

export function normalizeLines(lines) {
  return (lines || [])
    .map((line, i) => {
      const quantity = Number(line.quantity) || 0
      const unit_price = Number(line.unit_price) || 0
      return {
        id: line.id,
        product_id: line.product_id || null,
        trackable_item_id: line.trackable_item_id || null,
        description: String(line.description || '').trim(),
        quantity,
        unit_price,
        line_total: calcLineTotal(quantity, unit_price),
        sort_order: i + 1,
      }
    })
    .filter((line) => line.description || line.product_id)
}

/**
 * Restore "Item to track" on load: saved id, else description prefix, else unique product match.
 */
export function resolveTrackableItemId(line, trackableItems = []) {
  if (line?.trackable_item_id) return line.trackable_item_id

  const desc = String(line?.description || '').trim()
  if (desc) {
    const byName = trackableItems
      .filter(
        (item) =>
          desc === item.name ||
          desc.startsWith(`${item.name} `) ||
          desc.startsWith(`${item.name}-`) ||
          desc.startsWith(`${item.name} -`) ||
          desc.startsWith(`${item.name}—`) ||
          desc.startsWith(`${item.name} —`),
      )
      .sort((a, b) => b.name.length - a.name.length)
    if (byName.length) return byName[0].id
  }

  const productId = line?.product_id
  if (!productId) return ''
  const matches = []
  for (const item of trackableItems) {
    const comps = item.components || []
    if (comps.some((c) => c.product_id === productId)) matches.push(item.id)
  }
  return matches.length === 1 ? matches[0] : ''
}

export function mapDocLinesForEditor(lines, trackableItems = []) {
  return (lines || []).map((l) => ({
    id: l.id,
    product_id: l.product_id || '',
    trackable_item_id: resolveTrackableItemId(l, trackableItems),
    description: l.description,
    quantity: l.quantity,
    unit_price: l.unit_price,
  }))
}
