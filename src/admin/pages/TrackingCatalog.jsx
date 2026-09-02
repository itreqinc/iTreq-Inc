import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { opsApi } from '../../lib/opsApi'
import { removeById } from '../../lib/listState'
import {
  bundleSummaryText,
  catalogHealthCounts,
  isBundleComplete,
  isPortalReady,
  trackableItemForPreview,
} from '../../lib/catalogPresentation'
import { calcLineTotal } from '../../lib/billing'
import { isBundleProduct, normalizeProductKind, PRODUCT_KIND } from '../../lib/productKind'
import { useAuth } from '../../contexts/AuthContext'
import { isAdmin } from '../../lib/authConfig'
import { linesFromTrackableItem } from '../LineItemsEditor'
import { CatalogExplainer } from '../components/CatalogExplainer'
import { useOpsAlert } from '../OpsAlertContext'
import {
  adminBtnDanger,
  adminBtnPrimary,
  adminBtnSecondary,
  adminFieldClass,
  formatPula,
} from '../ui'

function emptyItem() {
  return { name: '', blurb: '', active: true, sort_order: 0 }
}

function emptyComponent() {
  return { product_id: '', quantity: 1, sort_order: 10 }
}

function snapshotCatalogEditor(itemForm, components) {
  return JSON.stringify({
    name: String(itemForm?.name || '').trim(),
    blurb: String(itemForm?.blurb || '').trim(),
    active: itemForm?.active !== false,
    sort_order: Number(itemForm?.sort_order) || 0,
    components: (components || []).map((c) => ({
      product_id: c.product_id || '',
      quantity: String(c.quantity ?? ''),
      sort_order: Number(c.sort_order) || 0,
    })),
  })
}

function StatusBadge({ ready, active }) {
  if (ready) {
    return (
      <span className="inline-flex rounded-md bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200">
        Portal ready
      </span>
    )
  }
  if (active) {
    return (
      <span className="inline-flex rounded-md bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
        Incomplete
      </span>
    )
  }
  return (
    <span className="inline-flex rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
      Draft
    </span>
  )
}

