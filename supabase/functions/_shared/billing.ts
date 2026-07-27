export function calcLineTotal(quantity: number, unitPrice: number) {
  const q = Number(quantity) || 0
  const p = Number(unitPrice) || 0
  return Math.round(q * p * 100) / 100
}

export function calcDocTotals(
  lines: Array<{ quantity: number; unit_price: number }>,
  taxRate = 0,
  discountAmount = 0,
) {
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
  return { subtotal: sub, discount_amount, tax_amount, total }
}

export function normalizeLines(lines: unknown[]) {
  return (lines || [])
    .map((line: Record<string, unknown>, i) => {
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
