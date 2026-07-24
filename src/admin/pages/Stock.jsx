import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from 'react'
import { opsApi } from '../../lib/opsApi'
import { PAYMENT_METHODS,
  paymentMethodLabel } from '../../lib/payments'
import { useOpsAlert } from '../OpsAlertContext'
import { AdminIconAction } from '../AdminIconAction'
import { YearMonthDaySelect } from '../../components/YearMonthDaySelect'
import {
  adminBtnPrimary,
  adminBtnSecondary,
  adminFieldClass,
  activateRowKey,
  clickableDocClass,
  clickableRowClass,
  formatPula,
  adminTableShellClass,
  adminTableShellSmClass,
  adminTableClass,
  adminColSecondary,
  adminCellPad,
} from '../ui'

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function emptyPoForm() {
  return {
    purchase_date: todayIso(),
    supplier: '',
    amount: '',
    method: 'eft',
    reference: '',
    notes: '',
    lines: [{ product_id: '', quantity_ordered: '' }],
  }
}

function lineRemaining(line) {
  return Math.max(0, Number(line.quantity_ordered) - Number(line.quantity_received))
}

function poStatusLabel(status) {
  if (status === 'open') return 'Open'
  if (status === 'closed') return 'Fully received'
  if (status === 'cancelled') return 'Cancelled'
  return status || '—'
}

function productLabel(line) {
  const p = line.products
  if (Array.isArray(p)) return p[0] ? `${p[0].sku} — ${p[0].name}` : '—'
  if (p) return `${p.sku} — ${p.name}`
  return '—'
}

function receiptLineLabel(line, poLines) {
  if (line.products) return productLabel(line)
  const poLine = (poLines || []).find((l) => l.id === line.purchase_order_line_id)
  return poLine ? productLabel(poLine) : '—'
}

function maxEditableQty(receiptLine, poLines) {
  const poLine = (poLines || []).find((l) => l.id === receiptLine.purchase_order_line_id)
  if (!poLine) return Number(receiptLine.quantity) || 0
  const oldQty = Number(receiptLine.quantity) || 0
  const remainingExcludingThis =
    Number(poLine.quantity_ordered) - (Number(poLine.quantity_received) - oldQty)
  return Math.max(0, remainingExcludingThis)
}

