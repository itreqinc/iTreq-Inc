import {
  useCallback,
  useEffect,
  useMemo,
  useState } from 'react'
import { opsApi } from '../../lib/opsApi'
import { useAuth } from '../../contexts/AuthContext'
import { isAdmin } from '../../lib/authConfig'
import {
  PRODUCT_KIND,
  normalizeProductKind,
  productKindLabel,
  productKindPriceSuffix,
  rowFromProductKind,
} from '../../lib/productKind'
import { bundleRefsByProductId } from '../../lib/catalogPresentation'
import { Link } from 'react-router-dom'
import { useOpsAlert } from '../OpsAlertContext'
import { CatalogExplainer } from '../components/CatalogExplainer'
import { adminBtnPrimary,
  adminBtnSecondary,
  adminFieldClass,
  formatPula,
  adminTableShellClass,
  adminTableClass,
  adminColSecondary,
} from '../ui'

const emptyNewProduct = {
  sku: '',
  name: '',
  unit_price: '0',
  product_kind: PRODUCT_KIND.hardware,
  tracks_stock: true,
  active: true,
}

const TABS = [
  { id: 'hardware', label: 'Hardware trackers' },
  { id: 'fees', label: 'Monthly fees' },
  { id: 'usage', label: 'Usage charges' },
  { id: 'all', label: 'All SKUs' },
]

function ActionIcon({ d }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  )
}

const ICONS = {
  pencil:
    'M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10',
  trash:
    'M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0',
  check: 'M4.5 12.75l6 6 9-13.5',
  x: 'M6 18L18 6M6 6l12 12',
}

function IconAction({ label, onClick, disabled, tone = 'default', children }) {
  const [showTip, setShowTip] = useState(false)
  const toneClass =
    tone === 'danger'
      ? 'text-red-400 hover:bg-red-500/10 hover:text-red-300'
      : tone === 'muted'
        ? 'text-ink-400 hover:bg-white/5 hover:text-ink-200'
        : 'text-brand-400 hover:bg-brand-500/10 hover:text-brand-300'

  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
      onFocus={() => setShowTip(true)}
      onBlur={() => setShowTip(false)}
      className={`relative inline-flex rounded-md p-1.5 transition disabled:cursor-not-allowed disabled:opacity-40 ${toneClass}`}
    >
      {children}
      {showTip ? (
        <span
          role="tooltip"
          className="pointer-events-none absolute right-0 top-full z-20 mt-1.5 whitespace-nowrap rounded-md border border-white/10 bg-ink-900 px-2 py-1 text-[11px] font-medium text-ink-100 shadow-lg"
        >
          {label}
        </span>
      ) : null}
    </button>
  )
}

function kindBadge(productOrKind) {
  const kind =
    typeof productOrKind === 'string'
      ? productOrKind
      : normalizeProductKind(productOrKind)
  const label = productKindLabel(kind)
  const cls =
    kind === PRODUCT_KIND.hardware
      ? 'bg-sky-500/20 text-sky-200'
      : kind === PRODUCT_KIND.usage
        ? 'bg-amber-500/20 text-amber-200'
        : 'bg-emerald-500/20 text-emerald-200'
  return (
    <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  )
}

function tabForProductKind(kind) {
  if (kind === PRODUCT_KIND.hardware) return 'hardware'
  if (kind === PRODUCT_KIND.usage) return 'usage'
  return 'fees'
}

function UsedInCell({ productId, usedInByProductId }) {
  const refs = usedInByProductId.get(productId) || []
  if (!refs.length) {
    return <span className="text-ink-500">—</span>
  }
  return (
    <span className="flex flex-wrap gap-x-1 gap-y-0.5 text-xs text-ink-300">
      {refs.map((ref, i) => (
        <span key={ref.id}>
          <Link
            to={`/admin/tracking-catalog?item=${ref.id}`}
            className="text-brand-300 hover:text-brand-200"
          >
            {ref.name}
          </Link>
          {i < refs.length - 1 ? ',' : ''}
        </span>
      ))}
    </span>
  )
}

