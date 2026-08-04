import { useMemo, useState } from 'react'
import {
  adminBtnSecondary,
  adminFieldClass,
  formatPula,
  adminTableShellSmClass,
  adminTableClass,
  adminColSecondary,
} from './ui'
import { calcDocTotals, calcLineTotal, emptyLine } from '../lib/billing'
import {
  catalogComponentDescription,
  isUsageProduct,
} from '../lib/productKind'
import { buildRoamingDescription } from '../lib/roamingLine'
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
    const unitQty = Math.round(Number(comp.quantity || 1) * qty * 100) / 100
    return {
      ...emptyLine(startSort + i),
      product_id: product?.id || '',
      trackable_item_id: item?.id || '',
      description: catalogComponentDescription(item.name, product),
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
  /** When set (e.g. invoices), Add line saves first then appends a blank line. */
  onPersistAddBlankLine = null,
  /** When set, roaming add persists the full next lines array (save + keep open). */
  onPersistLines = null,
  persistBusy = false,
}) {
  const { confirm } = useOpsAlert()
  const usageProducts = useMemo(
    () => products.filter((p) => p.active !== false && isUsageProduct(p)),
    [products],
  )
  const [roaming, setRoaming] = useState(() => ({
    product_id: '',
    description: '',
    quantity: '1',
  }))

  const roamingProductId = roaming.product_id || usageProducts[0]?.id || ''
  const roamingProduct = products.find((p) => p.id === roamingProductId)
  const roamingQty = Math.max(1, Math.round(Number(roaming.quantity) || 1))
  const roamingPreview = roamingProduct
    ? buildRoamingDescription(roamingProduct.name, roaming.description)
    : ''

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
    if (onPersistAddBlankLine) {
      onPersistAddBlankLine()
      return
    }
    onChange([...lines, emptyLine(lines.length + 1)])
  }

  async function addRoamingLine() {
    if (!roamingProduct || roamingQty < 1) return
    const description = buildRoamingDescription(roamingProduct.name, roaming.description)
    const line = {
      ...emptyLine(lines.length + 1),
      product_id: roamingProduct.id,
      trackable_item_id: '',
      description,
      quantity: roamingQty,
      unit_price: Number(roamingProduct.unit_price) || 0,
    }
    const nextLines = [...lines, line]
    if (onPersistLines) {
      await onPersistLines(nextLines)
    } else {
      onChange(nextLines)
    }
    setRoaming((r) => ({
      ...r,
      product_id: roamingProduct.id,
      description: '',
      quantity: '1',
    }))
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

  function descriptionPlaceholder(line) {
    const product = products.find((p) => p.id === line.product_id)
    if (product && isUsageProduct(product)) {
      return 'e.g. Roaming — B 123 ABC, 12–15 Jul 2026'
    }
    return ''
  }

  return (
    <div className="space-y-3">
      <div className={adminTableShellSmClass}>
        <table className={adminTableClass}>
          <thead className="bg-ink-950/60 text-xs uppercase tracking-wider text-ink-400">
            <tr>
              <th className={`px-3 py-2 ${adminColSecondary}`}>Item to track</th>
              <th className={`px-3 py-2 ${adminColSecondary}`}>Product</th>
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2">Qty</th>
              <th className="px-3 py-2">Unit price</th>
              <th className={`px-3 py-2 ${adminColSecondary}`}>Line</th>
              {!readOnly ? <th className="px-3 py-2 text-right"> </th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {lines.map((line, index) => (
              <tr key={line.id || index} className="align-top">
                <td className={`px-3 py-2 ${adminColSecondary}`}>
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
                <td className="px-3 py-2">
                  <input
                    disabled={readOnly}
                    className={`${adminFieldClass} min-w-[10rem]`}
                    value={line.description || ''}
                    placeholder={readOnly ? '' : descriptionPlaceholder(line)}
                    title={
                      readOnly
                        ? undefined
                        : 'Edit the line text shown on the invoice — add registrations, dates, or other detail.'
                    }
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
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => removeLine(index)}
                      className="text-xs font-medium text-red-300 hover:text-red-200"
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
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={persistBusy}
            onClick={addLine}
            className={adminBtnSecondary}
            title={
              onPersistAddBlankLine
                ? 'Save the current line(s) to the draft, then start a new blank line'
                : undefined
            }
          >
            {persistBusy ? 'Saving…' : 'Add line'}
          </button>
        </div>
      ) : null}

      {!readOnly && usageProducts.length > 0 ? (
        <div className="space-y-3 rounded-xl border border-amber-400/20 bg-amber-500/5 p-3 sm:p-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Add roaming / usage</h3>
            <p className="mt-0.5 text-xs text-ink-400">
              Put registrations, dates, and any other detail in the description. Quantity defaults
              to 1
              {onPersistLines
                ? '. Adding a line saves it to the draft first.'
                : ' — change it before adding if needed.'}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
            <label className="block sm:col-span-2 lg:col-span-2">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                Usage SKU
              </span>
              <select
                className={adminFieldClass}
                value={roamingProductId}
                onChange={(e) => setRoaming((r) => ({ ...r, product_id: e.target.value }))}
              >
                {usageProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({formatPula(p.unit_price)}/day)
                  </option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2 lg:col-span-3">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                Description
              </span>
              <input
                className={adminFieldClass}
                value={roaming.description}
                onChange={(e) => setRoaming((r) => ({ ...r, description: e.target.value }))}
                placeholder="e.g. B 123 ABC, 12–15 Jul 2026"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">Qty</span>
              <input
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                className={adminFieldClass}
                value={roaming.quantity}
                onChange={(e) => setRoaming((r) => ({ ...r, quantity: e.target.value }))}
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!roamingProduct || roamingQty < 1 || persistBusy}
              onClick={addRoamingLine}
              className={adminBtnSecondary}
              title={
                onPersistLines
                  ? 'Add this roaming line and save it to the draft'
                  : undefined
              }
            >
              {persistBusy ? 'Saving…' : 'Add line'}
            </button>
            {roamingPreview ? (
              <p className="min-w-0 text-xs text-ink-400">
                Preview: <span className="text-ink-200">{roamingPreview}</span>
              </p>
            ) : null}
          </div>
        </div>
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
