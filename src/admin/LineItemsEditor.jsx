import {
  adminBtnSecondary,
  adminFieldClass,
  formatPula,
  adminTableShellSmClass,
  adminTableClass,
  adminColSecondary,
} from './ui'
import { calcDocTotals, calcLineTotal, emptyLine } from '../lib/billing'
import { useOpsAlert } from './OpsAlertContext'

function componentProduct(comp) {
  const p = comp?.products
  return Array.isArray(p) ? p[0] : p
}

/** Build quotation/invoice lines from a trackable catalog package. */
export function linesFromTrackableItem(item, quantity = 1, startSort = 1) {
  const qty = Math.max(1, Number(quantity) || 1)
  const components = [...(item?.components || [])].sort(
    (a, b) => (a.sort_order || 0) - (b.sort_order || 0),
  )
  if (!components.length) {
    return [
      {
        ...emptyLine(startSort),
        trackable_item_id: item?.id || '',
        description: item?.name || '',
        quantity: qty,
      },
    ]
  }

  return components.map((comp, i) => {
    const product = componentProduct(comp)
    const isFee = product?.tracks_stock === false
    const unitQty = Math.round(Number(comp.quantity || 1) * qty * 100) / 100
    return {
      ...emptyLine(startSort + i),
      product_id: product?.id || '',
      trackable_item_id: item?.id || '',
      description: isFee
        ? `${item.name} — ${product?.name || 'Monthly fee'}`
        : `${item.name} - Tracker Installation`,
      quantity: unitQty,
      unit_price: Number(product?.unit_price) || 0,
    }
  })
}

export function LineItemsEditor({
  lines,
  products,
  trackableItems = [],
  onChange,
  readOnly = false,
  taxRate = 0,
  discountAmount = 0,
  onDiscountChange,
}) {
  const { confirm } = useOpsAlert()

  function updateLine(index, patch) {
    const next = lines.map((line, i) => (i === index ? { ...line, ...patch } : line))
    onChange(next)
  }

  function pickTrackableItem(index, itemId) {
    if (!itemId) {
      updateLine(index, { trackable_item_id: '' })
      return
    }
    const item = trackableItems.find((t) => t.id === itemId)
    if (!item) return
    const qty = Number(lines[index]?.quantity) || 1
    const built = linesFromTrackableItem(item, qty, index + 1)
    const next = [...lines.slice(0, index), ...built, ...lines.slice(index + 1)]
    onChange(next.map((line, i) => ({ ...line, sort_order: i + 1 })))
  }

  function pickProduct(index, productId) {
    const product = products.find((p) => p.id === productId)
    updateLine(index, {
      product_id: productId,
      trackable_item_id: '',
      description: product ? product.name : lines[index].description,
      unit_price: product ? Number(product.unit_price) : lines[index].unit_price,
    })
  }

  function addLine() {
    onChange([...lines, emptyLine(lines.length + 1)])
  }

  async function removeLine(index) {
    const line = lines[index]
    const label =
      line?.description?.trim() ||
      products.find((p) => p.id === line?.product_id)?.name ||
      `line ${index + 1}`

    const ok = await confirm({
      title: 'Remove this line?',
      message: `"${label}" will be removed from this document. You can still cancel saving if this was a mistake.`,
      confirmLabel: 'Remove line',
    })
    if (!ok) return
    onChange(lines.filter((_, i) => i !== index))
  }

  const totals = calcDocTotals(lines, taxRate, discountAmount)
  const catalog = trackableItems.filter((t) => t.active !== false)

  return (
    <div className="space-y-3">
      <div className={adminTableShellSmClass}>
        <table className={adminTableClass}>
          <thead className="bg-ink-950/60 text-xs uppercase tracking-wider text-ink-400">
            <tr>
              <th className="px-3 py-2">Item to track</th>
              <th className={`px-3 py-2 ${adminColSecondary}`}>Product</th>
              <th className={`px-3 py-2 ${adminColSecondary}`}>Description</th>
              <th className="px-3 py-2">Qty</th>
              <th className="px-3 py-2">Unit price</th>
              <th className={`px-3 py-2 ${adminColSecondary}`}>Line</th>
              {!readOnly ? <th className="px-3 py-2" /> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {lines.map((line, index) => (
              <tr key={line.id || index} className="align-top">
                <td className="px-3 py-2">
                  <select
                    disabled={readOnly || !catalog.length}
                    className={`${adminFieldClass} min-w-0 w-full sm:min-w-[10rem]`}
                    value={line.trackable_item_id || ''}
                    onChange={(e) => pickTrackableItem(index, e.target.value)}
                    title="Pick what the client wants tracked — fills product, description and price"
                  >
                    <option value="">—</option>
                    {catalog.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className={`px-3 py-2 ${adminColSecondary}`}>
                  <select
                    disabled={readOnly}
                    className={`${adminFieldClass} min-w-0 w-full sm:min-w-[9rem]`}
                    value={line.product_id || ''}
                    onChange={(e) => pickProduct(index, e.target.value)}
                  >
                    <option value="">Custom…</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className={`px-3 py-2 ${adminColSecondary}`}>
                  <input
                    disabled={readOnly}
                    className={adminFieldClass}
                    value={line.description || ''}
                    onChange={(e) => updateLine(index, { description: e.target.value })}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    disabled={readOnly}
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    title="Enter a whole number (1 or more)"
                    className={`${adminFieldClass} w-20`}
                    value={line.quantity}
                    onChange={(e) => updateLine(index, { quantity: e.target.value })}
                    onInvalid={(e) => {
                      e.target.setCustomValidity(
                        'Quantity must be a whole number of 1 or more (for example 1, 2, or 3).',
                      )
                    }}
                    onInput={(e) => e.target.setCustomValidity('')}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    disabled={readOnly}
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    title="Enter the unit price in Pula"
                    className={`${adminFieldClass} w-28`}
                    value={line.unit_price}
                    onChange={(e) => updateLine(index, { unit_price: e.target.value })}
                    onInvalid={(e) => {
                      e.target.setCustomValidity(
                        'Unit price must be zero or more (for example 1250 or 1250.00).',
                      )
                    }}
                    onInput={(e) => e.target.setCustomValidity('')}
                  />
                </td>
                <td className={`px-3 py-2 text-ink-200 ${adminColSecondary}`}>
                  {formatPula(calcLineTotal(line.quantity, line.unit_price))}
                </td>
                {!readOnly ? (
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => removeLine(index)}
                      className="text-xs text-red-300 hover:text-red-200"
                    >
                      Remove
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!readOnly ? (
        <button type="button" onClick={addLine} className={adminBtnSecondary}>
          Add line
        </button>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
            Discount (P)
          </span>
          <input
            disabled={readOnly || !onDiscountChange}
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            title="Discount amount in Pula, applied before tax"
            className={`${adminFieldClass} w-36`}
            value={discountAmount}
            onChange={(e) => onDiscountChange?.(e.target.value)}
          />
        </label>
        <div className="space-y-1 text-right text-sm">
          <p className="text-ink-400">
            Subtotal: <span className="text-white">{formatPula(totals.subtotal)}</span>
          </p>
          {totals.discount_amount > 0 ? (
            <p className="text-ink-400">
              Discount:{' '}
              <span className="text-white">−{formatPula(totals.discount_amount)}</span>
            </p>
          ) : null}
          <p className="text-ink-400">
            Tax: <span className="text-white">{formatPula(totals.tax_amount)}</span>
          </p>
          <p className="font-semibold text-white">Total: {formatPula(totals.total)}</p>
        </div>
      </div>
    </div>
  )
}