export default function ProductsPage() {
  const { user } = useAuth()
  const canManage = isAdmin(user?.role)
  const { showError, showSuccess, confirm } = useOpsAlert()
  const [products, setProducts] = useState([])
  const [catalogItems, setCatalogItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newProduct, setNewProduct] = useState(emptyNewProduct)
  const [tab, setTab] = useState('hardware')

  const load = useCallback(async () => {
    setLoading(true)
    const [productsRes, catalogRes] = await Promise.all([
      opsApi.listProducts(),
      opsApi.listTrackableItems({ withComponents: true }),
    ])
    setLoading(false)
    if (productsRes.error) {
      showError(productsRes.error.message)
      return
    }
    if (catalogRes.error) {
      showError(catalogRes.error.message)
      return
    }
    setProducts(productsRes.data || [])
    setCatalogItems(catalogRes.data || [])
  }, [showError])

  useEffect(() => {
    load()
  }, [load])

  const usedInByProductId = useMemo(
    () => bundleRefsByProductId(catalogItems),
    [catalogItems],
  )

  const filteredProducts = useMemo(() => {
    if (tab === 'hardware') {
      return products.filter((p) => normalizeProductKind(p) === PRODUCT_KIND.hardware)
    }
    if (tab === 'fees') {
      return products.filter((p) => normalizeProductKind(p) === PRODUCT_KIND.monthlyFee)
    }
    if (tab === 'usage') {
      return products.filter((p) => normalizeProductKind(p) === PRODUCT_KIND.usage)
    }
    return products
  }, [products, tab])

  function startEdit(p) {
    setEditingId(p.id)
    setDraft({
      name: p.name,
      unit_price: String(p.unit_price),
      active: p.active,
    })
  }

  function cancelEdit() {
    setEditingId(null)
    setDraft(null)
  }

  async function saveEdit(id) {
    if (!draft) return
    setBusyId(id)
    const { data, error: err } = await opsApi.updateProduct(id, draft)
    setBusyId(null)
    if (err) {
      showError(err.message)
      return
    }
    setProducts((prev) => prev.map((row) => (row.id === id ? { ...row, ...data } : row)))
    cancelEdit()
    showSuccess('Product updated.')
  }

  async function handleDeactivate(p) {
    const ok = await confirm({
      title: p.active ? 'Deactivate this SKU?' : 'Activate this SKU?',
      message: p.active
        ? `${p.sku} will be hidden from new quotes and bundles. Existing documents are unchanged.`
        : `${p.sku} will be available again for quotes and bundles.`,
      confirmLabel: p.active ? 'Deactivate' : 'Activate',
    })
    if (!ok) return

    setBusyId(p.id)
    const { data, error: err } = await opsApi.updateProduct(p.id, { active: !p.active })
    setBusyId(null)
    if (err) {
      showError(err.message)
      return
    }
    setProducts((prev) => prev.map((row) => (row.id === p.id ? { ...row, ...data } : row)))
    showSuccess(p.active ? 'Product deactivated.' : 'Product activated.')
  }

  async function handleDelete(p) {
    const ok = await confirm({
      title: 'Delete product?',
      message: `Delete ${p.sku}? Only unused products can be deleted — otherwise deactivate instead.`,
      confirmLabel: 'Delete',
    })
    if (!ok) return

    setBusyId(p.id)
    const { error } = await opsApi.deleteProduct(p.id)
    setBusyId(null)
    if (error) {
      showError(error.message)
      return
    }
    setProducts((prev) => prev.filter((row) => row.id !== p.id))
    if (editingId === p.id) cancelEdit()
    showSuccess('Product deleted.')
  }

  function startNew(kind) {
    const resolvedKind =
      kind ||
      (tab === 'fees'
        ? PRODUCT_KIND.monthlyFee
        : tab === 'usage'
          ? PRODUCT_KIND.usage
          : PRODUCT_KIND.hardware)
    setNewProduct({
      ...emptyNewProduct,
      ...rowFromProductKind(resolvedKind),
    })
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
      message: `Create ${productKindLabel(newProduct.product_kind).toLowerCase()} SKU ${newProduct.sku.trim() || '(no SKU)'}? SKU and type cannot be changed later.`,
      confirmLabel: 'Add SKU',
    })
    if (!ok) return

    setCreating(true)
    const { data, error: err } = await opsApi.createProduct(newProduct)
    setCreating(false)
    if (err) {
      showError(err.message)
      return
    }
    setProducts((prev) =>
      [...prev, data].sort((a, b) => String(a.sku).localeCompare(String(b.sku))),
    )
    showSuccess('SKU added.')
    closeNew()
    setTab(tabForProductKind(normalizeProductKind(data)))
  }

  const showTypeColumn = tab === 'all'
  const showUsedInColumn = true
  const colSpan =
    (canManage ? 6 : 5) + (showTypeColumn ? 1 : 0) + (showUsedInColumn ? 1 : 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">SKUs &amp; pricing</h1>
          <p className="mt-1 text-sm text-ink-300">
            {canManage
              ? 'Internal product codes, prices, and stock rules. Clients never see these — they pick categories on the client catalog.'
              : 'View-only. These SKUs and prices are used when building quotes and invoices.'}
          </p>
        </div>
        {canManage && !showNew ? (
          <button type="button" onClick={() => startNew()} className={adminBtnPrimary}>
            New SKU
          </button>
        ) : null}
      </div>

      <CatalogExplainer>
        <p>
          <strong className="text-ink-100">Hardware trackers</strong> deduct from stock when an
          invoice is issued. <strong className="text-ink-100">Monthly fees</strong> recur on
          invoices and never touch inventory.{' '}
          <strong className="text-ink-100">Usage charges</strong> (e.g. roaming) are billed ad hoc
          when they occur — add them manually to invoices. Map hardware and monthly fees into
          bundles on <strong className="text-ink-100">What clients request</strong>.
        </p>
      </CatalogExplainer>

      {canManage && showNew ? (
        <form
          onSubmit={handleCreate}
          className="max-w-xl space-y-3 rounded-2xl border border-white/10 bg-ink-900/90 p-4 sm:p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">New SKU</h2>
            <button type="button" onClick={closeNew} className={adminBtnSecondary}>
              Close
            </button>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-xs uppercase tracking-wider text-ink-400">Product type</legend>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  setNewProduct((f) => ({ ...f, ...rowFromProductKind(PRODUCT_KIND.hardware) }))
                }
                className={
                  newProduct.product_kind === PRODUCT_KIND.hardware
                    ? adminBtnPrimary
                    : adminBtnSecondary
                }
              >
                Hardware tracker
              </button>
              <button
                type="button"
                onClick={() =>
                  setNewProduct((f) => ({ ...f, ...rowFromProductKind(PRODUCT_KIND.monthlyFee) }))
                }
                className={
                  newProduct.product_kind === PRODUCT_KIND.monthlyFee
                    ? adminBtnPrimary
                    : adminBtnSecondary
                }
              >
                Monthly fee
              </button>
              <button
                type="button"
                onClick={() =>
                  setNewProduct((f) => ({ ...f, ...rowFromProductKind(PRODUCT_KIND.usage) }))
                }
                className={
                  newProduct.product_kind === PRODUCT_KIND.usage
                    ? adminBtnPrimary
                    : adminBtnSecondary
                }
              >
                Usage charge
              </button>
            </div>
            <p className="text-xs text-ink-500">
              Type is fixed after creation. Hardware affects stock; monthly fees drive recurring
              billing; usage charges (e.g. cross-border roaming) are billed daily as they occur.
            </p>
          </fieldset>
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
          <label className="inline-flex items-center gap-2 text-sm text-ink-300">
            <input
              type="checkbox"
              checked={newProduct.active}
              onChange={(e) => setNewProduct((f) => ({ ...f, active: e.target.checked }))}
            />
            Active
          </label>
          <button type="submit" disabled={creating} className={adminBtnPrimary}>
            {creating ? 'Adding…' : 'Add SKU'}
          </button>
        </form>
      ) : null}

      <div className="inline-flex rounded-xl border border-white/10 bg-ink-900 p-0.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              tab === t.id
                ? 'bg-brand-500 text-ink-950'
                : 'text-ink-300 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={adminTableShellClass}>
        <table className={adminTableClass}>
          <thead className="bg-ink-900/80 text-xs uppercase tracking-wider text-ink-400">
            <tr>
              <th className={`px-4 py-3 ${adminColSecondary}`}>SKU</th>
              <th className="px-4 py-3">Name</th>
              {showTypeColumn ? <th className="px-4 py-3">Type</th> : null}
              <th className="px-4 py-3">Price</th>
              <th className={`px-4 py-3 ${adminColSecondary}`}>Used in</th>
              <th className={`px-4 py-3 ${adminColSecondary}`}>Active</th>
              {canManage ? <th className="px-4 py-3 text-right">Actions</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              <tr>
                <td colSpan={colSpan} className="px-4 py-6 text-ink-400">
                  Loading…
                </td>
              </tr>
            ) : filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="px-4 py-6 text-ink-400">
                  {tab === 'hardware'
                    ? 'No hardware trackers yet.'
                    : tab === 'fees'
                      ? 'No monthly fees yet.'
                      : tab === 'usage'
                        ? 'No usage charges yet.'
                        : 'No products yet.'}
                </td>
              </tr>
            ) : (
              filteredProducts.map((p) => {
                const editing = canManage && editingId === p.id
                const busy = busyId === p.id

                if (editing && draft) {
                  return (
                    <tr key={p.id} className="bg-ink-900/30 align-top">
                      <td className={`px-4 py-3 font-mono text-xs text-ink-300 ${adminColSecondary}`}>
                        {p.sku}
                      </td>
                      <td className="px-4 py-3">
                        <input
                          className={adminFieldClass}
                          value={draft.name}
                          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                          autoFocus
                        />
                      </td>
                      {showTypeColumn ? (
                        <td className="px-4 py-3">{kindBadge(p)}</td>
                      ) : null}
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className={`${adminFieldClass} max-w-[8rem]`}
                          value={draft.unit_price}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, unit_price: e.target.value }))
                          }
                        />
                      </td>
                      <td className={`px-4 py-3 ${adminColSecondary}`}>
                        <UsedInCell
                          productId={p.id}
                          usedInByProductId={usedInByProductId}
                        />
                      </td>
                      <td className={`px-4 py-3 ${adminColSecondary}`}>
                        <label className="inline-flex items-center gap-2 text-ink-300">
                          <input
                            type="checkbox"
                            checked={Boolean(draft.active)}
                            onChange={(e) =>
                              setDraft((d) => ({ ...d, active: e.target.checked }))
                            }
                          />
                          {draft.active ? 'Yes' : 'No'}
                        </label>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center justify-end gap-0.5">
                          <IconAction
                            label="Save"
                            disabled={busy || !draft.name.trim()}
                            onClick={() => saveEdit(p.id)}
                          >
                            <ActionIcon d={ICONS.check} />
                          </IconAction>
                          <IconAction
                            label="Cancel"
                            tone="muted"
                            disabled={busy}
                            onClick={cancelEdit}
                          >
                            <ActionIcon d={ICONS.x} />
                          </IconAction>
                        </div>
                      </td>
                    </tr>
                  )
                }

                return (
                  <tr
                    key={p.id}
                    className={`bg-ink-900/20 ${p.active ? '' : 'opacity-50'}`}
                  >
                    <td className={`px-4 py-3 font-mono text-xs text-ink-300 ${adminColSecondary}`}>
                      {p.sku}
                    </td>
                    <td className="min-w-0 break-words px-4 py-3 text-ink-200">{p.name}</td>
                    {showTypeColumn ? (
                      <td className="px-4 py-3">{kindBadge(p)}</td>
                    ) : null}
                    <td className="px-4 py-3 text-ink-100">
                      {formatPula(p.unit_price)}
                      <span className="text-ink-400">{productKindPriceSuffix(p)}</span>
                    </td>
                    <td className={`px-4 py-3 ${adminColSecondary}`}>
                      <UsedInCell
                        productId={p.id}
                        usedInByProductId={usedInByProductId}
                      />
                    </td>
                    <td className={`px-4 py-3 text-ink-300 ${adminColSecondary}`}>
                      {p.active ? 'Yes' : 'No'}
                    </td>
                    {canManage ? (
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center justify-end gap-0.5">
                          <IconAction
                            label="Edit"
                            disabled={busy || Boolean(editingId)}
                            onClick={() => startEdit(p)}
                          >
                            <ActionIcon d={ICONS.pencil} />
                          </IconAction>
                          <IconAction
                            label={p.active ? 'Deactivate' : 'Activate'}
                            tone="muted"
                            disabled={busy || Boolean(editingId)}
                            onClick={() => handleDeactivate(p)}
                          >
                            <ActionIcon d={p.active ? ICONS.x : ICONS.check} />
                          </IconAction>
                          <IconAction
                            label="Delete"
                            tone="danger"
                            disabled={busy || Boolean(editingId)}
                            onClick={() => handleDelete(p)}
                          >
                            <ActionIcon d={ICONS.trash} />
                          </IconAction>
                        </div>
                      </td>
                    ) : null}
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