export default function TrackingCatalogPage() {
  const { user } = useAuth()
  const canManage = isAdmin(user?.role)
  const [searchParams] = useSearchParams()
  const { showError, showSuccess, confirm } = useOpsAlert()
  const [items, setItems] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [itemForm, setItemForm] = useState(emptyItem())
  const [components, setComponents] = useState([emptyComponent()])
  const [baseline, setBaseline] = useState(() =>
    snapshotCatalogEditor(emptyItem(), [emptyComponent()]),
  )
  const [saving, setSaving] = useState(false)
  const [didApplyQuery, setDidApplyQuery] = useState(false)

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

  useEffect(() => {
    if (loading || didApplyQuery) return
    const itemId = searchParams.get('item')
    setDidApplyQuery(true)
    if (!itemId) return
    const item = items.find((i) => i.id === itemId)
    if (!item) return
    setCreating(false)
    setSelectedId(item.id)
    setItemForm({
      name: item.name || '',
      blurb: item.blurb || '',
      active: item.active !== false,
      sort_order: item.sort_order ?? 0,
    })
    const comps = item.components || []
    const nextComponents = comps.length
      ? comps.map((c) => ({
          product_id: c.product_id,
          quantity: Number(c.quantity) || 1,
          sort_order: c.sort_order ?? 10,
        }))
      : [emptyComponent()]
    setComponents(nextComponents)
    setBaseline(
      snapshotCatalogEditor(
        {
          name: item.name || '',
          blurb: item.blurb || '',
          active: item.active !== false,
          sort_order: item.sort_order ?? 0,
        },
        nextComponents,
      ),
    )
  }, [loading, didApplyQuery, searchParams, items])

  const health = useMemo(() => catalogHealthCounts(items), [items])

  const isDirty = useMemo(
    () => snapshotCatalogEditor(itemForm, components) !== baseline,
    [itemForm, components, baseline],
  )
  const previewLines = useMemo(() => {
    const item = trackableItemForPreview({
      id: selectedId,
      name: itemForm.name,
      components,
      products,
    })
    return linesFromTrackableItem(item, 1, 1)
  }, [selectedId, itemForm.name, components, products])

  const bundleProducts = useMemo(
    () => products.filter((p) => isBundleProduct(p)),
    [products],
  )

  function startNew() {
    const nextForm = emptyItem()
    const nextComponents = [emptyComponent()]
    setSelectedId(null)
    setCreating(true)
    setItemForm(nextForm)
    setComponents(nextComponents)
    setBaseline(snapshotCatalogEditor(nextForm, nextComponents))
  }

  function clearRight() {
    const nextForm = emptyItem()
    const nextComponents = [emptyComponent()]
    setSelectedId(null)
    setCreating(false)
    setItemForm(nextForm)
    setComponents(nextComponents)
    setBaseline(snapshotCatalogEditor(nextForm, nextComponents))
  }

  function selectItem(item) {
    setCreating(false)
    setSelectedId(item.id)
    const nextForm = {
      name: item.name || '',
      blurb: item.blurb || '',
      active: item.active !== false,
      sort_order: item.sort_order ?? 0,
    }
    const comps = item.components || []
    const nextComponents = comps.length
      ? comps.map((c) => ({
          product_id: c.product_id,
          quantity: Number(c.quantity) || 1,
          sort_order: c.sort_order ?? 10,
        }))
      : [emptyComponent()]
    setItemForm(nextForm)
    setComponents(nextComponents)
    setBaseline(snapshotCatalogEditor(nextForm, nextComponents))
  }

  async function saveAll(e) {
    e.preventDefault()
    if (!isDirty) return

    const mappedProducts = components.filter((c) => c.product_id)
    if (itemForm.active && !isBundleComplete(components)) {
      showError(
        'Add at least one product to the bundle before marking this item active in the portal.',
      )
      return
    }

    setSaving(true)

    const { data, error } = await opsApi.saveTrackableItem({
      id: selectedId || undefined,
      ...itemForm,
    })
    if (error) {
      setSaving(false)
      showError(error.message)
      return
    }

    const itemId = data.id
    const { data: list, error: packageError } = await opsApi.saveTrackableItemComponents(
      itemId,
      components,
    )
    setSaving(false)

    if (packageError) {
      showError(packageError.message)
      return
    }

    showSuccess(selectedId ? 'Item saved.' : 'Item created.')
    setItems(list || [])
    const saved = (list || []).find((i) => i.id === itemId)
    if (saved) selectItem(saved)
    else if (data) selectItem({ ...data, components: mappedProducts })
  }

  async function removeItem() {
    if (!selectedId) return
    const ok = await confirm({
      title: 'Delete this item?',
      message: 'Clients will no longer see it when requesting a quote.',
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

  const showRight = creating || Boolean(selectedId)
  const bundleReady = isBundleComplete(components)
  const portalReady = itemForm.active && bundleReady
  const readOnly = !canManage

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">What clients request</h1>
          <p className="mt-1 text-sm text-ink-300">
            {canManage
              ? 'Categories clients pick on the portal. Each maps to a bundle of SKUs (tracker + monthly fee) that become quote and invoice lines.'
              : 'View-only. See what clients can request on the portal and which SKUs each category maps to.'}
          </p>
        </div>
        {canManage ? (
          <button type="button" onClick={startNew} className={adminBtnPrimary}>
            New item
          </button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-ink-900/90 p-4">
          <p className="text-xs uppercase tracking-wider text-ink-400">Catalog items</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-white">{health.total}</p>
        </div>
        <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/5 p-4">
          <p className="text-xs uppercase tracking-wider text-ink-400">Portal ready</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-white">{health.portalReady}</p>
        </div>
        <div className="rounded-2xl border border-amber-400/25 bg-amber-500/5 p-4">
          <p className="text-xs uppercase tracking-wider text-ink-400">Incomplete</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-white">{health.incomplete}</p>
          <p className="mt-1 text-xs text-ink-400">Active but missing bundle SKUs</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-ink-900/90 p-4">
          <p className="text-xs uppercase tracking-wider text-ink-400">Draft</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-white">{health.draft}</p>
          <p className="mt-1 text-xs text-ink-400">Not active in portal</p>
        </div>
      </div>

      <CatalogExplainer>
        <p>
          Clients see <strong className="text-ink-100">names and blurbs</strong> only. When they
          request a quote, each item expands into the SKUs you map below — usually one hardware
          tracker plus one monthly fee from{' '}
          <Link to="/admin/products" className="font-medium text-brand-300 hover:text-brand-200">
            SKUs &amp; pricing
          </Link>
          .
        </p>
      </CatalogExplainer>

      <div
        className={
          showRight
            ? 'grid gap-4 lg:grid-cols-[minmax(0,18rem)_1fr]'
            : 'grid gap-4 lg:grid-cols-[minmax(0,18rem)]'
        }
      >
        <aside className="admin-scroll max-h-[70vh] overflow-y-auto rounded-2xl border border-white/10 bg-ink-900/90">
          <div className="sticky top-0 border-b border-white/10 bg-ink-900/95 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-ink-400">
            Client catalog
          </div>
          {loading ? (
            <p className="px-3 py-6 text-sm text-ink-400">Loading…</p>
          ) : items.length === 0 && !creating ? (
            <p className="px-3 py-6 text-sm text-ink-400">
              {canManage ? 'No items yet. Use New item to add one.' : 'No catalog items yet.'}
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
              {items.map((item) => {
                const summary = bundleSummaryText(item, products)
                const ready = isPortalReady(item)
                return (
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
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{item.name}</span>
                        <StatusBadge ready={ready} active={item.active !== false} />
                      </div>
                      <span className="mt-0.5 block text-xs text-ink-500">{summary.text}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {!loading && !showRight && items.length > 0 ? (
            <p className="border-t border-white/10 px-3 py-3 text-xs text-ink-500">
              {canManage ? 'Select an item to edit it.' : 'Select an item to view it.'}
            </p>
          ) : null}
        </aside>

        {showRight ? (
          <form
            onSubmit={canManage ? saveAll : (e) => e.preventDefault()}
            className="space-y-4"
          >
            <div className="space-y-3 rounded-2xl border border-white/10 bg-ink-900/90 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-white">
                    {selectedId
                      ? canManage
                        ? 'Edit item'
                        : 'Catalog item'
                      : 'New item'}
                  </h2>
                  <p className="mt-0.5 text-xs text-ink-400">What clients see in the portal</p>
                </div>
                <button type="button" onClick={clearRight} className={adminBtnSecondary}>
                  Close
                </button>
              </div>

              <div className="rounded-xl border border-white/10 bg-ink-950/40 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
                  Portal preview
                </p>
                <p className="mt-1 font-medium text-white">{itemForm.name || 'Item name'}</p>
                {itemForm.blurb ? (
                  <p className="mt-0.5 text-sm text-ink-400">{itemForm.blurb}</p>
                ) : (
                  <p className="mt-0.5 text-sm italic text-ink-500">No blurb yet</p>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                    Name *
                  </span>
                  <input
                    required={canManage}
                    disabled={readOnly}
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
                    disabled={readOnly}
                    className={adminFieldClass}
                    value={itemForm.blurb}
                    onChange={(e) => setItemForm((f) => ({ ...f, blurb: e.target.value }))}
                    placeholder="Short description for clients"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                    Sort order
                  </span>
                  <input
                    type="number"
                    disabled={readOnly}
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
                    disabled={readOnly}
                    checked={itemForm.active}
                    onChange={(e) => setItemForm((f) => ({ ...f, active: e.target.checked }))}
                  />
                  Active in portal
                </label>
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-white/10 bg-ink-900/90 p-4 sm:p-5">
              <div>
                <h2 className="text-sm font-semibold text-white">Bundle (SKUs included)</h2>
                <p className="mt-1 text-xs text-ink-400">
                  Typical bundle: one hardware tracker plus one monthly fee. These become separate
                  lines on quotes and invoices.
                </p>
                {!bundleReady ? (
                  <p className="mt-2 text-xs text-amber-200">
                    {canManage
                      ? 'Select at least one product to complete the bundle.'
                      : 'Bundle incomplete — ask an admin to finish mapping SKUs.'}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                {components.map((comp, idx) => (
                  <div key={idx} className="grid gap-2 sm:grid-cols-[1fr_6rem_auto]">
                    <select
                      disabled={readOnly}
                      className={adminFieldClass}
                      value={comp.product_id}
                      onChange={(e) => {
                        const next = [...components]
                        next[idx] = { ...next[idx], product_id: e.target.value }
                        setComponents(next)
                      }}
                    >
                      <option value="">Select SKU…</option>
                      {bundleProducts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.sku} — {p.name} ({formatPula(p.unit_price)})
                          {normalizeProductKind(p) === PRODUCT_KIND.monthlyFee
                            ? ' · monthly fee'
                            : ''}
                          {!p.active ? ' [inactive]' : ''}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      disabled={readOnly}
                      className={adminFieldClass}
                      value={comp.quantity}
                      onChange={(e) => {
                        const next = [...components]
                        next[idx] = { ...next[idx], quantity: e.target.value }
                        setComponents(next)
                      }}
                    />
                    {canManage ? (
                      <button
                        type="button"
                        disabled={components.length <= 1}
                        className={adminBtnSecondary}
                        onClick={() => setComponents(components.filter((_, i) => i !== idx))}
                      >
                        Remove
                      </button>
                    ) : (
                      <span className="self-center text-xs text-ink-500">qty</span>
                    )}
                  </div>
                ))}
              </div>
              {canManage ? (
                <button
                  type="button"
                  className={adminBtnSecondary}
                  onClick={() =>
                    setComponents([
                      ...components,
                      { ...emptyComponent(), sort_order: (components.length + 1) * 10 },
                    ])
                  }
                >
                  Add SKU
                </button>
              ) : null}
            </div>

            {previewLines.length ? (
              <div className="space-y-2 rounded-2xl border border-white/10 bg-ink-900/90 p-4 sm:p-5">
                <h2 className="text-sm font-semibold text-white">Quote line preview</h2>
                <p className="text-xs text-ink-400">
                  One client quantity of this item becomes these lines on a quote or invoice.
                </p>
                <ul className="divide-y divide-white/5 rounded-xl border border-white/10 bg-ink-950/30 text-sm">
                  {previewLines.map((line, i) => (
                    <li
                      key={i}
                      className="flex flex-wrap items-start justify-between gap-2 px-3 py-2"
                    >
                      <span className="min-w-0 text-ink-200">{line.description}</span>
                      <span className="shrink-0 tabular-nums text-ink-300">
                        {line.quantity} × {formatPula(line.unit_price)} ={' '}
                        {formatPula(calcLineTotal(line.quantity, line.unit_price))}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {canManage ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="submit"
                  disabled={saving || !isDirty}
                  title={!isDirty ? 'Change something before saving' : undefined}
                  className={adminBtnPrimary}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                {portalReady ? (
                  <span className="text-xs text-emerald-300">Ready for the portal</span>
                ) : itemForm.active ? (
                  <span className="text-xs text-amber-300">Active but bundle incomplete</span>
                ) : null}
                {selectedId ? (
                  <button type="button" onClick={removeItem} className={adminBtnDanger}>
                    Delete
                  </button>
                ) : null}
              </div>
            ) : portalReady ? (
              <p className="text-xs text-emerald-300">Ready for the portal</p>
            ) : null}
          </form>
        ) : null}
      </div>
    </div>
  )
}
