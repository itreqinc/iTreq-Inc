import { useCallback, useEffect, useState } from 'react'
import { opsApi } from '../../lib/opsApi'
import { upsertById, removeById } from '../../lib/listState'
import { useOpsAlert } from '../OpsAlertContext'
import { adminBtnDanger, adminBtnPrimary, adminBtnSecondary, adminFieldClass, formatPula } from '../ui'

function emptyItem() {
  return { name: '', blurb: '', active: true, sort_order: 0 }
}

function emptyComponent() {
  return { product_id: '', quantity: 1, sort_order: 10 }
}

export default function TrackingCatalogPage() {
  const { showError, showSuccess, confirm } = useOpsAlert()
  const [items, setItems] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [itemForm, setItemForm] = useState(emptyItem())
  const [components, setComponents] = useState([emptyComponent()])
  const [savingItem, setSavingItem] = useState(false)
  const [savingPackage, setSavingPackage] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [catalogRes, productsRes] = await Promise.all([
      opsApi.listTrackableItems({ withComponents: true }),
      opsApi.listProducts({ activeOnly: false }),
    ])
    setLoading(false)
    if (catalogRes.error) {
      showError(catalogRes.error.message)
      return
    }
    if (productsRes.error) {
      showError(productsRes.error.message)
      return
    }
    setItems(catalogRes.data || [])
    setProducts(productsRes.data || [])
  }, [showError])

  useEffect(() => {
    load()
  }, [load])

  function startNew() {
    setSelectedId(null)
    setCreating(true)
    setItemForm(emptyItem())
    setComponents([emptyComponent()])
  }

  function clearRight() {
    setSelectedId(null)
    setCreating(false)
    setItemForm(emptyItem())
    setComponents([emptyComponent()])
  }

  function selectItem(item) {
    setCreating(false)
    setSelectedId(item.id)
    setItemForm({
      name: item.name || '',
      blurb: item.blurb || '',
      active: item.active !== false,
      sort_order: item.sort_order ?? 0,
    })
    const comps = item.components || []
    setComponents(
      comps.length
        ? comps.map((c) => ({
            product_id: c.product_id,
            quantity: Number(c.quantity) || 1,
            sort_order: c.sort_order ?? 10,
          }))
        : [emptyComponent()],
    )
  }

  async function saveItem(e) {
    e.preventDefault()
    setSavingItem(true)
    const { data, error } = await opsApi.saveTrackableItem({
      id: selectedId || undefined,
      ...itemForm,
    })
    setSavingItem(false)
    if (error) {
      showError(error.message)
      return
    }
    showSuccess(selectedId ? 'Item updated.' : 'Item created.')
    const next = {
      ...data,
      components: selectedId
        ? items.find((i) => i.id === selectedId)?.components || []
        : [],
    }
    setItems((prev) => upsertById(prev, next))
    if (data?.id) selectItem(next)
  }

  async function savePackage() {
    if (!selectedId) {
      showError('Save the item first, then map products.')
      return
    }
    setSavingPackage(true)
    const { data, error } = await opsApi.saveTrackableItemComponents(selectedId, components)
    setSavingPackage(false)
    if (error) {
      showError(error.message)
      return
    }
    showSuccess('Package mapping saved.')
    const list = data || []
    setItems(list)
    const next = list.find((i) => i.id === selectedId)
    if (next) selectItem(next)
  }

  async function removeItem() {
    if (!selectedId) return
    const ok = await confirm({
      title: 'Delete this trackable item?',
      message: 'Clients will no longer see it in the portal catalog.',
      confirmLabel: 'Delete',
    })
    if (!ok) return
    const deletedId = selectedId
    const { error } = await opsApi.deleteTrackableItem(selectedId)
    if (error) {
      showError(error.message)
      return
    }
    showSuccess('Item deleted.')
    clearRight()
    setItems((prev) => removeById(prev, deletedId))
  }

  const selected = items.find((i) => i.id === selectedId)
  const showRight = creating || Boolean(selectedId)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Tracking catalog</h1>
          <p className="mt-1 text-sm text-ink-300">
            Client-facing items (what to track). Map each to tracker + fee products for portal quotes.
          </p>
        </div>
        <button type="button" onClick={startNew} className={adminBtnPrimary}>
          New item
        </button>
      </div>

      <div
        className={
          showRight
            ? 'grid gap-4 lg:grid-cols-[minmax(0,18rem)_1fr]'
            : 'grid gap-4 lg:grid-cols-[minmax(0,18rem)]'
        }
      >
        <aside className="admin-scroll max-h-[70vh] overflow-y-auto rounded-2xl border border-white/10 bg-ink-900/40">
          <div className="sticky top-0 border-b border-white/10 bg-ink-900/95 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-ink-400">
            Items
          </div>
          {loading ? (
            <p className="px-3 py-6 text-sm text-ink-400">Loading…</p>
          ) : items.length === 0 && !creating ? (
            <p className="px-3 py-6 text-sm text-ink-400">
              No items yet. Use New item to add one.
            </p>
          ) : (
            <ul>
              {creating ? (
                <li>
                  <button
                    type="button"
                    className="w-full bg-brand-500/15 px-3 py-2.5 text-left text-sm text-white"
                  >
                    <span className="font-medium">New item</span>
                    <span className="mt-0.5 block text-xs text-ink-500">Draft — not saved yet</span>
                  </button>
                </li>
              ) : null}
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => selectItem(item)}
                    className={`w-full px-3 py-2.5 text-left text-sm ${
                      !creating && item.id === selectedId
                        ? 'bg-brand-500/15 text-white'
                        : 'text-ink-200 hover:bg-white/5'
                    }`}
                  >
                    <span className="font-medium">{item.name}</span>
                    {!item.active ? (
                      <span className="ml-2 text-xs text-ink-500">(inactive)</span>
                    ) : null}
                    <span className="mt-0.5 block text-xs text-ink-500">
                      {(item.components || []).length} product
                      {(item.components || []).length === 1 ? '' : 's'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!loading && !showRight && items.length > 0 ? (
            <p className="border-t border-white/10 px-3 py-3 text-xs text-ink-500">
              Select an item to edit it.
            </p>
          ) : null}
        </aside>

        {showRight ? (
        <div className="space-y-4">
          <form
            onSubmit={saveItem}
            className="space-y-3 rounded-2xl border border-white/10 bg-ink-900/40 p-4 sm:p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-white">
                {selectedId ? 'Edit item' : 'New item'}
              </h2>
              <button type="button" onClick={clearRight} className={adminBtnSecondary}>
                Close
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                  Name *
                </span>
                <input
                  required
                  className={adminFieldClass}
                  value={itemForm.name}
                  onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                  Blurb
                </span>
                <input
                  className={adminFieldClass}
                  value={itemForm.blurb}
                  onChange={(e) => setItemForm((f) => ({ ...f, blurb: e.target.value }))}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                  Sort order
                </span>
                <input
                  type="number"
                  className={adminFieldClass}
                  value={itemForm.sort_order}
                  onChange={(e) =>
                    setItemForm((f) => ({ ...f, sort_order: Number(e.target.value) || 0 }))
                  }
                />
              </label>
              <label className="flex items-end gap-2 pb-2 text-sm text-ink-200">
                <input
                  type="checkbox"
                  checked={itemForm.active}
                  onChange={(e) => setItemForm((f) => ({ ...f, active: e.target.checked }))}
                />
                Active in portal
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={savingItem} className={adminBtnPrimary}>
                {savingItem ? 'Saving…' : selectedId ? 'Save item' : 'Create item'}
              </button>
              {selectedId ? (
                <button type="button" onClick={removeItem} className={adminBtnDanger}>
                  Delete
                </button>
              ) : null}
            </div>
          </form>

          <div className="space-y-3 rounded-2xl border border-white/10 bg-ink-900/40 p-4 sm:p-5">
            <div>
              <h2 className="text-sm font-semibold text-white">Package mapping</h2>
              <p className="mt-1 text-xs text-ink-400">
                Products and prices (SKU is staff-only). Typical package: tracker + monthly fee.
                {selected ? ` Editing: ${selected.name}` : ' Save the item first to map products.'}
              </p>
            </div>
            <div className="space-y-2">
              {components.map((comp, idx) => (
                <div key={idx} className="grid gap-2 sm:grid-cols-[1fr_6rem_auto]">
                  <select
                    className={adminFieldClass}
                    value={comp.product_id}
                    onChange={(e) => {
                      const next = [...components]
                      next[idx] = { ...next[idx], product_id: e.target.value }
                      setComponents(next)
                    }}
                    disabled={!selectedId}
                  >
                    <option value="">Select product…</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.sku} — {p.name} ({formatPula(p.unit_price)})
                        {!p.active ? ' [inactive]' : ''}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    className={adminFieldClass}
                    value={comp.quantity}
                    disabled={!selectedId}
                    onChange={(e) => {
                      const next = [...components]
                      next[idx] = { ...next[idx], quantity: e.target.value }
                      setComponents(next)
                    }}
                  />
                  <button
                    type="button"
                    disabled={!selectedId || components.length <= 1}
                    className={adminBtnSecondary}
                    onClick={() => setComponents(components.filter((_, i) => i !== idx))}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!selectedId}
                className={adminBtnSecondary}
                onClick={() =>
                  setComponents([
                    ...components,
                    { ...emptyComponent(), sort_order: (components.length + 1) * 10 },
                  ])
                }
              >
                Add product
              </button>
              <button
                type="button"
                disabled={!selectedId || savingPackage}
                className={adminBtnPrimary}
                onClick={savePackage}
              >
                {savingPackage ? 'Saving…' : 'Save package'}
              </button>
            </div>
          </div>
        </div>
        ) : null}
      </div>
    </div>
  )
}
