import { useCallback, useEffect, useState } from 'react'
import { opsApi } from '../../lib/opsApi'
import { useOpsAlert } from '../OpsAlertContext'
import { adminBtnPrimary, adminBtnSecondary, adminFieldClass, formatPula } from '../ui'

const emptyNewProduct = {
  sku: '',
  name: '',
  unit_price: '0',
  tracks_stock: false,
  active: true,
}

export default function ProductsPage() {
  const { showError, showSuccess, confirm } = useOpsAlert()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [drafts, setDrafts] = useState({})
  const [showNew, setShowNew] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newProduct, setNewProduct] = useState(emptyNewProduct)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await opsApi.listProducts()
    setLoading(false)
    if (err) {
      showError(err.message)
      return
    }
    setProducts(data || [])
    const next = {}
    for (const p of data || []) {
      next[p.id] = {
        name: p.name,
        unit_price: String(p.unit_price),
        active: p.active,
      }
    }
    setDrafts(next)
  }, [showError])

  useEffect(() => {
    load()
  }, [load])

  function updateDraft(id, patch) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }))
  }

  async function save(id) {
    const draft = drafts[id]
    if (!draft) return
    setSavingId(id)
    const { error: err } = await opsApi.updateProduct(id, draft)
    setSavingId(null)
    if (err) {
      showError(err.message)
      return
    }
    showSuccess('Product updated.')
    await load()
  }

  function startNew() {
    setNewProduct(emptyNewProduct)
    setShowNew(true)
  }

  function closeNew() {
    setShowNew(false)
    setNewProduct(emptyNewProduct)
  }

  async function handleCreate(e) {
    e.preventDefault()
    const ok = await confirm({
      title: 'Add this product?',
      message: `Create product ${newProduct.sku.trim() || '(no SKU)'} in the catalog?`,
      confirmLabel: 'Add product',
    })
    if (!ok) return

    setCreating(true)
    const { error: err } = await opsApi.createProduct(newProduct)
    setCreating(false)
    if (err) {
      showError(err.message)
      return
    }
    showSuccess('Product added.')
    closeNew()
    await load()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Products</h1>
          <p className="mt-1 text-sm text-ink-300">
            Trackers, fees, and other catalog items. Staff can add products and change prices.
          </p>
        </div>
        {!showNew ? (
          <button type="button" onClick={startNew} className={adminBtnPrimary}>
            New product
          </button>
        ) : null}
      </div>

      {showNew ? (
        <form
          onSubmit={handleCreate}
          className="max-w-xl space-y-3 rounded-2xl border border-white/10 bg-ink-900/40 p-4 sm:p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">New product</h2>
            <button type="button" onClick={closeNew} className={adminBtnSecondary}>
              Close
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">SKU *</span>
              <input
                required
                className={adminFieldClass}
                value={newProduct.sku}
                onChange={(e) => setNewProduct((f) => ({ ...f, sku: e.target.value }))}
                placeholder="e.g. iTreq730"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                Unit price (P) *
              </span>
              <input
                required
                type="number"
                min="0"
                step="0.01"
                className={adminFieldClass}
                value={newProduct.unit_price}
                onChange={(e) => setNewProduct((f) => ({ ...f, unit_price: e.target.value }))}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">Name *</span>
              <input
                required
                className={adminFieldClass}
                value={newProduct.name}
                onChange={(e) => setNewProduct((f) => ({ ...f, name: e.target.value }))}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-ink-300">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={newProduct.tracks_stock}
                onChange={(e) =>
                  setNewProduct((f) => ({ ...f, tracks_stock: e.target.checked }))
                }
              />
              Tracks stock
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={newProduct.active}
                onChange={(e) => setNewProduct((f) => ({ ...f, active: e.target.checked }))}
              />
              Active
            </label>
          </div>
          <button type="submit" disabled={creating} className={adminBtnPrimary}>
            {creating ? 'Adding…' : 'Add product'}
          </button>
        </form>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-ink-900/80 text-xs uppercase tracking-wider text-ink-400">
            <tr>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Stocked</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-ink-400">
                  Loading…
                </td>
              </tr>
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-ink-400">
                  No products yet.
                </td>
              </tr>
            ) : (
              products.map((p) => {
                const d = drafts[p.id] || {}
                return (
                  <tr key={p.id} className="bg-ink-900/20 align-top">
                    <td className="px-4 py-3 font-mono text-xs text-ink-300">{p.sku}</td>
                    <td className="px-4 py-3">
                      <input
                        className={adminFieldClass}
                        value={d.name || ''}
                        onChange={(e) => updateDraft(p.id, { name: e.target.value })}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className={`${adminFieldClass} max-w-[8rem]`}
                        value={d.unit_price ?? ''}
                        onChange={(e) => updateDraft(p.id, { unit_price: e.target.value })}
                      />
                      <p className="mt-1 text-[11px] text-ink-500">{formatPula(d.unit_price)}</p>
                    </td>
                    <td className="px-4 py-3 text-ink-300">{p.tracks_stock ? 'Yes' : 'No'}</td>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={Boolean(d.active)}
                        onChange={(e) => updateDraft(p.id, { active: e.target.checked })}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={savingId === p.id}
                        onClick={() => save(p.id)}
                        className={adminBtnPrimary}
                      >
                        {savingId === p.id ? 'Saving…' : 'Save'}
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