function ChevronIcon({ open }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      className={`mt-0.5 h-4 w-4 shrink-0 text-ink-400 transition-transform duration-300 ease-in-out ${
        open ? 'rotate-90' : 'rotate-0'
      }`}
    >
      <path
        fillRule="evenodd"
        d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function CollapsiblePanel({ open, onToggle, title, description, headerEnd, children }) {
  const panelId = useId()

  return (
    <section className="space-y-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
        >
          <ChevronIcon open={open} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-white">{title}</span>
            {description ? (
              <span className="mt-0.5 block text-xs text-ink-400">{description}</span>
            ) : null}
          </span>
        </button>
        {headerEnd}
      </div>
      <div
        id={panelId}
        aria-hidden={!open}
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="min-w-0 overflow-hidden">
          <div className={`space-y-3 pt-3 ${open ? '' : 'pointer-events-none'}`}>{children}</div>
        </div>
      </div>
    </section>
  )
}

export default function StockPage() {
  const { showError, showSuccess, confirm } = useOpsAlert()
  const [levels, setLevels] = useState([])
  const [stockProducts, setStockProducts] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [view, setView] = useState('list') // list | newPo | detail
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)

  const [poForm, setPoForm] = useState(emptyPoForm)
  const [receiveDate, setReceiveDate] = useState(todayIso)
  const [receiveNotes, setReceiveNotes] = useState('')
  const [receiveQty, setReceiveQty] = useState({})
  const [editingReceiptId, setEditingReceiptId] = useState(null)
  const [editDate, setEditDate] = useState(todayIso)
  const [editNotes, setEditNotes] = useState('')
  const [editQty, setEditQty] = useState({})

  const [adjProductId, setAdjProductId] = useState('')
  const [adjQty, setAdjQty] = useState('')
  const [adjNote, setAdjNote] = useState('')
  const [adjustments, setAdjustments] = useState([])
  const [poSectionOpen, setPoSectionOpen] = useState(false)
  const [adjSectionOpen, setAdjSectionOpen] = useState(false)
  const [manualAdjOpen, setManualAdjOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [levelsRes, productsRes, ordersRes, adjRes] = await Promise.all([
      opsApi.getStockLevels(),
      opsApi.listProducts({ activeOnly: true }),
      opsApi.listPurchaseOrders(),
      opsApi.listStockAdjustments(),
    ])
    setLoading(false)

    if (levelsRes.error) {
      showError(levelsRes.error.message)
      return
    }
    if (productsRes.error) showError(productsRes.error.message)
    if (ordersRes.error) showError(ordersRes.error.message)
    if (adjRes.error) showError(adjRes.error.message)

    const lv = levelsRes.data || []
    setLevels(lv)
    setStockProducts((productsRes.data || []).filter((p) => p.tracks_stock))
    setOrders(ordersRes.data || [])
    setAdjustments(adjRes.data || [])
    setAdjProductId((prev) => prev || lv[0]?.product_id || '')
  }, [showError])

  useEffect(() => {
    load()
  }, [load])

  const openOrders = useMemo(
    () => (orders || []).filter((o) => o.status === 'open'),
    [orders],
  )

  async function openDetail(id) {
    const { data, error } = await opsApi.getPurchaseOrder(id)
    if (error) {
      showError(error.message)
      return
    }
    setDetail(data)
    setSelectedId(id)
    setView('detail')
    setReceiveDate(todayIso())
    setReceiveNotes('')
    const qty = {}
    for (const line of data.purchase_order_lines || []) {
      qty[line.id] = ''
    }
    setReceiveQty(qty)
    setEditingReceiptId(null)
    setEditQty({})
  }

  function startNewPo() {
    const first = stockProducts[0]?.id || ''
    setPoForm({
      ...emptyPoForm(),
      lines: [{ product_id: first, quantity_ordered: '' }],
    })
    setView('newPo')
    setSelectedId(null)
    setDetail(null)
  }

  function backToList() {
    setView('list')
    setSelectedId(null)
    setDetail(null)
  }

  async function handleCreatePo(e) {
    e.preventDefault()
    const ok = await confirm({
      title: 'Save purchase order?',
      message:
        'This records money leaving the account for stock. Shelf counts will increase when you receive deliveries.',
      confirmLabel: 'Save purchase order',
    })
    if (!ok) return

    setSaving(true)
    const { data, error } = await opsApi.createPurchaseOrder(poForm)
    setSaving(false)
    if (error) {
      showError(error.message)
      return
    }
    showSuccess(`Purchase order ${data.po_number} saved.`)
    setOrders((prev) => [data, ...prev.filter((o) => o.id !== data.id)])
    await openDetail(data.id)
    const levelsRes = await opsApi.getStockLevels()
    if (!levelsRes.error) setLevels(levelsRes.data || [])
  }

  async function handleReceive(e) {
    e.preventDefault()
    if (!detail) return

    const lines = Object.entries(receiveQty)
      .map(([purchase_order_line_id, quantity]) => ({
        purchase_order_line_id,
        quantity,
      }))
      .filter((l) => Number(l.quantity) > 0)

    const ok = await confirm({
      title: 'Record delivery?',
      message: 'On-hand stock will increase by the quantities you enter.',
      confirmLabel: 'Receive stock',
    })
    if (!ok) return

    setSaving(true)
    const { data, error } = await opsApi.receivePurchaseOrder({
      purchase_order_id: detail.id,
      received_date: receiveDate,
      notes: receiveNotes,
      lines,
    })
    setSaving(false)
    if (error) {
      showError(error.message)
      return
    }

    showSuccess(
      data.status === 'closed'
        ? 'Delivery recorded — purchase order fully received.'
        : 'Delivery recorded.',
    )
    setDetail(data)
    setOrders((prev) => prev.map((o) => (o.id === data.id ? { ...o, ...data } : o)))
    setReceiveQty((prev) => {
      const next = { ...prev }
      for (const key of Object.keys(next)) next[key] = ''
      return next
    })
    setReceiveNotes('')
    const levelsRes = await opsApi.getStockLevels()
    if (!levelsRes.error) setLevels(levelsRes.data || [])
  }

  function startEditReceipt(receipt) {
    setEditingReceiptId(receipt.id)
    setEditDate(receipt.received_date || todayIso())
    setEditNotes(receipt.notes || '')
    const qty = {}
    for (const line of receipt.purchase_receipt_lines || []) {
      qty[line.id] = String(line.quantity)
    }
    setEditQty(qty)
  }

  function cancelEditReceipt() {
    setEditingReceiptId(null)
    setEditDate(todayIso())
    setEditNotes('')
    setEditQty({})
  }

  async function refreshAfterReceiptChange(data) {
    setDetail(data)
    setOrders((prev) => prev.map((o) => (o.id === data.id ? { ...o, ...data } : o)))
    cancelEditReceipt()
    const levelsRes = await opsApi.getStockLevels()
    if (!levelsRes.error) setLevels(levelsRes.data || [])
  }

  async function handleSaveReceiptEdit(e) {
    e.preventDefault()
    if (!editingReceiptId) return
    const receipt = (detail?.purchase_receipts || []).find((r) => r.id === editingReceiptId)
    if (!receipt) return

    const lines = (receipt.purchase_receipt_lines || []).map((line) => ({
      id: line.id,
      purchase_order_line_id: line.purchase_order_line_id,
      quantity: editQty[line.id] ?? 0,
    }))

    const ok = await confirm({
      title: 'Save delivery changes?',
      message: 'Stock on hand and outstanding PO quantities will be updated.',
      confirmLabel: 'Save',
    })
    if (!ok) return

    setSaving(true)
    const { data, error } = await opsApi.updatePurchaseReceipt({
      id: editingReceiptId,
      received_date: editDate,
      notes: editNotes,
      lines,
    })
    setSaving(false)
    if (error) {
      showError(error.message)
      return
    }
    showSuccess('Delivery updated.')
    await refreshAfterReceiptChange(data)
  }

  async function handleCancelReceipt(receipt) {
    const ok = await confirm({
      title: 'Cancel this delivery?',
      message:
        'Stock counts will go down by the quantities on this delivery, if on-hand stock allows it. The purchase order will reopen if anything is still outstanding.',
      confirmLabel: 'Cancel delivery',
    })
    if (!ok) return

    setSaving(true)
    const { data, error } = await opsApi.cancelPurchaseReceipt(receipt.id)
    setSaving(false)
    if (error) {
      showError(error.message)
      return
    }
    showSuccess('Delivery cancelled.')
    await refreshAfterReceiptChange(data)
  }

  async function handleAdjust(e) {
    e.preventDefault()
    setSaving(true)
    const { error: err } = await opsApi.adjustStock({
      productId: adjProductId,
      quantityDelta: Number(adjQty),
      note: adjNote,
    })
    setSaving(false)
    if (err) {
      showError(err.message)
      return
    }
    showSuccess('Stock adjustment saved.')
    setAdjQty('')
    setAdjNote('')
    const [levelsRes, adjRes] = await Promise.all([
      opsApi.getStockLevels(),
      opsApi.listStockAdjustments(),
    ])
    if (!levelsRes.error) setLevels(levelsRes.data || [])
    if (!adjRes.error) setAdjustments(adjRes.data || [])
  }

  if (loading && levels.length === 0 && orders.length === 0) {
    return <p className="text-sm text-ink-400">Loading stock…</p>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Stock</h1>
          <p className="mt-1 text-sm text-ink-300">
            On-hand levels, purchase orders (money out for stock), and deliveries that bump counts.
          </p>
        </div>
        {view !== 'list' ? (
          <button type="button" onClick={backToList} className={adminBtnSecondary}>
            Back to stock
          </button>
        ) : null}
      </div>

      {view === 'list' ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {levels.map((row) => (
              <div
                key={row.product_id}
                className="rounded-2xl border border-white/10 bg-ink-900/50 p-4"
              >
                <p className="font-mono text-xs text-ink-400">{row.sku}</p>
                <p className="mt-1 text-sm text-ink-200">{row.name}</p>
                <p className="mt-3 font-display text-3xl font-bold text-white">{row.on_hand}</p>
                <p className="text-xs text-ink-500">on hand</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-white/10 bg-ink-900/40 p-4 sm:p-5">
            <CollapsiblePanel
              open={poSectionOpen}
              onToggle={() => setPoSectionOpen((v) => !v)}
              title="Purchase orders"
              description={
                <>
                  Save when money leaves the account. Receive deliveries to update shelf counts.
                  {openOrders.length ? ` ${openOrders.length} open.` : ''}
                </>
              }
              headerEnd={
                <button type="button" onClick={startNewPo} className={adminBtnPrimary}>
                  New purchase order
                </button>
              }
            >
              <div className={adminTableShellClass}>
                <table className={adminTableClass}>
                  <thead className="border-b border-white/10 bg-ink-900/80 text-xs uppercase tracking-wider text-ink-400">
                    <tr>
                      <th className={adminCellPad}>PO</th>
                      <th className={`${adminCellPad} ${adminColSecondary}`}>Paid date</th>
                      <th className={`${adminCellPad} ${adminColSecondary}`}>Supplier</th>
                      <th className={`${adminCellPad} text-right`}>Amount</th>
                      <th className={`${adminCellPad} ${adminColSecondary}`}>Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {orders.length === 0 ? (
                      <tr>
                        <td colSpan={5} className={`${adminCellPad} text-ink-400`}>
                          No purchase orders yet. Create one when you pay for stock.
                        </td>
                      </tr>
                    ) : (
                      orders.map((row) => {
                        const open = () => openDetail(row.id)
                        return (
                          <tr
                            key={row.id}
                            role="link"
                            tabIndex={0}
                            className={`group bg-ink-900/20 ${clickableRowClass}`}
                            onClick={open}
                            onKeyDown={(e) => activateRowKey(e, open)}
                          >
                            <td className={adminCellPad}>
                              <span className={clickableDocClass}>{row.po_number}</span>
                            </td>
                            <td className={`${adminCellPad} ${adminColSecondary} text-ink-300`}>
                              {row.purchase_date}
                            </td>
                            <td className={`${adminCellPad} ${adminColSecondary} text-ink-300`}>
                              {row.supplier || '—'}
                            </td>
                            <td className={`${adminCellPad} text-right font-medium text-ink-100`}>
                              {formatPula(row.amount)}
                            </td>
                            <td className={`${adminCellPad} ${adminColSecondary} text-ink-300`}>
                              {poStatusLabel(row.status)}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </CollapsiblePanel>
          </div>

          <div className="rounded-2xl border border-white/10 bg-ink-900/40 p-4 sm:p-5">
            <CollapsiblePanel
              open={adjSectionOpen}
              onToggle={() => setAdjSectionOpen((v) => !v)}
              title="Adjustments"
              description="Correction history (damage, count fixes). Normal buys use a purchase order."
            >
              <div className={adminTableShellClass}>
                <table className={adminTableClass}>
                  <thead className="border-b border-white/10 bg-ink-900/80 text-xs uppercase tracking-wider text-ink-400">
                    <tr>
                      <th className={adminCellPad}>Date</th>
                      <th className={`${adminCellPad} ${adminColSecondary}`}>Product</th>
                      <th className={adminCellPad}>Name</th>
                      <th className={`${adminCellPad} text-right`}>Qty</th>
                      <th className={`${adminCellPad} ${adminColSecondary}`}>Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {adjustments.length === 0 ? (
                      <tr>
                        <td colSpan={5} className={`${adminCellPad} text-ink-400`}>
                          No adjustments yet.
                        </td>
                      </tr>
                    ) : (
                      adjustments.map((row) => {
                        const p = Array.isArray(row.products) ? row.products[0] : row.products
                        const delta = Number(row.quantity_delta) || 0
                        const when = row.created_at
                          ? new Date(row.created_at).toLocaleString(undefined, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'
                        return (
                          <tr key={row.id} className="bg-ink-900/20">
                            <td className={`${adminCellPad} text-ink-300`}>{when}</td>
                            <td className={`${adminCellPad} ${adminColSecondary} font-mono text-ink-200`}>
                              {p?.sku || '—'}
                            </td>
                            <td className={`${adminCellPad} min-w-0 break-words text-ink-300`}>
                              {p?.name || '—'}
                            </td>
                            <td
                              className={`${adminCellPad} text-right font-medium tabular-nums ${
                                delta > 0
                                  ? 'text-emerald-400'
                                  : delta < 0
                                    ? 'text-red-400'
                                    : 'text-ink-100'
                              }`}
                            >
                              {delta > 0 ? `+${delta}` : String(delta)}
                            </td>
                            <td className={`${adminCellPad} ${adminColSecondary} text-ink-400`}>
                              {row.note || '—'}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="rounded-xl border border-white/10 bg-ink-950/40 p-3 sm:p-4">
                <CollapsiblePanel
                  open={manualAdjOpen}
                  onToggle={() => setManualAdjOpen((v) => !v)}
                  title="Manual adjustment"
                  description="Apply a one-off quantity change. Does not create a purchase order."
                >
                  <form onSubmit={handleAdjust} className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <label className="block">
                        <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                          Product
                        </span>
                        <select
                          className={adminFieldClass}
                          value={adjProductId}
                          onChange={(e) => setAdjProductId(e.target.value)}
                          required={manualAdjOpen}
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
                          Qty (+ / −)
                        </span>
                        <input
                          required={manualAdjOpen}
                          type="number"
                          step="1"
                          className={adminFieldClass}
                          value={adjQty}
                          onChange={(e) => setAdjQty(e.target.value)}
                          placeholder="e.g. 10 or -2"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                          Note
                        </span>
                        <input
                          className={adminFieldClass}
                          value={adjNote}
                          onChange={(e) => setAdjNote(e.target.value)}
                          placeholder="Optional"
                        />
                      </label>
                    </div>
                    <button type="submit" disabled={saving} className={adminBtnPrimary}>
                      {saving ? 'Saving…' : 'Apply adjustment'}
                    </button>
                  </form>
                </CollapsiblePanel>
              </div>
            </CollapsiblePanel>
          </div>
        </>
      ) : null}

      {view === 'newPo' ? (
        <form
          onSubmit={handleCreatePo}
          className="max-w-2xl space-y-4 rounded-2xl border border-white/10 bg-ink-900/40 p-4 sm:p-5"
        >
          <div>
            <h2 className="text-sm font-semibold text-white">New purchase order</h2>
            <p className="mt-0.5 text-xs text-ink-400">
              Date should match when money left the account. Stock counts update when you receive.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                Paid date
              </span>
              <YearMonthDaySelect
                value={poForm.purchase_date}
                onChange={(v) => setPoForm((f) => ({ ...f, purchase_date: v }))}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                Supplier
              </span>
              <input
                className={adminFieldClass}
                value={poForm.supplier}
                onChange={(e) => setPoForm((f) => ({ ...f, supplier: e.target.value }))}
                placeholder="Optional"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                Amount paid
              </span>
              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                className={adminFieldClass}
                value={poForm.amount}
                onChange={(e) => setPoForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                Method
              </span>
              <select
                className={adminFieldClass}
                value={poForm.method}
                onChange={(e) => setPoForm((f) => ({ ...f, method: e.target.value }))}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                Reference
              </span>
              <input
                className={adminFieldClass}
                value={poForm.reference}
                onChange={(e) => setPoForm((f) => ({ ...f, reference: e.target.value }))}
                placeholder="Bank ref / invoice #"
              />
            </label>
          </div>

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-ink-400">Products ordered</p>
            {poForm.lines.map((line, idx) => (
              <div key={idx} className="flex flex-wrap items-end gap-2">
                <label className="block min-w-0 flex-1 basis-full sm:basis-auto sm:min-w-[12rem]">
                  <span className="mb-1 block text-xs text-ink-500">Product</span>
                  <select
                    required
                    className={adminFieldClass}
                    value={line.product_id}
                    onChange={(e) =>
                      setPoForm((f) => {
                        const lines = [...f.lines]
                        lines[idx] = { ...lines[idx], product_id: e.target.value }
                        return { ...f, lines }
                      })
                    }
                  >
                    <option value="">Select…</option>
                    {stockProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.sku} — {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block w-full max-w-[7rem]">
                  <span className="mb-1 block text-xs text-ink-500">Qty</span>
                  <input
                    required
                    type="number"
                    min="1"
                    step="1"
                    className={adminFieldClass}
                    value={line.quantity_ordered}
                    onChange={(e) =>
                      setPoForm((f) => {
                        const lines = [...f.lines]
                        lines[idx] = { ...lines[idx], quantity_ordered: e.target.value }
                        return { ...f, lines }
                      })
                    }
                  />
                </label>
                {poForm.lines.length > 1 ? (
                  <button
                    type="button"
                    className="mb-0.5 text-xs font-semibold text-red-400 hover:text-red-300"
                    onClick={() =>
                      setPoForm((f) => ({
                        ...f,
                        lines: f.lines.filter((_, i) => i !== idx),
                      }))
                    }
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            ))}
            <button
              type="button"
              className="text-xs font-semibold text-brand-400 hover:text-brand-300"
              onClick={() =>
                setPoForm((f) => ({
                  ...f,
                  lines: [
                    ...f.lines,
                    { product_id: stockProducts[0]?.id || '', quantity_ordered: '' },
                  ],
                }))
              }
            >
              + Add line
            </button>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">Notes</span>
            <textarea
              rows={2}
              className={`${adminFieldClass} resize-y`}
              value={poForm.notes}
              onChange={(e) => setPoForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </label>

          <button type="submit" disabled={saving} className={adminBtnPrimary}>
            {saving ? 'Saving…' : 'Save purchase order'}
          </button>
        </form>
      ) : null}

      {view === 'detail' && detail ? (
        <div className="max-w-2xl space-y-5">
          <div className="rounded-2xl border border-white/10 bg-ink-900/40 p-4 sm:p-5">
            <p className="font-mono text-xs text-ink-400">{detail.po_number}</p>
            <h2 className="mt-1 font-display text-xl font-bold text-white">
              {formatPula(detail.amount)}
            </h2>
            <p className="mt-1 text-sm text-ink-300">
              Paid {detail.purchase_date}
              {detail.supplier ? ` · ${detail.supplier}` : ''}
              {' · '}
              {paymentMethodLabel(detail.method)}
              {' · '}
              {poStatusLabel(detail.status)}
            </p>
            {detail.reference ? (
              <p className="mt-1 text-xs text-ink-500">Ref: {detail.reference}</p>
            ) : null}
            {detail.notes ? (
              <p className="mt-2 text-sm text-ink-400">{detail.notes}</p>
            ) : null}

            <div className={`mt-4 ${adminTableShellSmClass}`}>
              <table className={adminTableClass}>
                <thead className="border-b border-white/10 text-xs uppercase tracking-wider text-ink-400">
                  <tr>
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2 text-right">Ordered</th>
                    <th className={`px-3 py-2 text-right ${adminColSecondary}`}>Received</th>
                    <th className="px-3 py-2 text-right">Left</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {(detail.purchase_order_lines || []).map((line) => (
                    <tr key={line.id}>
                      <td className="min-w-0 break-words px-3 py-2 text-ink-200">
                        {productLabel(line)}
                      </td>
                      <td className="px-3 py-2 text-right text-ink-300">
                        {line.quantity_ordered}
                      </td>
                      <td className={`px-3 py-2 text-right text-ink-300 ${adminColSecondary}`}>
                        {line.quantity_received}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-ink-100">
                        {lineRemaining(line)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {detail.status === 'open' ? (
            <form
              onSubmit={handleReceive}
              className="space-y-4 rounded-2xl border border-white/10 bg-ink-900/40 p-4 sm:p-5"
            >
              <div>
                <h3 className="text-sm font-semibold text-white">Receive delivery</h3>
                <p className="mt-0.5 text-xs text-ink-400">
                  Enter quantities arriving today (or pick the delivery date). Partial OK.
                </p>
              </div>

              <label className="block">
                <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                  Received date
                </span>
                <YearMonthDaySelect value={receiveDate} onChange={setReceiveDate} />
              </label>

              <div className="space-y-2">
                {(detail.purchase_order_lines || []).map((line) => {
                  const left = lineRemaining(line)
                  if (left <= 0) return null
                  return (
                    <div
                      key={line.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-ink-200">{productLabel(line)}</p>
                        <p className="text-xs text-ink-500">{left} outstanding</p>
                      </div>
                      <input
                        type="number"
                        min="0"
                        max={left}
                        step="1"
                        className={`${adminFieldClass} w-24`}
                        value={receiveQty[line.id] ?? ''}
                        onChange={(e) =>
                          setReceiveQty((q) => ({ ...q, [line.id]: e.target.value }))
                        }
                        placeholder="0"
                      />
                    </div>
                  )
                })}
              </div>

              <label className="block">
                <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                  Delivery notes
                </span>
                <input
                  className={adminFieldClass}
                  value={receiveNotes}
                  onChange={(e) => setReceiveNotes(e.target.value)}
                  placeholder="Optional"
                />
              </label>

              <button type="submit" disabled={saving} className={adminBtnPrimary}>
                {saving ? 'Saving…' : 'Record delivery'}
              </button>
            </form>
          ) : null}

          {(detail.purchase_receipts || []).length > 0 ? (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-white">Delivery history</h3>
              <ul className="divide-y divide-white/10 rounded-2xl border border-white/10">
                {detail.purchase_receipts.map((r) => {
                  const lines = r.purchase_receipt_lines || []
                  const editing = editingReceiptId === r.id

                  if (editing) {
                    return (
                      <li key={r.id} className="px-4 py-3">
                        <form onSubmit={handleSaveReceiptEdit} className="space-y-3">
                          <label className="block">
                            <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                              Received date
                            </span>
                            <YearMonthDaySelect value={editDate} onChange={setEditDate} />
                          </label>
                          <div className="space-y-2">
                            {lines.map((line) => {
                              const max = maxEditableQty(line, detail.purchase_order_lines)
                              return (
                                <div
                                  key={line.id}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 px-3 py-2"
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm text-ink-200">
                                      {receiptLineLabel(line, detail.purchase_order_lines)}
                                    </p>
                                    <p className="text-xs text-ink-500">Max {max}</p>
                                  </div>
                                  <input
                                    type="number"
                                    min="0"
                                    max={max}
                                    step="1"
                                    className={`${adminFieldClass} w-24`}
                                    value={editQty[line.id] ?? ''}
                                    onChange={(e) =>
                                      setEditQty((q) => ({ ...q, [line.id]: e.target.value }))
                                    }
                                  />
                                </div>
                              )
                            })}
                          </div>
                          <label className="block">
                            <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                              Notes
                            </span>
                            <input
                              className={adminFieldClass}
                              value={editNotes}
                              onChange={(e) => setEditNotes(e.target.value)}
                            />
                          </label>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="submit"
                              disabled={saving}
                              className={adminBtnPrimary}
                            >
                              {saving ? 'Saving…' : 'Save delivery'}
                            </button>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={cancelEditReceipt}
                              className={adminBtnSecondary}
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      </li>
                    )
                  }

                  return (
                    <li key={r.id} className="px-4 py-3 text-sm">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-ink-200">{r.received_date}</p>
                          {r.notes ? (
                            <p className="mt-0.5 text-xs text-ink-500">{r.notes}</p>
                          ) : null}
                          <ul className="mt-2 space-y-1">
                            {lines.length === 0 ? (
                              <li className="text-xs text-ink-500">No line items</li>
                            ) : (
                              lines.map((line) => (
                                <li
                                  key={line.id}
                                  className="flex flex-wrap items-baseline justify-between gap-2 text-ink-300"
                                >
                                  <span>
                                    {receiptLineLabel(line, detail.purchase_order_lines)}
                                  </span>
                                  <span className="font-medium text-ink-100">
                                    × {line.quantity}
                                  </span>
                                </li>
                              ))
                            )}
                          </ul>
                        </div>
                        <div className="flex items-center gap-0.5">
                          <AdminIconAction
                            label="Edit delivery"
                            icon="pencil"
                            disabled={saving || Boolean(editingReceiptId)}
                            onClick={() => startEditReceipt(r)}
                          />
                          <AdminIconAction
                            label="Cancel delivery"
                            icon="x"
                            tone="danger"
                            disabled={saving || Boolean(editingReceiptId)}
                            onClick={() => handleCancelReceipt(r)}
                          />
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
