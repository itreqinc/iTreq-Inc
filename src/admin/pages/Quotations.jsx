import {
  useCallback,
  useEffect,
  useMemo,
  useState } from 'react'
import { useNavigate,
  useSearchParams } from 'react-router-dom'
import { opsApi } from '../../lib/opsApi'
import { upsertById, removeById } from '../../lib/listState'
import { emptyLine,
  mapDocLinesForEditor } from '../../lib/billing'
import { portalQuoteAwaitingApproval,
  quotationDisplayStatus } from '../../lib/portalQuote'
import { LineItemsEditor } from '../LineItemsEditor'
import { BillingDocumentButtons } from '../BillingDocumentButtons'
import { ClientSelect } from '../ClientSelect'
import { useOpsAlert } from '../OpsAlertContext'
import { useOwnClientGuard } from '../hooks/useOwnClientGuard'
import { YearMonthDaySelect } from '../../components/YearMonthDaySelect'
import { DateRangeFilter } from '../../components/DateRangeFilter'
import {
  currentMonthStartIso,
  documentFilterDate,
  filterByDateRange,
  todayIso,
} from '../../lib/dateRange'
import { useAuth } from '../../contexts/AuthContext'
import { isAdmin } from '../../lib/authConfig'
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

function snapshotQuotationForm(form) {
  return JSON.stringify({
    client_id: form.client_id || '',
    issue_date: form.issue_date || '',
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

export default function QuotationsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const { ownClientId, isBlocked, blockMessage } = useOwnClientGuard()
  const { showError, showSuccess, confirm, prompt } = useOpsAlert()
  const [rows, setRows] = useState([])
  const [dateFrom, setDateFrom] = useState(currentMonthStartIso)
  const [dateTo, setDateTo] = useState(todayIso)
  const [clients, setClients] = useState([])
  const [products, setProducts] = useState([])
  const [trackableItems, setTrackableItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [baseline, setBaseline] = useState('')
  const [form, setForm] = useState({
    number: '',
    client_id: '',
    issue_date: new Date().toISOString().slice(0, 10),
    notes: '',
    status: 'draft',
    source: 'staff',
    discount_amount: 0,
    lines: [emptyLine()],
  })
  const [taxRate, setTaxRate] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    const [q, c, p, s, t] = await Promise.all([
      opsApi.listQuotations(),
      opsApi.listClients({ activeOnly: true }),
      opsApi.listProducts({ activeOnly: true }),
      opsApi.getSettings(),
      opsApi.listTrackableItems({ withComponents: true }),
    ])
    setLoading(false)
    if (q.error) {
      showError(q.error.message)
      return
    }
    setRows((q.data || []).filter((r) => String(r.client_id) !== String(ownClientId || '')))
    setClients(
      (c.data || []).filter((cl) => String(cl.id) !== String(ownClientId || '')),
    )
    setProducts(p.data || [])
    setTaxRate(Number(s.data?.default_tax_rate) || 0)
    if (t.error) showError(t.error.message)
    else setTrackableItems(t.data || [])
  }, [showError, ownClientId])

  useEffect(() => {
    load()
  }, [load])

  function startNew() {
    const nextForm = {
      number: '',
      client_id: '',
      issue_date: new Date().toISOString().slice(0, 10),
      notes: '',
      status: 'draft',
      source: 'staff',
      discount_amount: 0,
      lines: [emptyLine()],
    }
    setEditingId(null)
    setForm(nextForm)
    setBaseline(snapshotQuotationForm(nextForm))
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setBaseline('')
  }

  async function openRow(id) {
    const { data, error: err } = await opsApi.getQuotation(id)
    if (err) {
      showError(err.message)
      return
    }
    if (isBlocked(data.client_id)) {
      showError(blockMessage())
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
      number: data.number || '',
      client_id: data.client_id,
      issue_date: data.issue_date,
      notes: data.notes || '',
      status: data.status,
      source: data.source || 'staff',
      decline_reason: data.decline_reason || '',
      discount_amount: Number(data.discount_amount) || 0,
      lines: mapDocLinesForEditor(data.lines, catalog),
    }
    setEditingId(id)
    setForm(nextForm)
    setBaseline(snapshotQuotationForm(nextForm))
    setShowForm(true)
  }

  useEffect(() => {
    const openId = params.get('open')
    if (!openId) return
    openRow(openId).then(() => {
      params.delete('open')
      setParams(params, { replace: true })
    })
  }, [params, setParams])

  const isDirty = useMemo(
    () => snapshotQuotationForm(form) !== baseline,
    [form, baseline],
  )

  const visibleRows = useMemo(
    () => filterByDateRange(rows, dateFrom, dateTo, documentFilterDate),
    [rows, dateFrom, dateTo],
  )

  const readOnly = ['converted', 'cancelled', 'declined'].includes(form.status)
  /** New quotes always; existing only after a change. */
  const canSave = !readOnly && (!editingId || isDirty)
  const canApprove =
    Boolean(editingId) &&
    form.source === 'portal' &&
    form.status === 'draft' &&
    !saving &&
    !readOnly
  const canCreateInvoice =
    Boolean(editingId) &&
    !isDirty &&
    !saving &&
    !['converted', 'cancelled', 'declined'].includes(form.status)
  const canCancel =
    Boolean(editingId) &&
    ['draft', 'sent', 'accepted'].includes(form.status) &&
    !saving &&
    !isDirty
  const canDecline = canCancel
  const canDelete =
    isAdmin(user?.role) &&
    Boolean(editingId) &&
    form.status !== 'converted' &&
    !isDirty &&
    !saving

  function statusLabel(quoteOrStatus) {
    if (quoteOrStatus && typeof quoteOrStatus === 'object') {
      return quotationDisplayStatus(quoteOrStatus)
    }
    if (quoteOrStatus === 'accepted') return 'approved'
    return quoteOrStatus
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!canSave) return

    const ok = await confirm({
      title: editingId ? 'Save changes to this quotation?' : 'Save this quotation?',
      message: editingId
        ? 'Your updates to this quotation will be saved.'
        : 'This quotation will be saved as a draft.',
      confirmLabel: 'Save',
    })
    if (!ok) return

    setSaving(true)
    const { data: saved, error: err } = await opsApi.saveQuotation({
      id: editingId,
      ...form,
    })
    setSaving(false)
    if (err) {
      showError(err.message)
      return
    }
    showSuccess('Quotation saved.')
    if (saved?.id) setRows((prev) => upsertById(prev, saved))
    closeForm()
  }

  async function handleApprove() {
    if (!canApprove) return

    const ok = await confirm({
      title: 'Approve this portal quotation?',
      message: isDirty
        ? 'Your edits will be saved and this quotation will be marked as approved.'
        : 'This quotation will be marked as approved. You can then email it or create an invoice.',
      confirmLabel: 'Approve',
    })
    if (!ok) return

    setSaving(true)
    const { data: saved, error: err } = await opsApi.saveQuotation({
      id: editingId,
      ...form,
      status: 'accepted',
    })
    setSaving(false)
    if (err) {
      showError(err.message)
      return
    }
    showSuccess('Quotation approved.')
    if (saved?.id) setRows((prev) => upsertById(prev, saved))
    closeForm()
  }

  async function convertToInvoice() {
    if (!canCreateInvoice) return
    const ok = await confirm({
      title: 'Create invoice from this quotation?',
      message:
        'A draft invoice will be created with the same lines and discount. Stock is only updated when that invoice is issued.',
      confirmLabel: 'Create invoice',
    })
    if (!ok) return

    setSaving(true)
    const { data, error: err } = await opsApi.convertQuotationToInvoice(editingId)
    setSaving(false)
    if (err) {
      showError(err.message)
      return
    }
    showSuccess('The Quotation has been converted to a draft invoice.')
    navigate(`/admin/invoices?open=${data.id}`)
  }

  async function handleCancelQuotation() {
    if (!canCancel) return
    const ok = await confirm({
      title: 'Cancel this quotation?',
      message: 'Cancelled quotations can no longer be edited or converted to an invoice.',
      confirmLabel: 'Cancel quotation',
    })
    if (!ok) return

    setSaving(true)
    const { data, error: err } = await opsApi.setQuotationStatus(editingId, 'cancelled')
    setSaving(false)
    if (err) {
      showError(err.message)
      return
    }
    showSuccess('Quotation cancelled.')
    if (data?.id) setRows((prev) => upsertById(prev, data))
    closeForm()
  }

  async function handleDeclineQuotation() {
    if (!canDecline) return
    const reason = await prompt({
      title: 'Decline this quotation?',
      message:
        'The client sees this reason in their portal. Declined quotations can no longer be edited or converted.',
      confirmLabel: 'Decline quotation',
      promptLabel: 'Reason for the client',
      promptPlaceholder: 'For example: the vehicles listed are outside our coverage area.',
    })
    if (!reason) return

    setSaving(true)
    const { data, error: err } = await opsApi.declineQuotation(editingId, reason)
    setSaving(false)
    if (err) {
      showError(err.message)
      return
    }
    showSuccess('Quotation declined. The client can see your reason.')
    if (data?.id) setRows((prev) => upsertById(prev, data))
    closeForm()
  }

  async function handleDeleteQuotation() {
    if (!canDelete) return
    const ok = await confirm({
      title: 'Delete this quotation?',
      message: `Permanently delete ${form.number || 'this quotation'}? This cannot be undone.`,
      confirmLabel: 'Delete quotation',
    })
    if (!ok) return
    setSaving(true)
    const deletedId = editingId
    const { error: err } = await opsApi.deleteQuotation(editingId)
    setSaving(false)
    if (err) {
      showError(err.message)
      return
    }
    showSuccess('Quotation deleted.')
    setRows((prev) => removeById(prev, deletedId))
    closeForm()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Quotations</h1>
          <p className="mt-1 text-sm text-ink-300">
            Estimates for clients before the actual installation. Converting this quotation creates a draft invoice (stock levels drops only when that
            invoice is issued).
          </p>
        </div>
        {!showForm ? (
          <button type="button" onClick={startNew} className={adminBtnPrimary}>
            New quotation
          </button>
        ) : null}
      </div>

      {showForm ? (
        <form
          onSubmit={handleSave}
          className="space-y-4 rounded-2xl border border-white/10 bg-ink-900/40 p-4 sm:p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              {editingId ? (
                <>
                  <h2 className="font-display text-lg font-bold text-white">
                    {form.number || 'Quotation'}
                  </h2>
                  <p
                    className={`mt-0.5 text-sm ${
                      portalQuoteAwaitingApproval(form)
                        ? 'text-amber-200/90'
                        : 'text-ink-400'
                    }`}
                  >
                    {statusLabel(form)}
                    {form.source === 'portal' && !portalQuoteAwaitingApproval(form)
                      ? ' · portal'
                      : ''}
                  </p>
                </>
              ) : (
                <h2 className="text-sm font-semibold text-white">New quotation</h2>
              )}
            </div>
            <button
              type="button"
              onClick={closeForm}
              className={adminBtnSecondary}
            >
              Close
            </button>
          </div>

          {form.status === 'declined' && form.decline_reason ? (
            <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              <span className="font-semibold">Declined:</span> {form.decline_reason}
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                Client *
              </span>
              <ClientSelect
                required
                disabled={readOnly}
                clients={clients}
                value={form.client_id}
                onChange={(client_id) => setForm((f) => ({ ...f, client_id }))}
              />
            </label>
            <YearMonthDaySelect
              label="Date"
              disabled={readOnly}
              value={form.issue_date}
              onChange={(issue_date) => setForm((f) => ({ ...f, issue_date }))}
            />
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                Project / notes
              </span>
              <textarea
                disabled={readOnly}
                rows={2}
                className={`${adminFieldClass} resize-y`}
                placeholder="Optional project reference or special notes for this estimate"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
              <p className="mt-1 text-xs text-ink-500">
                Standard quotation terms (validity, VAT, acceptance, etc.) are added automatically
                on print and email.
              </p>
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
              disabled={saving || !canSave}
              title={
                readOnly
                  ? 'This quotation can no longer be edited'
                  : editingId && !isDirty
                    ? 'Change something before saving'
                    : undefined
              }
              className={adminBtnPrimary}
            >
              {saving ? 'Saving…' : 'Save quotation'}
            </button>
            {form.source === 'portal' && form.status === 'draft' ? (
              <button
                type="button"
                disabled={saving || !canApprove}
                onClick={handleApprove}
                className={adminBtnPrimary}
                title="Save any edits and mark this portal request as approved"
              >
                {saving ? 'Saving…' : 'Approve'}
              </button>
            ) : null}
            <BillingDocumentButtons
              documentType="quote"
              documentId={editingId}
              isDirty={isDirty}
              disabled={saving}
              alwaysShow
              variant="primary"
              dirtyMessage="Save your changes before printing or emailing this quotation."
              onQuotationSent={(row) => {
                if (row?.status) {
                  setForm((f) => ({ ...f, status: row.status }))
                }
                if (row?.id) setRows((prev) => upsertById(prev, row))
              }}
            />
            <button
              type="button"
              disabled={!canCreateInvoice}
              title={
                !editingId
                  ? 'Save this quotation first'
                  : isDirty
                    ? 'Save your changes before creating an invoice'
                    : readOnly
                      ? 'This quotation can no longer be converted'
                      : undefined
              }
              onClick={convertToInvoice}
              className={adminBtnPrimary}
            >
              Create invoice
            </button>
            <button
              type="button"
              disabled={!canCancel}
              title={
                !editingId
                  ? 'Save this quotation first'
                  : form.status !== 'draft'
                    ? 'Only draft quotations can be cancelled'
                    : isDirty
                      ? 'Save or discard changes before cancelling'
                      : undefined
              }
              onClick={handleCancelQuotation}
              className={adminBtnDanger}
            >
              Cancel quotation
            </button>
            <button
              type="button"
              disabled={!canDecline}
              title={
                !editingId
                  ? 'Save this quotation first'
                  : isDirty
                    ? 'Save or discard changes before declining'
                    : 'Turn this down with a reason the client can see'
              }
              onClick={handleDeclineQuotation}
              className={adminBtnDanger}
            >
              Decline
            </button>
            {isAdmin(user?.role) ? (
              <button
                type="button"
                disabled={!canDelete}
                title={
                  !editingId
                    ? 'Save this quotation first'
                    : form.status === 'converted'
                      ? 'Converted quotations cannot be deleted'
                      : isDirty
                        ? 'Save or discard changes before deleting'
                        : 'Permanently remove this quotation'
                }
                onClick={handleDeleteQuotation}
                className={adminBtnDanger}
              >
                Delete
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      <DateRangeFilter
        from={dateFrom}
        to={dateTo}
        onFromChange={setDateFrom}
        onToChange={setDateTo}
        dateLabel="quote date"
        shown={visibleRows.length}
        total={rows.length}
      >
        <table className={adminTableClass}>
          <thead className="bg-ink-900/80 text-xs uppercase tracking-wider text-ink-400">
            <tr>
              <th className="px-4 py-3">Number</th>
              <th className="px-4 py-3">Client</th>
              <th className={`px-4 py-3 ${adminColSecondary}`}>Date</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Total</th>
              <th className={`px-4 py-3 ${adminColSecondary}`} />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-ink-400">
                  Loading…
                </td>
              </tr>
            ) : visibleRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-ink-400">
                  {rows.length === 0
                    ? 'No quotations yet.'
                    : 'No quotations in the selected date range.'}
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => {
                const awaiting = portalQuoteAwaitingApproval(row)
                const open = () => openRow(row.id)
                return (
                <tr
                  key={row.id}
                  role="link"
                  tabIndex={0}
                  className={`group bg-ink-900/20 ${clickableRowClass}`}
                  onClick={open}
                  onKeyDown={(e) => activateRowKey(e, open)}
                >
                  <td className="px-4 py-3">
                    <span className={clickableDocClass}>{row.number || '—'}</span>
                  </td>
                  <td className="min-w-0 break-words px-4 py-3 text-ink-300">
                    {row.clients?.name || '—'}
                  </td>
                  <td className={`px-4 py-3 text-ink-300 ${adminColSecondary}`}>{row.issue_date}</td>
                  <td className="px-4 py-3 text-ink-300">
                    <span
                      className={
                        awaiting
                          ? 'font-medium text-amber-200'
                          : 'capitalize'
                      }
                    >
                      {statusLabel(row)}
                    </span>
                    {row.source === 'portal' && !awaiting ? (
                      <span className="ml-2 text-xs normal-case text-ink-500">portal</span>
                    ) : null}
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
