import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { opsApi } from '../../lib/opsApi'
import { upsertById, removeById } from '../../lib/listState'
import {
  autoAllocatePayment,
  invoiceBalanceDue,
  PAYMENT_METHODS,
  paymentMethodLabel,
} from '../../lib/payments'
import { useOpsAlert } from '../OpsAlertContext'
import { useOwnClientGuard } from '../hooks/useOwnClientGuard'
import { useScrollAndHighlight } from '../hooks/useScrollAndHighlight'
import { PaymentDocumentButtons } from '../PaymentDocumentButtons'
import {
  openPaymentDocumentPrintWindow,
  fillPaymentDocumentPrintWindow,
  closePaymentDocumentPrintWindow,
} from '../../lib/paymentDocument'
import { YearMonthDaySelect } from '../../components/YearMonthDaySelect'
import { DateRangeFilter } from '../../components/DateRangeFilter'
import {
  currentMonthStartIso,
  filterByDateRange,
  todayIso as rangeTodayIso,
} from '../../lib/dateRange'
import { ClientSelect } from '../ClientSelect'
import { AdminIconAction } from '../AdminIconAction'
import {
  adminBtnDanger,
  adminBtnPrimary,
  adminBtnSecondary,
  adminFieldClass,
  adminTableClass,
  adminColSecondary,
  activateRowKey,
  clickableDocClass,
  clickableRowClass,
  formatPula,
} from '../ui'

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function emptyPaymentForm() {
  return {
    client_id: '',
    payment_date: todayIso(),
    method: 'cash',
    reference: '',
    notes: '',
    amount: '',
    selectedIds: [],
  }
}

function snapshotPaymentForm(form) {
  return JSON.stringify({
    client_id: form.client_id || '',
    payment_date: form.payment_date || '',
    method: form.method || '',
    reference: String(form.reference || '').trim(),
    notes: String(form.notes || '').trim(),
    amount: String(form.amount ?? ''),
    selectedIds: [...(form.selectedIds || [])].sort(),
  })
}

