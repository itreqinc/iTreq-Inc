import {
  useCallback,
  useEffect,
  useMemo,
  useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { YearMonthDaySelect } from '../../components/YearMonthDaySelect'
import { DateRangeFilter } from '../../components/DateRangeFilter'
import {
  currentMonthStartIso,
  documentFilterDate,
  filterByDateRange,
  todayIso,
} from '../../lib/dateRange'
import { opsApi } from '../../lib/opsApi'
import { emptyLine,
  mapDocLinesForEditor } from '../../lib/billing'
import { invoiceBalanceDue,
  invoiceDisplayStatus } from '../../lib/payments'
import { LineItemsEditor } from '../LineItemsEditor'
import { BillingDocumentButtons } from '../BillingDocumentButtons'
import { InvoiceQueryThread } from '../../components/InvoiceQueryThread'
import { useOpsAlert } from '../OpsAlertContext'
import { adminBtnDanger,
  adminBtnPrimary,
  adminBtnSecondary,
  adminFieldClass,
  activateRowKey,
  clickableDocClass,
  clickableRowClass,
  formatPula,
  adminTableClass,
  adminColSecondary,
} from '../ui'

function invoiceRowClass(status) {
  switch (status) {
    case 'draft':
      return 'bg-sky-500/10'
    case 'partial':
      return 'bg-amber-500/10'
    case 'overdue':
      return 'bg-red-500/10'
    case 'paid':
      return 'bg-emerald-500/10'
    case 'void':
      return 'bg-red-500/10 opacity-80'
    case 'due':
    default:
      return 'bg-ink-900/20'
  }
}

function invoiceStatusClass(status) {
  switch (status) {
    case 'draft':
      return 'bg-sky-500/20 text-sky-200'
    case 'partial':
      return 'bg-amber-500/20 text-amber-200'
    case 'overdue':
      return 'bg-red-500/20 text-red-300'
    case 'paid':
      return 'bg-emerald-500/20 text-emerald-200'
    case 'void':
      return 'bg-red-500/20 text-red-300 line-through'
    case 'due':
    default:
      return 'bg-white/10 text-ink-300'
  }
}

function snapshotInvoiceForm(form) {
  return JSON.stringify({
    client_id: form.client_id || '',
    issue_date: form.issue_date || '',
    due_date: form.due_date || '',
    notes: form.notes || '',
    discount_amount: String(form.discount_amount ?? 0),
    lines: (form.lines || []).map((l) => ({
      product_id: l.product_id || '',
      trackable_item_id: l.trackable_item_id || '',
      description: String(l.description || '').trim(),
      quantity: String(l.quantity ?? ''),
      unit_price: String(l.unit_price ?? ''),
    })),
  })
}

export default function InvoicesPage() {
  const [params, setParams] = useSearchParams()
  const { showError, showSuccess, confirm } = useOpsAlert()
  const [rows, setRows] = useState([])
  const [clients, setClients] = useState([])
  const [products, setProducts] = useState([])
  const [trackableItems, setTrackableItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [baseline, setBaseline] = useState('')
  const [accountCredit, setAccountCredit] = useState(0)
  const [taxRate, setTaxRate] = useState(0)
  const [dateFrom, setDateFrom] = useState(currentMonthStartIso)
  const [dateTo, setDateTo] = useState(todayIso)
  const [form, setForm] = useState({
    client_id: '',
    issue_date: '',
    due_date: '',
    notes: '',
    status: 'draft',
    number: '',
    total: 0,
    amount_paid: 0,
    discount_amount: 0,
    lines: [emptyLine()],
  })

  const load = useCallback(async () => {
    setLoading(true)
    const [inv, c, p, s, t] = await Promise.all([
      opsApi.listInvoices(),
      opsApi.listClients(),
      opsApi.listProducts({ activeOnly: true }),
      opsApi.getSettings(),
      opsApi.listTrackableItems({ withComponents: true }),
    ])
    setLoading(false)
    if (inv.error) {
      showError(inv.error.message)
      return
    }
    setRows(inv.data || [])
    setClients(c.data || [])
    setProducts(p.data || [])
    setTaxRate(Number(s.data?.default_tax_rate) || 0)
    if (t.error) showError(t.error.message)
    else setTrackableItems(t.data || [])
  }, [showError])

  useEffect(() => {
    load()
  }, [load])

  const openRow = useCallback(
    async (id) => {
      const { data, error: err } = await opsApi.getInvoice(id)
      if (err) {
        showError(err.message)
        return
      }

      let catalog = trackableItems
      if (!catalog.length) {
        const t = await opsApi.listTrackableItems({ withComponents: true })
        if (!t.error) {
          catalog = t.data || []
          setTrackableItems(catalog)
        }
      }

      const nextForm = {
        client_id: data.client_id,
        issue_date: data.issue_date || '',
        due_date: data.due_date || '',
        notes: data.notes || '',
        status: data.status,
        number: data.number || '',
        total: Number(data.total) || 0,
        amount_paid: Number(data.amount_paid) || 0,
        discount_amount: Number(data.discount_amount) || 0,
        lines: mapDocLinesForEditor(data.lines, catalog),
      }
      setEditingId(id)
      setForm(nextForm)
      setBaseline(snapshotInvoiceForm(nextForm))
      setShowForm(true)

      if (['issued', 'partial', 'paid'].includes(data.status) && data.client_id) {
        const creditRes = await opsApi.getClientCreditBalance(data.client_id)
        setAccountCredit(creditRes.data?.balance ?? 0)
      } else {
        setAccountCredit(0)
      }
    },
    [showError, trackableItems],
  )

  useEffect(() => {
    const openId = params.get('open')
    if (openId) {
      openRow(openId).then(() => {
        params.delete('open')
        setParams(params, { replace: true })
      })
      return
    }
    const clientId = params.get('client')
    if (clientId) {
      const nextForm = {
        client_id: clientId,
        issue_date: '',
        due_date: '',
        notes: '',
        status: 'draft',
        number: '',
        total: 0,
        amount_paid: 0,
        discount_amount: 0,
        lines: [emptyLine()],
      }
      setEditingId(null)
      setAccountCredit(0)
      setForm(nextForm)
      setBaseline(snapshotInvoiceForm(nextForm))
      setShowForm(true)
      params.delete('client')
      setParams(params, { replace: true })
    }
  }, [params, setParams, openRow])

  function startNew() {
    const nextForm = {
      client_id: '',
      issue_date: '',
      due_date: '',
      notes: '',
      status: 'draft',
      number: '',
      total: 0,
      amount_paid: 0,
      discount_amount: 0,
      lines: [emptyLine()],
    }
    setEditingId(null)
    setAccountCredit(0)
    setForm(nextForm)
    setBaseline(snapshotInvoiceForm(nextForm))
    setShowForm(true)
  }

  const balanceDue = useMemo(() => invoiceBalanceDue(form), [form])
  const canApplyCredit =
    editingId &&
    ['issued', 'partial'].includes(form.status) &&
    balanceDue > 0.001 &&
    accountCredit > 0.001
  const applyCreditAmount = Math.min(accountCredit, balanceDue)

  async function handleApplyCredit() {
    if (!editingId || !canApplyCredit) return
    const ok = await confirm({
      title: 'Apply account credit?',
      message: `Apply ${formatPula(applyCreditAmount)} from this client's account to invoice ${form.number || ''}?`,
      confirmLabel: 'Apply credit',
    })
    if (!ok) return

    setSaving(true)
    const applyRes = await opsApi.applyClientCreditToInvoice(editingId)
    setSaving(false)
    if (applyRes.error) {
      showError(applyRes.error.message)
      return
    }

    const reload = await opsApi.getInvoice(editingId)
    if (reload.error) {
      showError(reload.error.message)
      return
    }
    const data = reload.data
    setForm((f) => ({
      ...f,
      status: data.status,
      amount_paid: Number(data.amount_paid) || 0,
      total: Number(data.total) || 0,
      number: data.number || f.number,
    }))
    const creditRes = await opsApi.getClientCreditBalance(data.client_id)
    setAccountCredit(creditRes.data?.balance ?? 0)
    showSuccess(
      `${formatPula(applyRes.data.applied)} applied from account credit.`,
    )
    await load()
  }

  const isDirty = useMemo(
    () => snapshotInvoiceForm(form) !== baseline,
    [form, baseline],
  )

  const visibleRows = useMemo(
    () => filterByDateRange(rows, dateFrom, dateTo, documentFilterDate),
    [rows, dateFrom, dateTo],
  )

  const readOnly = form.status !== 'draft'
  /** New invoices always; existing drafts only after a change. */
  const canSaveDraft = !readOnly && (!editingId || isDirty)
  const canIssue =
    Boolean(editingId) && form.status === 'draft' && !isDirty && !saving
  const canVoid =
    Boolean(editingId) && form.status !== 'void' && !isDirty && !saving

  async function handleSave(e) {
    e.preventDefault()
    if (!canSaveDraft) return

    const ok = await confirm({
      title: editingId ? 'Save changes to this draft?' : 'Save this draft invoice?',
      message: editingId
        ? 'Your updates to this draft Invoice will be saved.'
        : 'This invoice will be saved as a draft.',
      confirmLabel: 'Save',
    })
    if (!ok) return

    setSaving(true)
    const { error: err } = await opsApi.saveInvoice({
      id: editingId,
      ...form,
    })
    setSaving(false)
    if (err) {
      showError(err.message)
      return
    }
    showSuccess('A draft Invoice has been saved.')
    setShowForm(false)
    setBaseline('')
    await load()
  }

  async function handleIssue() {
    if (!editingId) return
    if (isDirty) {
      showError('Please save your changes before issuing this invoice.')
      return
    }

    const creditRes = await opsApi.getClientCreditBalance(form.client_id)
    const accountCredit = creditRes.data?.balance ?? 0

    let issueMessage =
      'Issuing assigns an invoice number and manipulates stock levels for items listed in this invoice. This action cannot be undone. Continue?'
    if (accountCredit > 0) {
      issueMessage += `\n\nThis client has ${formatPula(accountCredit)} on account. You can apply it to this invoice after issuing.`
    }

    const ok = await confirm({
      title: 'Issue this invoice?',
      message: issueMessage,
      confirmLabel: 'Issue invoice',
    })
    if (!ok) return
    setSaving(true)
    const { data, error: err } = await opsApi.issueInvoice(editingId)
    setSaving(false)
    if (err) {
      showError(err.message)
      return
    }

    let issued = data
    const balanceDue =
      Math.round((Number(issued.total) - Number(issued.amount_paid || 0)) * 100) / 100
    const applyCap = Math.min(accountCredit, balanceDue)
    let successMessage = `Invoice ${issued.number || ''} has been issued.`

    if (applyCap > 0.001) {
      const applyOk = await confirm({
        title: 'Apply account credit?',
        message: `Apply ${formatPula(applyCap)} from this client's account to invoice ${issued.number || ''}?`,
        confirmLabel: 'Apply credit',
        cancelLabel: 'Not now',
      })
      if (applyOk) {
        setSaving(true)
        const applyRes = await opsApi.applyClientCreditToInvoice(editingId)
        setSaving(false)
        if (applyRes.error) {
          showError(applyRes.error.message)
        } else if (applyRes.data.applied > 0) {
          const reload = await opsApi.getInvoice(editingId)
          if (!reload.error) issued = reload.data
          successMessage = `Invoice ${issued.number || ''} issued. ${formatPula(applyRes.data.applied)} applied from account credit.`
        }
      }
    }

    showSuccess(successMessage)

    const nextForm = {
      ...form,
      status: issued.status,
      number: issued.number || '',
      issue_date: issued.issue_date || form.issue_date,
      total: Number(issued.total) || form.total,
      amount_paid: Number(issued.amount_paid) || 0,
    }
    setForm(nextForm)
    setBaseline(snapshotInvoiceForm(nextForm))
    const creditLeft = await opsApi.getClientCreditBalance(form.client_id)
    setAccountCredit(creditLeft.data?.balance ?? 0)
    await load()
  }

  async function handleVoid() {
    if (!editingId) return
    const ok = await confirm({
      title: 'Void this invoice?',
      message: 'Stock levels for items listed in this invoice will be restored. This cannot be undone.',
      confirmLabel: 'Void invoice',
    })
    if (!ok) return
    setSaving(true)
    const { data, error: err } = await opsApi.voidInvoice(editingId)
    setSaving(false)
    if (err) {
      showError(err.message)
      return
    }
    showSuccess('The Invoice has been voided. Stock levels have been restored where applicable.')
    const nextForm = { ...form, status: data.status }
    setForm(nextForm)
    setBaseline(snapshotInvoiceForm(nextForm))
    await load()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Invoices</h1>
          <p className="mt-1 text-sm text-ink-300">
            Issued to confirm a sale — that deducts stock levels. Void restores stock levels where applicable.
          </p>
        </div>
        {!showForm ? (
          <button type="button" onClick={startNew} className={adminBtnPrimary}>
            New invoice
          </button>
        ) : null}
      </div>

      {showForm ? (
        <form
          onSubmit={handleSave}
          className="space-y-4 rounded-2xl border border-white/10 bg-ink-900/40 p-4 sm:p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">
              {editingId
                ? `${form.number || 'Draft invoice'} · ${invoiceDisplayStatus(form)}`
                : 'New invoice'}
            </h2>
            <button
              type="button"
              onClick={() => {
                setShowForm(false)
                setBaseline('')
              }}
              className={adminBtnSecondary}
            >
              Close
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block sm:col-span-2 lg:col-span-1">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                Client *
              </span>
              <select
                required
                disabled={readOnly}
                className={adminFieldClass}
                value={form.client_id}
                onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}
              >
                <option value="">Select client…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <YearMonthDaySelect
              label="Issue date"
              disabled={readOnly}
              value={form.issue_date}
              onChange={(issue_date) => setForm((f) => ({ ...f, issue_date }))}
            />
            <YearMonthDaySelect
              label="Due date"
              disabled={readOnly}
              value={form.due_date}
              onChange={(due_date) => setForm((f) => ({ ...f, due_date }))}
            />
            <label className="block sm:col-span-2 lg:col-span-3">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">Notes</span>
              <textarea
                disabled={readOnly}
                rows={2}
                className={`${adminFieldClass} resize-y`}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </label>
          </div>

          <LineItemsEditor
            lines={form.lines}
            products={products}
            trackableItems={trackableItems}
            readOnly={readOnly}
            taxRate={taxRate}
            discountAmount={form.discount_amount}
            onDiscountChange={(discount_amount) =>
              setForm((f) => ({ ...f, discount_amount }))
            }
            onChange={(lines) => setForm((f) => ({ ...f, lines }))}
          />

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={saving || !canSaveDraft}
              title={
                readOnly
                  ? 'Only draft invoices can be edited'
                  : editingId && !isDirty
                    ? 'Change something before saving'
                    : undefined
              }
              className={adminBtnPrimary}
            >
              {saving ? 'Saving…' : 'Save draft'}
            </button>
            <BillingDocumentButtons
              documentType="invoice"
              documentId={editingId}
              isDirty={isDirty}
              disabled={saving}
              alwaysShow
              variant="primary"
              dirtyMessage="Save your changes before printing or emailing this invoice."
            />
            <button
              type="button"
              disabled={!canIssue}
              title={
                !editingId
                  ? 'Save this draft first'
                  : form.status !== 'draft'
                    ? 'Only draft invoices can be issued'
                    : isDirty
                      ? 'Save your changes before issuing'
                      : undefined
              }
              onClick={handleIssue}
              className={adminBtnPrimary}
            >
              Issue invoice
            </button>
            <button
              type="button"
              disabled={!canApplyCredit || saving}
              title={
                canApplyCredit
                  ? `Client has ${formatPula(accountCredit)} on account`
                  : 'No applicable account credit for this invoice'
              }
              onClick={handleApplyCredit}
              className={adminBtnPrimary}
            >
              Apply credit
              {canApplyCredit ? ` (${formatPula(applyCreditAmount)})` : ''}
            </button>
            <button
              type="button"
              disabled={!canVoid}
              title={
                !editingId
                  ? 'Save this invoice first'
                  : form.status === 'void'
                    ? 'This invoice is already void'
                    : isDirty
                      ? 'Save or discard changes before voiding'
                      : undefined
              }
              onClick={handleVoid}
              className={adminBtnDanger}
            >
              Void
            </button>
          </div>
        </form>
      ) : null}

      {showForm && editingId && form.client_id ? (
        <InvoiceQueryThread
          invoiceId={editingId}
          clientId={form.client_id}
          authorRole="staff"
        />
      ) : null}

      <DateRangeFilter
        from={dateFrom}
        to={dateTo}
        onFromChange={setDateFrom}
        onToChange={setDateTo}
        dateLabel="issue date"
        shown={visibleRows.length}
        total={rows.length}
      >
        <table className={adminTableClass}>
          <thead className="bg-ink-900/80 text-xs uppercase tracking-wider text-ink-400">
            <tr>
              <th className="px-4 py-3">Number</th>
              <th className="px-4 py-3">Client</th>
              <th className={`px-4 py-3 ${adminColSecondary}`}>Issued</th>
              <th className={`px-4 py-3 ${adminColSecondary}`}>Due</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Total</th>
              <th className={`px-4 py-3 ${adminColSecondary}`} />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-ink-400">
                  Loading…
                </td>
              </tr>
            ) : visibleRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-ink-400">
                  {rows.length === 0
                    ? 'No invoices yet.'
                    : 'No invoices in the selected date range.'}
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => {
                const displayStatus = invoiceDisplayStatus(row)
                const open = () => openRow(row.id)
                return (
                  <tr
                    key={row.id}
                    role="link"
                    tabIndex={0}
                    className={`group ${invoiceRowClass(displayStatus)} ${clickableRowClass}`}
                    onClick={open}
                    onKeyDown={(e) => activateRowKey(e, open)}
                  >
                    <td className="px-4 py-3">
                      <span className={clickableDocClass}>{row.number || 'Draft'}</span>
                    </td>
                    <td className="min-w-0 break-words px-4 py-3 text-ink-300">
                      {row.clients?.name || '—'}
                    </td>
                    <td className={`px-4 py-3 text-ink-300 ${adminColSecondary}`}>
                      {row.issue_date || '—'}
                    </td>
                    <td className={`px-4 py-3 text-ink-300 ${adminColSecondary}`}>
                      {row.due_date || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold capitalize ${invoiceStatusClass(displayStatus)}`}
                      >
                        {displayStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink-200">{formatPula(row.total)}</td>
                    <td className={`px-4 py-3 text-right ${adminColSecondary}`}>
                      <span className="text-xs font-semibold text-brand-400 group-hover:text-brand-300">
                        Open
                      </span>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </DateRangeFilter>
    </div>
  )
}
