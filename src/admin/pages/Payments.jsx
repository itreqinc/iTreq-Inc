import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { opsApi } from '../../lib/opsApi'
import { upsertById, removeById } from '../../lib/listState'
import {
  clearClientsReturn,
  clientsAccountsUrl,
  peekClientsReturn,
  takeClientsReturn,
} from '../../lib/clientsReturnNav'
import {
  autoAllocatePayment,
  invoiceBalanceDue,
  OPENING_BALANCE_ALLOC_ID,
  PAYMENT_METHODS,
  paymentDisplayMethod,
  paymentMethodLabel,
  openingBalanceRemaining,
} from '../../lib/payments'
import { clientOpeningBalanceAmount } from '../../lib/clientRegistration'
import { useOpsAlert } from '../OpsAlertContext'
import { useOwnClientGuard } from '../hooks/useOwnClientGuard'
import { useScrollAndHighlight } from '../hooks/useScrollAndHighlight'
import { usePersistedDateRange } from '../../hooks/usePersistedDateRange'
import { PaymentDocumentButtons } from '../PaymentDocumentButtons'
import {
  openPaymentDocumentPrintWindow,
  fillPaymentDocumentPrintWindow,
  closePaymentDocumentPrintWindow,
} from '../../lib/paymentDocument'
import { YearMonthDaySelect } from '../../components/YearMonthDaySelect'
import { DateRangeFilter } from '../../components/DateRangeFilter'
import { filterByDateRange, sortByDateDescThenNameAsc } from '../../lib/dateRange'
import { ClientSelect } from '../ClientSelect'
import { AdminIconAction } from '../AdminIconAction'
import { CornerHintIcon } from '../components/CornerHintIcon'
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
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const clientsReturnClientIdRef = useRef(null)
  const deepLinkHandledRef = useRef(false)
  const saveInFlightRef = useRef(false)
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
  /** Positive brought-forward remaining (includes this payment's B/F share when editing). */
  const [openingBalanceDue, setOpeningBalanceDue] = useState(0)
  const [accountCredit, setAccountCredit] = useState(0)
  /** Opt-in: apply existing account credit to invoices after recording this payment. */
  const [applyAccountCredit, setApplyAccountCredit] = useState(false)
  const [form, setForm] = useState(emptyPaymentForm)
  /** Set when staff arrive from a client's "I've paid" report; closed off on save. */
  const [fromNotification, setFromNotification] = useState(null)
  const [dateFrom, setDateFrom, dateTo, setDateTo] = usePersistedDateRange('admin.payments')
  const [listView, setListView] = useState('payments') // payments | adjustments | all
  const [unallocatedByPayment, setUnallocatedByPayment] = useState({})
  const [clientsWithUnpaidInvoices, setClientsWithUnpaidInvoices] = useState(() => new Set())

  const load = useCallback(async () => {
    setLoading(true)
    const [p, c, hints] = await Promise.all([
      opsApi.listPayments(),
      opsApi.listClients({ activeOnly: true }),
      opsApi.getPaymentListCreditHints(),
    ])
    setLoading(false)
    if (p.error) {
      showError(p.error.message)
      return
    }
    setRows((p.data || []).filter((r) => String(r.client_id) !== String(ownClientId || '')))
    setClients((c.data || []).filter((cl) => String(cl.id) !== String(ownClientId || '')))
    if (hints.error) {
      showError(hints.error.message)
      setUnallocatedByPayment({})
      setClientsWithUnpaidInvoices(new Set())
      return
    }
    setUnallocatedByPayment(hints.data?.unallocatedByPaymentId || {})
    setClientsWithUnpaidInvoices(
      new Set(hints.data?.clientIdsWithUnpaidInvoices || []),
    )
  }, [showError, ownClientId])

  const loadOpenInvoices = useCallback(
    async (clientId, paymentId = null, seedSelectedIds = null, opts = {}) => {
      if (!clientId) {
        setOpenInvoices([])
        setOpeningBalanceDue(0)
        setAccountCredit(0)
        setApplyAccountCredit(false)
        return []
      }
      const [invRes, creditRes, clientRes, appliedRes] = await Promise.all([
        opsApi.listOpenInvoicesForClient(clientId, { editingPaymentId: paymentId }),
        opsApi.getClientCreditBalance(clientId),
        opsApi.getClient(clientId),
        opsApi.getClientOpeningBalanceApplied(clientId),
      ])
      if (invRes.error) {
        showError(invRes.error.message)
        setOpenInvoices([])
        setOpeningBalanceDue(0)
        setAccountCredit(creditRes.data?.balance ?? 0)
        setApplyAccountCredit(false)
        return []
      }
      if (clientRes.error) {
        showError(clientRes.error.message)
      }
      if (appliedRes.error) {
        showError(appliedRes.error.message)
      }
      const invoices = invRes.data || []
      const editingOpeningApplied = Math.max(
        0,
        -(Number(opts.openingBalanceDelta) || 0),
      )
      const remaining = openingBalanceRemaining(
        clientOpeningBalanceAmount(clientRes.data),
        appliedRes.error ? [] : appliedRes.data,
      )
      const currentOpening = Math.max(0, remaining)
      const openingDue =
        Math.round((currentOpening + editingOpeningApplied) * 100) / 100
      setOpeningBalanceDue(openingDue)

      const selectedIds = (seedSelectedIds || []).filter(
        (id) =>
          id === OPENING_BALANCE_ALLOC_ID || invoices.some((inv) => inv.id === id),
      )
      setOpenInvoices(invoices)
      setForm((f) => ({
        ...f,
        selectedIds,
      }))
      setAccountCredit(creditRes.data?.balance ?? 0)
      setApplyAccountCredit(false)
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
      const openingApplied = Math.max(0, -(Number(data.opening_balance_delta) || 0))
      if (openingApplied > 0.001) selectedIds.push(OPENING_BALANCE_ALLOC_ID)
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
      const appliedIds = await loadOpenInvoices(data.client_id, data.id, selectedIds, {
        openingBalanceDelta: data.opening_balance_delta,
      })
      setBaseline(
        snapshotPaymentForm({
          ...nextForm,
          selectedIds: appliedIds,
        }),
      )
    },
    [showError, loadOpenInvoices, isBlocked, blockMessage, scrollToForm],
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
    const stashed = peekClientsReturn()
    if (stashed) clientsReturnClientIdRef.current = stashed

    if (deepLinkHandledRef.current) return

    const openId = params.get('open')
    if (openId) {
      deepLinkHandledRef.current = true
      startEdit(openId).then(() => {
        const next = new URLSearchParams(params)
        next.delete('open')
        next.delete('from')
        next.delete('client')
        setParams(next, { replace: true })
      })
      return
    }
    const notificationId = params.get('notification')
    if (notificationId) {
      deepLinkHandledRef.current = true
      startFromNotification(notificationId).then(() => {
        const next = new URLSearchParams(params)
        next.delete('notification')
        next.delete('from')
        next.delete('client')
        setParams(next, { replace: true })
      })
      return
    }
    const clientId = params.get('client')
    if (clientId) {
      deepLinkHandledRef.current = true
      if (!clientsReturnClientIdRef.current) {
        clientsReturnClientIdRef.current = clientId
      }
      setEditingId(null)
      setBaseline('')
      setFromNotification(null)
      setApplyAccountCredit(false)
      setForm({ ...emptyPaymentForm(), client_id: clientId })
      setShowForm(true)
      scrollToForm()
      loadOpenInvoices(clientId)
      const next = new URLSearchParams(params)
      next.delete('client')
      next.delete('from')
      setParams(next, { replace: true })
    }
  }, [params, setParams, startEdit, startFromNotification, loadOpenInvoices, scrollToForm])

  function closeForm(savedId) {
    // Never navigate away while a save is in flight — that aborts the request
    // and surfaces as "Could not reach the server" / Failed to fetch.
    if (saveInFlightRef.current) return

    const id = typeof savedId === 'string' ? savedId : null
    const returnClientId = clientsReturnClientIdRef.current || peekClientsReturn()
    if (returnClientId) {
      clientsReturnClientIdRef.current = null
      takeClientsReturn()
      navigate(clientsAccountsUrl(returnClientId))
      return
    }
    clearClientsReturn()
    setShowForm(false)
    setEditingId(null)
    setBaseline('')
    setOpenInvoices([])
    setOpeningBalanceDue(0)
    setAccountCredit(0)
    setApplyAccountCredit(false)
    setForm(emptyPaymentForm())
    if (id) highlightRow(id)
    setFromNotification(null)
  }

  function startNew() {
    setEditingId(null)
    setBaseline('')
    setForm(emptyPaymentForm())
    setOpenInvoices([])
    setOpeningBalanceDue(0)
    setAccountCredit(0)
    setApplyAccountCredit(false)
    setFromNotification(null)
    setShowForm(true)
    scrollToForm()
  }

  const isDirty = useMemo(
    () => Boolean(editingId) && snapshotPaymentForm(form) !== baseline,
    [editingId, form, baseline],
  )

  const visibleRows = useMemo(() => {
    const filtered = rows.filter((row) => {
      const isAdj = Boolean(row.is_adjustment)
      if (listView === 'payments') return !isAdj
      if (listView === 'adjustments') return isAdj
      return true
    })
    return sortByDateDescThenNameAsc(
      filterByDateRange(filtered, dateFrom, dateTo, (row) => row.payment_date),
      (row) => row.payment_date,
      (row) => row.clients?.name || '',
    )
  }, [rows, dateFrom, dateTo, listView])

  const listTotalForFilter = useMemo(() => {
    if (listView === 'all') return rows.length
    return rows.filter((row) => {
      const isAdj = Boolean(row.is_adjustment)
      return listView === 'adjustments' ? isAdj : !isAdj
    }).length
  }, [rows, listView])

  const paymentAmount = Number(form.amount) || 0

  const allocationTargets = useMemo(() => {
    const targets = []
    if (openingBalanceDue > 0.001) {
      targets.push({
        id: OPENING_BALANCE_ALLOC_ID,
        number: 'Brought forward',
        _allocatable: openingBalanceDue,
        _isOpening: true,
      })
    }
    for (const inv of openInvoices) targets.push(inv)
    return targets
  }, [openingBalanceDue, openInvoices])

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
    () => autoAllocatePayment(paymentAmount, allocationTargets, form.selectedIds),
    [paymentAmount, allocationTargets, form.selectedIds],
  )

  const allocationTotal = useMemo(
    () => Object.values(allocations).reduce((sum, v) => sum + (Number(v) || 0), 0),
    [allocations],
  )

  const openingAllocated = Math.round((Number(allocations[OPENING_BALANCE_ALLOC_ID]) || 0) * 100) / 100

  const fundsAvailable = remaining > 0.001 && paymentAmount > 0

  /** Invoices that can still take credit after this payment's allocations. */
  const creditApplyTargets = useMemo(() => {
    const pool =
      form.selectedIds.filter((id) => id !== OPENING_BALANCE_ALLOC_ID).length > 0
        ? openInvoices.filter((inv) => form.selectedIds.includes(inv.id))
        : openInvoices
    return pool
      .map((inv) => {
        const due = Number(inv._allocatable ?? invoiceBalanceDue(inv)) || 0
        const fromPayment = Number(allocations[inv.id]) || 0
        const remainingDue = Math.round((due - fromPayment) * 100) / 100
        return { id: inv.id, remainingDue }
      })
      .filter((row) => row.remainingDue > 0.001)
  }, [openInvoices, form.selectedIds, allocations])

  const creditApplyCap = useMemo(() => {
    const dueTotal = creditApplyTargets.reduce((s, row) => s + row.remainingDue, 0)
    return Math.round(Math.min(accountCredit, dueTotal) * 100) / 100
  }, [accountCredit, creditApplyTargets])

  const showApplyCreditPrompt = creditApplyCap > 0.001

  useEffect(() => {
    if (!showApplyCreditPrompt && applyAccountCredit) {
      setApplyAccountCredit(false)
    }
  }, [showApplyCreditPrompt, applyAccountCredit])

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
      .filter(([invoice_id]) => invoice_id !== OPENING_BALANCE_ALLOC_ID)
      .map(([invoice_id, amount]) => ({
        invoice_id,
        amount: Number(amount) || 0,
      }))
      .filter((a) => a.amount > 0)

    const openingAmount = openingAllocated
    const creditPortion = Math.round((paymentAmount - allocationTotal) * 100) / 100

    const parts = []
    if (openingAmount > 0.001) parts.push(`${formatPula(openingAmount)} to brought forward`)
    if (allocationRows.length) {
      parts.push(
        `${formatPula(allocationTotal - openingAmount)} to ${allocationRows.length} invoice(s)`,
      )
    }
    if (creditPortion > 0.001) parts.push(`${formatPula(creditPortion)} left on account`)

    let confirmMessage
    if (parts.length === 0) {
      confirmMessage = editingId
        ? `Save ${formatPula(paymentAmount)} on this client's account (no allocation)?`
        : `No invoices or brought forward selected — ${formatPula(paymentAmount)} will be placed on their account.`
    } else {
      confirmMessage = `${editingId ? 'Update' : 'Record'} ${formatPula(paymentAmount)}: ${parts.join(', ')}?`
    }

    const ok = await confirm({
      title: editingId ? 'Save payment changes?' : 'Record this payment?',
      message: confirmMessage,
      confirmLabel: editingId ? 'Save changes' : 'Record payment',
    })
    if (!ok) return

    // Lock before any await so Close / click-through cannot navigate away and abort fetch.
    saveInFlightRef.current = true
    setSaving(true)
    const payload = {
      client_id: form.client_id,
      amount: paymentAmount,
      payment_date: form.payment_date,
      method: form.method,
      reference: form.reference,
      notes: form.notes,
      allocations: allocationRows,
      opening_amount: openingAmount,
    }
    const result = editingId
      ? await opsApi.updatePayment({ id: editingId, ...payload })
      : await opsApi.recordPayment(payload)
    if (result.error) {
      saveInFlightRef.current = false
      setSaving(false)
      showError(result.error.message)
      return
    }

    let creditApplied = 0
    if (applyAccountCredit && creditApplyCap > 0.001) {
      let remainingCredit = creditApplyCap
      for (const target of creditApplyTargets) {
        if (remainingCredit <= 0.001) break
        const take = Math.min(remainingCredit, target.remainingDue)
        const applyRes = await opsApi.applyClientCreditToInvoice(target.id, take)
        if (applyRes.error) {
          saveInFlightRef.current = false
          setSaving(false)
          showError(
            `Payment saved, but credit could not be applied: ${applyRes.error.message}`,
          )
          const paymentId = result.data?.id || editingId
          closeForm(paymentId)
          if (paymentId && !clientsReturnClientIdRef.current && !peekClientsReturn()) {
            const refreshed = await opsApi.getPayment(paymentId)
            if (!refreshed.error && refreshed.data) {
              setRows((prev) => upsertById(prev, refreshed.data))
            }
          }
          return
        }
        const applied = Number(applyRes.data?.applied) || 0
        creditApplied += applied
        remainingCredit = Math.round((remainingCredit - applied) * 100) / 100
      }
    }
    setSaving(false)

    if (fromNotification?.id) {
      await opsApi.resolvePaymentNotification(fromNotification.id, {
        status: 'accepted',
        payment_id: result.data?.id || null,
      })
    }

    const creditNote =
      creditApplied > 0.001
        ? ` ${formatPula(creditApplied)} applied from account credit.`
        : ''
    showSuccess(
      fromNotification
        ? `Payment recorded and the client\u2019s report marked as confirmed.${creditNote}`
        : editingId
          ? `Payment updated.${creditNote}`
          : `Payment recorded.${creditNote}`,
    )
    const paymentId = result.data?.id || editingId
    const returningToClients = Boolean(
      clientsReturnClientIdRef.current || peekClientsReturn(),
    )
    saveInFlightRef.current = false
    closeForm(paymentId)
    if (paymentId && !returningToClients) {
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
            {listView === 'adjustments'
              ? 'Brought-forward credit applications and other non-cash adjustments.'
              : listView === 'all'
                ? 'All receipts and adjustments. Collected income counts payments only.'
                : 'Enter the amount received, then tick the invoices to pay. Funds are allocated automatically; anything left stays on the client’s account.'}
          </p>
        </div>
        {!showForm && listView !== 'adjustments' ? (
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
            <button
              type="button"
              disabled={saving}
              onClick={() => closeForm()}
              className={adminBtnSecondary}
            >
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
            <div className="space-y-2">
              <p className="text-sm text-ink-300">
                Account credit available:{' '}
                <span className="font-semibold text-brand-300">{formatPula(accountCredit)}</span>
                {editingId ? (
                  <span className="text-ink-500"> (includes this payment)</span>
                ) : null}
              </p>
              {showApplyCreditPrompt ? (
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-ink-950/40 px-3 py-2.5 text-sm text-ink-200">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/30 bg-ink-950 text-brand-500 focus:ring-brand-500/40"
                    checked={applyAccountCredit}
                    onChange={(e) => setApplyAccountCredit(e.target.checked)}
                  />
                  <span>
                    Also apply {formatPula(creditApplyCap)} account credit to{' '}
                    {form.selectedIds.length > 0 ? 'selected' : 'open'} invoice
                    {creditApplyTargets.length === 1 ? '' : 's'}
                    <span className="mt-0.5 block text-xs text-ink-500">
                      Leave unchecked to record the payment only.
                    </span>
                  </span>
                </label>
              ) : null}
            </div>
          ) : null}

          {form.client_id ? (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-ink-400">
                Tick what to pay
              </p>
              {allocationTargets.length === 0 ? (
                <p className="text-sm text-ink-400">
                  No open invoices or brought-forward balance — the full payment will stay on this
                  client&apos;s account until you issue an invoice and apply the credit.
                </p>
              ) : (
                <ul className="divide-y divide-white/10 rounded-xl border border-white/10">
                  {allocationTargets.map((inv) => {
                    const due = inv._allocatable ?? invoiceBalanceDue(inv)
                    const selected = form.selectedIds.includes(inv.id)
                    const applied = Number(allocations[inv.id]) || 0
                    const checkboxDisabled = !selected && !fundsAvailable
                    const isOpening = inv.id === OPENING_BALANCE_ALLOC_ID
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
                              {isOpening
                                ? 'Brought forward'
                                : inv.number || inv.id.slice(0, 8)}
                            </span>
                            <span className="block text-xs text-ink-400">
                              {isOpening ? 'Balance ' : 'Balance due '}
                              {formatPula(due)}
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
                {openingAllocated > 0.001
                  ? ` · Brought forward: ${formatPula(openingAllocated)}`
                  : null}
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
        total={listTotalForFilter}
        size="compact"
        dateClassName="w-[15.5rem] shrink-0"
        leading={
          <div className="inline-flex shrink-0 rounded-xl border border-white/10 bg-ink-950/50 p-0.5">
            {[
              { id: 'payments', label: 'Payments' },
              { id: 'adjustments', label: 'Adjustments' },
              { id: 'all', label: 'All' },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setListView(opt.id)}
                className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${
                  listView === opt.id
                    ? 'bg-white/10 text-white'
                    : 'text-ink-400 hover:text-ink-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        }
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
                  {listTotalForFilter === 0
                    ? listView === 'adjustments'
                      ? 'No adjustments recorded yet.'
                      : listView === 'all'
                        ? 'No payments recorded yet.'
                        : 'No payments recorded yet.'
                    : 'No rows in the selected date range.'}
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
                    {paymentDisplayMethod(row)}
                  </td>
                  <td className={`px-4 py-3 text-ink-300 ${adminColSecondary}`}>
                    {row.reference || '—'}
                  </td>
                  <td className="px-4 py-3 font-medium text-ink-100">
                    <span className="relative inline-block tabular-nums">
                      {formatPula(row.amount)}
                      {(() => {
                        const unallocated = unallocatedByPayment[row.id] || 0
                        const showInvoiceHint =
                          !row.is_adjustment &&
                          unallocated > 0.001 &&
                          clientsWithUnpaidInvoices.has(String(row.client_id))
                        return showInvoiceHint ? (
                          <CornerHintIcon
                            icon="invoice"
                            title={`${formatPula(unallocated)} from this payment is still on account — client has unpaid invoices`}
                          />
                        ) : null
                      })()}
                    </span>
                  </td>
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
