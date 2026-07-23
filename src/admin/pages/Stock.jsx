import { useCallback, useEffect, useState } from 'react'
import { opsApi } from '../../lib/opsApi'
import { useOpsAlert } from '../OpsAlertContext'
import { adminBtnPrimary, adminFieldClass } from '../ui'

export default function StockPage() {
  const { showError, showSuccess } = useOpsAlert()
  const [levels, setLevels] = useState([])
  const [loading, setLoading] = useState(true)
  const [productId, setProductId] = useState('')
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await opsApi.getStockLevels()
    setLoading(false)
    if (err) {
      showError(err.message)
      return
    }
    setLevels(data || [])
    if (!productId && data?.[0]) setProductId(data[0].product_id)
  }, [productId, showError])

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, [])

  async function handleAdjust(e) {
    e.preventDefault()
    setSaving(true)
    const { error: err } = await opsApi.adjustStock({
      productId,
      quantityDelta: Number(qty),
      note,
    })
    setSaving(false)
    if (err) {
      showError(err.message)
      return
    }
    showSuccess('Stock adjustment saved.')
    setQty('')
    setNote('')
    const { data } = await opsApi.getStockLevels()
    setLevels(data || [])
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Stock</h1>
        <p className="mt-1 text-sm text-ink-300">
          On-hand levels for the different products we have in stock. Adjustments are logged.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {loading ? (
          <p className="text-sm text-ink-400">Loading…</p>
        ) : (
          levels.map((row) => (
            <div
              key={row.product_id}
              className="rounded-2xl border border-white/10 bg-ink-900/50 p-4"
            >
              <p className="font-mono text-xs text-ink-400">{row.sku}</p>
              <p className="mt-1 text-sm text-ink-200">{row.name}</p>
              <p className="mt-3 font-display text-3xl font-bold text-white">{row.on_hand}</p>
              <p className="text-xs text-ink-500">on hand</p>
            </div>
          ))
        )}
      </div>

      <form
        onSubmit={handleAdjust}
        className="space-y-3 rounded-2xl border border-white/10 bg-ink-900/40 p-4 sm:p-5"
      >
        <h2 className="text-sm font-semibold text-white">Stock adjustment</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">Product</span>
            <select
              className={adminFieldClass}
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              required
            >
              {levels.map((row) => (
                <option key={row.product_id} value={row.product_id}>
                  {row.sku}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
              Qty (+ receive / − remove)
            </span>
            <input
              required
              type="number"
              step="1"
              className={adminFieldClass}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="e.g. 10 or -2"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">Note</span>
            <input
              className={adminFieldClass}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional"
            />
          </label>
        </div>
        <button type="submit" disabled={saving} className={adminBtnPrimary}>
          {saving ? 'Saving…' : 'Apply adjustment'}
        </button>
      </form>
    </div>
  )
}