export default function PaymentsPage() {
  const [params, setParams] = useSearchParams()
  const { ownClientId, isBlocked, blockMessage } = useOwnClientGuard()
  const { showError, showSuccess, confirm } = useOpsAlert()
  const [rows, setRows] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [baseline, setBaseline] = useState('')
  const { formRef, highlightId, scrollToForm, highlightRow } = useScrollAndHighlight()
  const [openInvoices, setOpenInvoices] = useState([])
  const [accountCredit, setAccountCredit] = useState(0)
  const [form, setForm] = useState(emptyPaymentForm)
  /** Set when staff arrive from a client's "I've paid" report; closed off on save. */
  const [fromNotification, setFromNotification] = useState(null)
  const [dateFrom, setDateFrom] = useState(currentMonthStartIso)
  const [dateTo, setDateTo] = useState(rangeTodayIso)

  const load = useCallback(async () => {
    setLoading(true)
    const [p, c] = await Promise.all([
      opsApi.listPayments(),
      opsApi.listClients({ activeOnly: true }),
    ])
    setLoading(false)
    if (p.error) {
      showError(p.error.message)
      return
    }
    setRows((p.data || []).filter((r) => String(r.client_id) !== String(ownClientId || '')))
    setClients((c.data || []).filter((cl) => String(cl.id) !== String(ownClientId || '')))
  }, [showError, ownClientId])

  const loadOpenInvoices = useCallback(
    async (clientId, paymentId = null, seedSelectedIds = null) => {
      if (!clientId) {
        setOpenInvoices([])
        setAccountCredit(0)
        return []
      }
      const [invRes, creditRes] = await Promise.all([
        opsApi.listOpenInvoicesForClient(clientId, { editingPaymentId: paymentId }),
        opsApi.getClientCreditBalance(clientId),
      ])
      if (invRes.error) {
        showError(invRes.error.message)
        setOpenInvoices([])
        setAccountCredit(creditRes.data?.balance ?? 0)
        return []
      }
      const invoices = invRes.data || []
      const selectedIds = seedSelectedIds
        ? seedSelectedIds.filter((id) => invoices.some((inv) => inv.id === id))
        : []
      setOpenInvoices(invoices)
      setForm((f) => ({
        ...f,
        selectedIds,
      }))
      setAccountCredit(creditRes.data?.balance ?? 0)
      return selectedIds
    },
    [showError],
  )

  const startEdit = useCallback(
    async (rowOrId) => {
      const id = typeof rowOrId === 'string' ? rowOrId : rowOrId.id
      const { data, error } = await opsApi.getPayment(id)
      if (error) {
        showError(error.message)
        return
      }
      if (isBlocked(data.client_id)) {
        showError(blockMessage())
        return
      }
      const selectedIds = (data.allocations || [])
        .filter((a) => Number(a.amount) > 0)
        .map((a) => a.invoice_id)
      setEditingId(data.id)
      const nextForm = {
        client_id: data.client_id,
        payment_date: data.payment_date || todayIso(),
        method: data.method || 'cash',
        reference: data.reference || '',
        notes: data.notes || '',
        amount: String(data.amount ?? ''),
        selectedIds: [],
      }
      setForm(nextForm)
      setShowForm(true)
      scrollToForm()
      const appliedIds = await loadOpenInvoices(data.client_id, data.id, selectedIds)
      setBaseline(
        snapshotPaymentForm({
          ...nextForm,
          selectedIds: appliedIds,
        }),
      )
    },
    [showError, loadOpenInvoices, isBlocked, blockMessage],
  )

  useEffect(() => {
    load()
  }, [load])

  /** Open a blank payment pre-filled from what the client told us they paid. */
  const startFromNotification = useCallback(
    async (notificationId) => {
      const { data, error } = await opsApi.getPaymentNotification(notificationId)
      if (error) {
        showError(error.message)
        return
      }
      setEditingId(null)
      setFromNotification(data)
      setForm({
        ...emptyPaymentForm(),
        client_id: data.client_id,
        payment_date: data.payment_date || todayIso(),
        method: data.method || 'eft',
        reference: data.reference || '',
        notes: data.note || '',
        amount: String(data.amount ?? ''),
      })
      setShowForm(true)
      scrollToForm()
      await loadOpenInvoices(
        data.client_id,
        null,
        data.invoice_id ? [data.invoice_id] : null,
      )
    },
    [showError, loadOpenInvoices],
  )

  useEffect(() => {
    const openId = params.get('open')
    if (openId) {
      startEdit(openId).then(() => {
        params.delete('open')
        setParams(params, { replace: true })
      })
      return
    }
    const notificationId = params.get('notification')
    if (notificationId) {
      startFromNotification(notificationId).then(() => {
        params.delete('notification')
        setParams(params, { replace: true })
      })
      return
    }
    const clientId = params.get('client')
    if (clientId) {
      setEditingId(null)
      setForm({ ...emptyPaymentForm(), client_id: clientId })
      setShowForm(true)
      scrollToForm()
      loadOpenInvoices(clientId)
      params.delete('client')
      setParams(params, { replace: true })
    }
  }, [params, setParams, startEdit, startFromNotification, loadOpenInvoices])

  function closeForm(savedId) {
    setShowForm(false)
    setEditingId(null)
    setBaseline('')
    setOpenInvoices([])
    setAccountCredit(0)
    setForm(emptyPaymentForm())
    if (savedId) highlightRow(savedId)
    setFromNotification(null)
  }

  function startNew() {
    setEditingId(null)
    setBaseline('')
    setForm(emptyPaymentForm())
    setOpenInvoices([])
    setAccountCredit(0)
    setFromNotification(null)
    setShowForm(true)
    scrollToForm()
  }

  const isDirty = useMemo(
    () => Boolean(editingId) && snapshotPaymentForm(form) !== baseline,
    [editingId, form, baseline],
  )

  const visibleRows = useMemo(
    () => filterByDateRange(rows, dateFrom, dateTo, (row) => row.payment_date),
    [rows, dateFrom, dateTo],
  )

  const paymentAmount = Number(form.amount) || 0

  async function printSavedPayment(id) {
    const opened = openPaymentDocumentPrintWindow()
    if (!opened.ok) {
      showError(opened.message)
      return
    }
    const { win } = opened
    setSaving(true)
    const { data, error } = await opsApi.getPaymentDocumentBundle(id)
    setSaving(false)
    if (error) {
      closePaymentDocumentPrintWindow(win)
      showError(error.message)
      return
    }
    const result = fillPaymentDocumentPrintWindow(win, data.model)
    if (!result.ok) showError(result.message)
  }

  const { allocations, remaining } = useMemo(
    () => autoAllocatePayment(paymentAmount, openInvoices, form.selectedIds),
    [paymentAmount, openInvoices, form.selectedIds],
  )

  const allocationTotal = useMemo(
    () => Object.values(allocations).reduce((sum, v) => sum + (Number(v) || 0), 0),
    [allocations],
  )

  const fundsAvailable = remaining > 0.001 && paymentAmount > 0

  function toggleInvoice(invoiceId, checked) {
    setForm((f) => {
      const selectedIds = checked
        ? f.selectedIds.includes(invoiceId)
          ? f.selectedIds
          : [...f.selectedIds, invoiceId]
        : f.selectedIds.filter((id) => id !== invoiceId)
      return { ...f, selectedIds }
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.client_id) {
      showError('Please select a client.')
      return
    }
    if (paymentAmount <= 0) {
      showError('Enter a payment amount greater than zero.')
      return
    }
    if (!form.payment_date) {
      showError('Choose a complete payment date (year, month, and day).')
      return
    }

    const allocationRows = Object.entries(allocations)
      .map(([invoice_id, amount]) => ({
        invoice_id,
        amount: Number(amount) || 0,
      }))
      .filter((a) => a.amount > 0)

    const creditPortion = Math.round((paymentAmount - allocationTotal) * 100) / 100

    let confirmMessage
    if (allocationRows.length === 0) {
      confirmMessage = editingId
        ? `Save ${formatPula(paymentAmount)} on this client's account (no invoice allocation)?`
        : `No invoices selected — ${formatPula(paymentAmount)} will be placed on their account.`
    } else if (creditPortion > 0) {
      confirmMessage = `${editingId ? 'Update' : 'Record'} ${formatPula(paymentAmount)}: allocate ${formatPula(allocationTotal)} to invoice(s), ${formatPula(creditPortion)} left on account?`
    } else {
      confirmMessage = `${editingId ? 'Update' : 'Record'} ${formatPula(paymentAmount)} applied to ${allocationRows.length} invoice(s)?`
    }

    const ok = await confirm({
      title: editingId ? 'Save payment changes?' : 'Record this payment?',
      message: confirmMessage,
      confirmLabel: editingId ? 'Save changes' : 'Record payment',
    })
    if (!ok) return

    setSaving(true)
    const payload = {
      client_id: form.client_id,
      amount: paymentAmount,
      payment_date: form.payment_date,
      method: form.method,
      reference: form.reference,
      notes: form.notes,
      allocations: allocationRows,
    }
    const result = editingId
      ? await opsApi.updatePayment({ id: editingId, ...payload })
      : await opsApi.recordPayment(payload)
    setSaving(false)
    if (result.error) {
      showError(result.error.message)
      return
    }
    if (fromNotification?.id) {
      await opsApi.resolvePaymentNotification(fromNotification.id, {
        status: 'accepted',
        payment_id: result.data?.id || null,
      })
    }

    showSuccess(
      fromNotification
        ? 'Payment recorded and the client\u2019s report marked as confirmed.'
        : editingId
          ? 'Payment updated.'
          : 'Payment recorded.',
    )
    const paymentId = result.data?.id || editingId
    closeForm(paymentId)
    if (paymentId) {
      const refreshed = await opsApi.getPayment(paymentId)
      if (!refreshed.error && refreshed.data) {
        setRows((prev) => upsertById(prev, refreshed.data))
      }
    }
  }

  async function handleDelete(row) {
    const ok = await confirm({
      title: 'Delete this payment?',
      message: `Delete ${formatPula(row.amount)} payment for ${row.clients?.name || 'this client'}? Invoice balances will be recalculated.`,
      confirmLabel: 'Delete payment',
    })
    if (!ok) return
    setSaving(true)
    const { error } = await opsApi.deletePayment(row.id)
    setSaving(false)
    if (error) {
      showError(error.message)
      return
    }
    showSuccess('Payment deleted.')
    if (editingId === row.id) closeForm(null)
    setRows((prev) => removeById(prev, row.id))
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Payments</h1>
          <p className="mt-1 text-sm text-ink-300">
            Enter the amount received, then tick the invoices to pay. Funds are allocated
            automatically; anything left stays on the client&apos;s account.
          </p>
        </div>
        {!showForm ? (
          <button type="button" onClick={startNew} className={adminBtnPrimary}>
            Record payment
          </button>
        ) : null}
      </div>

      {showForm ? (
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="max-w-2xl space-y-4 rounded-2xl border border-white/10 bg-ink-900/40 p-4 sm:p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">
              {editingId ? 'Edit payment' : 'New payment'}
            </h2>
            <button type="button" onClick={closeForm} className={adminBtnSecondary}>
              Close
            </button>
          </div>

          {fromNotification ? (
            <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              <p className="font-semibold">
                Reported by {fromNotification.clients?.name || 'the client'}
              </p>
              <p className="mt-1 text-amber-200/90">
                {formatPula(fromNotification.amount)} on {fromNotification.payment_date} via{' '}
                {paymentMethodLabel(fromNotification.method)}
                {fromNotification.reference ? ` · ref ${fromNotification.reference}` : ''}
                {fromNotification.invoices?.number
                  ? ` · for ${fromNotification.invoices.number}`
                  : ''}
              </p>
              {fromNotification.note ? (
                <p className="mt-1 text-amber-200/90">&ldquo;{fromNotification.note}&rdquo;</p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-3">
                {fromNotification.proof_path ? (
                  <button
                    type="button"
                    onClick={async () => {
                      const { data, error } = await opsApi.getProofSignedUrl(
                        fromNotification.proof_path,
                      )
                      if (error) {
                        showError(error.message)
                        return
                      }
                      window.open(data, '_blank', 'noopener')
                    }}
                    className="text-xs font-semibold text-brand-400 hover:text-brand-300"
                  >
                    View proof of payment
                  </button>
                ) : (
                  <span className="text-xs text-amber-200/70">No proof attached</span>
                )}
              </div>
              <p className="mt-2 text-xs text-amber-200/70">
                Check this against the bank before saving. Saving marks the report confirmed.
              </p>
            </div>
          ) : null}

          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">Client *</span>
            <ClientSelect
              required
              disabled={Boolean(editingId)}
              clients={clients}
              value={form.client_id}
              onChange={(client_id) => {
                setForm((f) => ({ ...f, client_id, amount: '', selectedIds: [] }))
                loadOpenInvoices(client_id)
              }}
            />
            {editingId ? (
              <span className="mt-1 block text-xs text-ink-500">
                Client cannot be changed when editing a payment.
              </span>
            ) : null}
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <YearMonthDaySelect
              label="Date"
              required
              value={form.payment_date}
              onChange={(payment_date) => setForm((f) => ({ ...f, payment_date }))}
            />
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">Method</span>
              <select
                className={adminFieldClass}
                value={form.method}
                onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
              Reference (optional)
            </span>
            <input
              className={adminFieldClass}
              value={form.reference}
              onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
              placeholder="Receipt #, EFT reference…"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
              Payment amount (P) *
            </span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              required
              className={adminFieldClass}
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            />
          </label>

          {form.client_id ? (
            <p className="text-sm text-ink-300">
              Account credit available:{' '}
              <span className="font-semibold text-brand-300">{formatPula(accountCredit)}</span>
              {editingId ? (
                <span className="text-ink-500"> (includes this payment)</span>
              ) : null}
            </p>
          ) : null}

          {form.client_id ? (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-ink-400">
                Tick invoices to pay
              </p>
              {openInvoices.length === 0 ? (
                <p className="text-sm text-ink-400">
                  No open invoices — the full payment will stay on this client&apos;s account until
                  you issue an invoice and apply the credit.
                </p>
              ) : (
                <ul className="divide-y divide-white/10 rounded-xl border border-white/10">
                  {openInvoices.map((inv) => {
                    const due = inv._allocatable ?? invoiceBalanceDue(inv)
                    const selected = form.selectedIds.includes(inv.id)
                    const applied = Number(allocations[inv.id]) || 0
                    const checkboxDisabled = !selected && !fundsAvailable
                    return (
                      <li
                        key={inv.id}
                        className={`flex flex-wrap items-center gap-3 px-3 py-2 text-sm ${
                          checkboxDisabled ? 'opacity-50' : ''
                        }`}
                      >
                        <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 rounded border-white/30 bg-ink-950 text-brand-500 focus:ring-brand-500/40 disabled:cursor-not-allowed"
                            checked={selected}
                            disabled={checkboxDisabled}
                            onChange={(e) => toggleInvoice(inv.id, e.target.checked)}
                          />
                          <span className="min-w-0">
                            <span className="block font-medium text-white">
                              {inv.number || inv.id.slice(0, 8)}
                            </span>
                            <span className="block text-xs text-ink-400">
                              Balance due {formatPula(due)}
                              {selected
                                ? ` · Applying ${formatPula(applied)}`
                                : checkboxDisabled
                                  ? ' · No funds left to allocate'
                                  : ''}
                            </span>
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              )}
              <p className="text-xs text-ink-400">
                Allocated: {formatPula(allocationTotal)}
                {paymentAmount > 0 ? ` · Payment: ${formatPula(paymentAmount)}` : null}
                {paymentAmount > allocationTotal + 0.001
                  ? ` · To account: ${formatPula(paymentAmount - allocationTotal)}`
                  : null}
                {!fundsAvailable && paymentAmount > 0 && form.selectedIds.length > 0
                  ? ' · All funds allocated'
                  : null}
              </p>
            </div>
          ) : null}

          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">Notes</span>
            <textarea
              rows={2}
              className={`${adminFieldClass} resize-y`}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={saving} className={adminBtnPrimary}>
              {saving
                ? 'Saving…'
                : editingId
                  ? 'Save changes'
                  : 'Record payment'}
            </button>
            <PaymentDocumentButtons
              paymentId={editingId}
              isDirty={isDirty}
              disabled={saving}
              alwaysShow
              variant="primary"
            />
            {editingId ? (
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  handleDelete({
                    id: editingId,
                    amount: paymentAmount,
                    clients: {
                      name: clients.find((c) => c.id === form.client_id)?.name,
                    },
                  })
                }
                className={adminBtnDanger}
              >
                Delete payment
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
        dateLabel="payment date"
        shown={visibleRows.length}
        total={rows.length}
      >
        <table className={adminTableClass}>
          <thead className="bg-ink-900/80 text-xs uppercase tracking-wider text-ink-400">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Client</th>
              <th className={`px-4 py-3 ${adminColSecondary}`}>Method</th>
              <th className={`px-4 py-3 ${adminColSecondary}`}>Reference</th>
              <th className="px-4 py-3">Amount</th>
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
            ) : visibleRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-ink-400">
                  {rows.length === 0
                    ? 'No payments recorded yet.'
                    : 'No payments in the selected date range.'}
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => {
                const open = () => startEdit(row)
                return (
                <tr
                  key={row.id}
                  data-row-id={row.id}
                  role="link"
                  tabIndex={0}
                  className={`group bg-ink-900/20 ${clickableRowClass}${highlightId === row.id ? ' ring-2 ring-amber-400/60' : ''}`}
                  onClick={open}
                  onKeyDown={(e) => activateRowKey(e, open)}
                >
                  <td className="px-4 py-3 text-ink-300">{row.payment_date}</td>
                  <td className="min-w-0 break-words px-4 py-3">
                    <span className={clickableDocClass}>{row.clients?.name || '—'}</span>
                  </td>
                  <td className={`px-4 py-3 text-ink-300 ${adminColSecondary}`}>
                    {paymentMethodLabel(row.method)}
                  </td>
                  <td className={`px-4 py-3 text-ink-300 ${adminColSecondary}`}>
                    {row.reference || '—'}
                  </td>
                  <td className="px-4 py-3 font-medium text-ink-100">{formatPula(row.amount)}</td>
                  <td
                    className="px-4 py-3 text-right"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <div className="inline-flex items-center justify-end gap-0.5">
                      <AdminIconAction
                        label="Print"
                        icon="print"
                        disabled={saving}
                        onClick={() => printSavedPayment(row.id)}
                      />
                      <AdminIconAction
                        label="Edit"
                        icon="pencil"
                        disabled={saving}
                        onClick={open}
                      />
                      <AdminIconAction
                        label="Delete"
                        icon="trash"
                        tone="danger"
                        disabled={saving}
                        onClick={() => handleDelete(row)}
                      />
                    </div>
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
