import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { YearMonthDaySelect } from '../../components/YearMonthDaySelect'
import { DateRangeFilter } from '../../components/DateRangeFilter'
import { useAuth } from '../../contexts/AuthContext'
import { isAdmin } from '../../lib/authConfig'
import { useScrollAndHighlight } from '../hooks/useScrollAndHighlight'
import { usePersistedDateRange } from '../../hooks/usePersistedDateRange'
import {
  documentFilterDate,
  filterByDateRange,
  todayIso,
} from '../../lib/dateRange'
import {
  clearDefaultNewInvoiceIssueDate,
  getDefaultNewInvoiceIssueDate,
  setDefaultNewInvoiceIssueDate,
} from '../../lib/invoiceDefaults'
import { withUnreadRows } from '../../lib/invoiceDisputes'
import { opsApi } from '../../lib/opsApi'
import { upsertById, removeById } from '../../lib/listState'
import { emptyLine,
  mapDocLinesForEditor } from '../../lib/billing'
import { invoiceBalanceDue,
  dueDateFromIssueDate,
  invoiceDisplayStatus } from '../../lib/payments'
import { ClientSelect } from '../ClientSelect'
import { LineItemsEditor } from '../LineItemsEditor'
import { BillingDocumentButtons } from '../BillingDocumentButtons'
import {
  openBillingDocumentPrintWindow,
  fillBillingDocumentPrintWindow,
  closeBillingDocumentPrintWindow,
} from '../../lib/billingDocument'
import { ActionsMenu } from '../ActionsMenu'
import { InvoiceQueryThread } from '../../components/InvoiceQueryThread'
import { useOpsAlert } from '../OpsAlertContext'
import { useOwnClientGuard } from '../hooks/useOwnClientGuard'
import { useScrollAndHighlight } from '../hooks/useScrollAndHighlight'
import { usePersistedDateRange } from '../../hooks/usePersistedDateRange'
import {
  clearDefaultNewInvoiceIssueDate,
  getDefaultNewInvoiceIssueDate,
  setDefaultNewInvoiceIssueDate,
} from '../../lib/invoiceDefaults'
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

function newInvoiceForm(clientId = '') {
  const issue = getDefaultNewInvoiceIssueDate()
  return {
    client_id: clientId,
    issue_date: issue,
    due_date: dueDateFromIssueDate(issue),
    notes: '',
    status: 'draft',
    billing_period: '',
    number: '',
    total: 0,
    amount_paid: 0,
    discount_amount: 0,
    quotation_id: '',
    lines: [emptyLine()],
  }
}

function snapshotInvoiceForm(form) {
  return JSON.stringify({
    client_id: form.client_id || '',
    issue_date: form.issue_date || '',
    due_date: form.due_date || '',
    billing_period: form.billing_period || '',
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
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const { ownClientId, isBlocked, blockMessage } = useOwnClientGuard()
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
  const [dateFrom, setDateFrom, dateTo, setDateTo] = usePersistedDateRange('admin.invoices')
  const [unreadByInvoice, setUnreadByInvoice] = useState({})
  const { formRef, highlightId, scrollToForm, highlightRow } = useScrollAndHighlight()
  const [issueSelectedIds, setIssueSelectedIds] = useState([])
  const masterIssueCheckboxRef = useRef(null)
  const [form, setForm] = useState(() => newInvoiceForm())

  const load = useCallback(async () => {
    setLoading(true)
    const [inv, c, p, s, t, unread] = await Promise.all([
      opsApi.listInvoices(),
      opsApi.listClients({ activeOnly: true }),
      opsApi.listProducts({ activeOnly: true }),
      opsApi.getSettings(),
      opsApi.listTrackableItems({ withComponents: true }),
      opsApi.listInvoiceUnreadCounts({ role: 'staff' }),
    ])
    setLoading(false)
    if (inv.error) {
      showError(inv.error.message)
      return
    }
    setRows((inv.data || []).filter((r) => String(r.client_id) !== String(ownClientId || '')))
    setClients((c.data || []).filter((cl) => String(cl.id) !== String(ownClientId || '')))
    setProducts(p.data || [])
    setTaxRate(Number(s.data?.default_tax_rate) || 0)
    if (t.error) showError(t.error.message)
    else setTrackableItems(t.data || [])
    if (unread.error) showError(unread.error.message)
    else setUnreadByInvoice(unread.data || {})
  }, [showError, ownClientId])

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

      const issue = data.issue_date || todayIso()
      const nextForm = {
        client_id: data.client_id,
        issue_date: issue,
        due_date: data.due_date || dueDateFromIssueDate(issue),
        billing_period: data.billing_period || '',
        notes: data.notes || '',
        status: data.status,
        number: data.number || '',
        total: Number(data.total) || 0,
        amount_paid: Number(data.amount_paid) || 0,
        discount_amount: Number(data.discount_amount) || 0,
        quotation_id: data.quotation_id || '',
        lines: mapDocLinesForEditor(data.lines, catalog),
      }
      setEditingId(id)
      setForm(nextForm)
      setBaseline(snapshotInvoiceForm(nextForm))
      setShowForm(true)
      scrollToForm()

      if (['issued', 'partial', 'paid'].includes(data.status) && data.client_id) {
        const creditRes = await opsApi.getClientCreditBalance(data.client_id)
        setAccountCredit(creditRes.data?.balance ?? 0)
      } else {
        setAccountCredit(0)
      }
    },
    [showError, trackableItems, isBlocked, blockMessage],
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
      const nextForm = newInvoiceForm(clientId)
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
    const nextForm = newInvoiceForm()
    setEditingId(null)
    setAccountCredit(0)
    setForm(nextForm)
    setBaseline(snapshotInvoiceForm(nextForm))
    setShowForm(true)
    scrollToForm()
  }

  function closeForm(savedId) {
    setShowForm(false)
    setEditingId(null)
    setBaseline('')
    setAccountCredit(0)
    if (savedId) highlightRow(savedId)
  }

  const balanceDue = useMemo(() => invoiceBalanceDue(form), [form])
  const canApplyCredit =
    editingId &&
    ['issued', 'partial'].includes(form.status) &&
    balanceDue > 0.001 &&
    accountCredit > 0.001
  const applyCreditAmount = Math.min(accountCredit, balanceDue)

  const isDirty = useMemo(
    () => snapshotInvoiceForm(form) !== baseline,
    [form, baseline],
  )

  const visibleRows = useMemo(() => {
    const filtered = filterByDateRange(rows, dateFrom, dateTo, documentFilterDate)
    return withUnreadRows(filtered, rows, unreadByInvoice)
  }, [rows, dateFrom, dateTo, unreadByInvoice])

  const issueableDraftIds = useMemo(() => {
    // If a draft invoice is currently being edited with unsaved changes,
    // it is "blocked" and should not be issued in bulk.
    return visibleRows
      .filter((r) => r.status === 'draft')
      .filter((r) => !(r.id === editingId && isDirty))
      .map((r) => r.id)
  }, [visibleRows, editingId, isDirty])

  const issueSelectedSet = useMemo(() => new Set(issueSelectedIds), [issueSelectedIds])
  const allIssueableSelected =
    issueableDraftIds.length > 0 &&
    issueableDraftIds.every((id) => issueSelectedSet.has(id))
  const someIssueableSelected = issueableDraftIds.some((id) => issueSelectedSet.has(id))

  useEffect(() => {
    if (!masterIssueCheckboxRef.current) return
    masterIssueCheckboxRef.current.indeterminate =
      someIssueableSelected && !allIssueableSelected
  }, [someIssueableSelected, allIssueableSelected])

  useEffect(() => {
    const allowed = new Set(issueableDraftIds)
    setIssueSelectedIds((prev) => prev.filter((id) => allowed.has(id)))
  }, [issueableDraftIds])

  const readOnly = form.status !== 'draft'
  /** New invoices always; existing drafts only after a change. */
  const canSaveDraft = !readOnly && (!editingId || isDirty)
  const canIssue =
    Boolean(editingId) && form.status === 'draft' && !isDirty && !saving
  const canVoid =
    Boolean(editingId) && form.status !== 'void' && !isDirty && !saving
  /** Draft delete requires a clean form; void invoices are read-only so isDirty is ignored. */
  const canDeleteDraft =
    isAdmin(user?.role) &&
    Boolean(editingId) &&
    form.status === 'draft' &&
    !isDirty &&
    !saving
  const canDeleteVoid =
    isAdmin(user?.role) &&
    Boolean(editingId) &&
    form.status === 'void' &&
    !saving
  const canDelete = canDeleteDraft || canDeleteVoid

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
    const { data: saved, error: err } = await opsApi.saveInvoice({
      id: editingId,
      ...form,
    })
    setSaving(false)
    if (err) {
      showError(err.message)
      return
    }
    showSuccess('A draft Invoice has been saved.')
    if (!editingId && saved?.issue_date) {
      setDefaultNewInvoiceIssueDate(saved.issue_date)
    }
    if (saved?.id) setRows((prev) => upsertById(prev, saved))
    closeForm(saved?.id || editingId)
  }

  async function handleIssue(invoiceId = editingId) {
    if (!invoiceId) return
    if (invoiceId === editingId && isDirty) {
      showError('Please save your changes before issuing this invoice.')
      return
    }

    const invoice =
      invoiceId === editingId
        ? form
        : (await opsApi.getInvoice(invoiceId)).data
    if (!invoice) return

    const creditRes = await opsApi.getClientCreditBalance(invoice.client_id)
    const clientCredit = creditRes.data?.balance ?? 0

    let issueMessage =
      'Issuing assigns an invoice number and manipulates stock levels for items listed in this invoice. This action cannot be undone. Continue?'
    if (clientCredit > 0) {
      issueMessage += `\n\nThis client has ${formatPula(clientCredit)} on account. You can apply it to this invoice after issuing.`
    }

    const ok = await confirm({
      title: 'Issue this invoice?',
      message: issueMessage,
      confirmLabel: 'Issue invoice',
    })
    if (!ok) return
    setSaving(true)
    const { data, error: err } = await opsApi.issueInvoice(invoiceId)
    setSaving(false)
    if (err) {
      showError(err.message)
      return
    }

    let issued = data
    const balanceDue =
      Math.round((Number(issued.total) - Number(issued.amount_paid || 0)) * 100) / 100
    const applyCap = Math.min(clientCredit, balanceDue)
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
        const applyRes = await opsApi.applyClientCreditToInvoice(invoiceId)
        setSaving(false)
        if (applyRes.error) {
          showError(applyRes.error.message)
        } else if (applyRes.data.applied > 0) {
          const reload = await opsApi.getInvoice(invoiceId)
          if (!reload.error) issued = reload.data
          successMessage = `Invoice ${issued.number || ''} issued. ${formatPula(applyRes.data.applied)} applied from account credit.`
        }
      }
    }

    showSuccess(successMessage)
    if (issued?.id) setRows((prev) => upsertById(prev, issued))
    if (invoiceId === editingId) closeForm(invoiceId)
  }

  async function handleIssueSelected() {
    if (!issueSelectedIds.length) return

    const idsToIssue = issueSelectedIds.filter((id) => issueableDraftIds.includes(id))
    if (!idsToIssue.length) return

    const ok = await confirm({
      title: `Issue ${idsToIssue.length} invoice(s)?`,
      message:
        'Issuing assigns invoice numbers and deducts stock levels for each selected draft invoice. This action cannot be undone. Continue?',
      confirmLabel: 'Issue selected',
    })
    if (!ok) return

    setSaving(true)
    const issued = []
    for (const id of idsToIssue) {
      const { data, error } = await opsApi.issueInvoice(id)
      if (error) {
        setSaving(false)
        showError(error.message)
        return
      }
      if (data?.id) issued.push(data)
    }
    setSaving(false)

    setRows((prev) => {
      let next = prev
      for (const inv of issued) next = upsertById(next, inv)
      return next
    })
    if (issued[0]?.id) highlightRow(issued[0].id)
    setIssueSelectedIds([])
    showSuccess(`Issued ${issued.length} invoice(s).`)
  }

  async function handleVoid(invoiceId = editingId) {
    if (!invoiceId) return
    if (invoiceId === editingId && isDirty) {
      showError('Save or discard changes before voiding this invoice.')
      return
    }
    const ok = await confirm({
      title: 'Void this invoice?',
      message: 'Stock levels for items listed in this invoice will be restored. This cannot be undone.',
      confirmLabel: 'Void invoice',
    })
    if (!ok) return
    setSaving(true)
    const { data, error: err } = await opsApi.voidInvoice(invoiceId)
    setSaving(false)
    if (err) {
      showError(err.message)
      return
    }
    showSuccess('The Invoice has been voided. Stock levels have been restored where applicable.')
    if (invoiceId === editingId) {
      const nextForm = { ...form, status: data.status }
      setForm(nextForm)
      setBaseline(snapshotInvoiceForm(nextForm))
    }
    if (data?.id) setRows((prev) => upsertById(prev, data))
  }

  async function handleDelete(invoiceId = editingId, status = form.status, row) {
    if (!invoiceId) return
    if (invoiceId === editingId && isDirty) {
      showError('Save or discard changes before deleting this invoice.')
      return
    }
    const hasQuotation = Boolean(
      row?.quotation_id ||
        (invoiceId === editingId && form.quotation_id) ||
        rows.find((r) => r.id === invoiceId)?.quotation_id,
    )
    const baseMessage =
      status === 'draft'
        ? 'This permanently removes the draft invoice.'
        : 'This permanently removes the void invoice from the system.'
    const ok = await confirm({
      title: 'Delete this invoice?',
      message: hasQuotation
        ? `${baseMessage} The linked quotation will return to draft so it can be converted again. This cannot be undone.`
        : `${baseMessage} This cannot be undone.`,
      confirmLabel: 'Delete invoice',
    })
    if (!ok) return
    setSaving(true)
    const { error: err } = await opsApi.deleteInvoice(invoiceId)
    setSaving(false)
    if (err) {
      showError(err.message)
      return
    }
    showSuccess(
      hasQuotation
        ? 'Invoice deleted. The linked quotation is back to draft.'
        : 'Invoice deleted.',
    )
    setRows((prev) => removeById(prev, invoiceId))
    if (invoiceId === editingId) closeForm(null)
  }

  async function handleVoidOrDelete(invoiceId = editingId, row) {
    const status = row?.status ?? form.status
    const mayDelete =
      isAdmin(user?.role) &&
      (status === 'draft' || status === 'void')
    if (mayDelete) {
      await handleDelete(invoiceId, status, row)
      return
    }
    await handleVoid(invoiceId)
  }

  async function handleApplyCreditFor(invoiceId, row) {
    if (!invoiceId) return
    if (invoiceId === editingId && isDirty) {
      showError('Save or discard changes before applying credit.')
      return
    }

    const invoice =
      invoiceId === editingId
        ? form
        : row || (await opsApi.getInvoice(invoiceId)).data
    if (!invoice) return

    const due = invoiceBalanceDue(invoice)
    if (due <= 0.001 || !['issued', 'partial'].includes(invoice.status)) return

    const creditRes = await opsApi.getClientCreditBalance(invoice.client_id)
    const credit = creditRes.data?.balance ?? 0
    const amount = Math.min(credit, due)
    if (amount <= 0.001) {
      showError('No applicable account credit for this invoice.')
      return
    }

    const ok = await confirm({
      title: 'Apply account credit?',
      message: `Apply ${formatPula(amount)} from this client's account to invoice ${invoice.number || ''}?`,
      confirmLabel: 'Apply credit',
    })
    if (!ok) return

    setSaving(true)
    const applyRes = await opsApi.applyClientCreditToInvoice(invoiceId)
    setSaving(false)
    if (applyRes.error) {
      showError(applyRes.error.message)
      return
    }

    if (invoiceId === editingId) {
      const reload = await opsApi.getInvoice(invoiceId)
      if (!reload.error) {
        const data = reload.data
        setForm((f) => ({
          ...f,
          status: data.status,
          amount_paid: Number(data.amount_paid) || 0,
          total: Number(data.total) || 0,
          number: data.number || f.number,
        }))
        setRows((prev) => upsertById(prev, data))
      }
      const creditLeft = await opsApi.getClientCreditBalance(invoice.client_id)
      setAccountCredit(creditLeft.data?.balance ?? 0)
    } else {
      const reload = await opsApi.getInvoice(invoiceId)
      if (!reload.error) setRows((prev) => upsertById(prev, reload.data))
    }
    showSuccess(`${formatPula(applyRes.data.applied)} applied from account credit.`)
  }

  async function printInvoice(invoiceId) {
    if (!invoiceId) return
    if (invoiceId === editingId && isDirty) {
      showError('Save your changes before printing or emailing this invoice.')
      return
    }
    const opened = openBillingDocumentPrintWindow()
    if (!opened.ok) {
      showError(opened.message)
      return
    }
    const { win } = opened
    setSaving(true)
    const { data, error } = await opsApi.getBillingDocumentBundle('invoice', invoiceId)
    setSaving(false)
    if (error) {
      closeBillingDocumentPrintWindow(win)
      showError(error.message)
      return
    }
    const result = fillBillingDocumentPrintWindow(win, data.model)
    if (!result.ok) showError(result.message)
  }

  async function emailInvoice(invoiceId) {
    if (!invoiceId) return
    if (invoiceId === editingId && isDirty) {
      showError('Save your changes before printing or emailing this invoice.')
      return
    }
    setSaving(true)
    const preview = await opsApi.getBillingDocumentBundle('invoice', invoiceId)
    setSaving(false)
    if (preview.error) {
      showError(preview.error.message)
      return
    }
    const to = preview.data.model.client.email?.trim()
    if (!to) {
      showError('This client has no email address on file. Update the client record first.')
      return
    }
    const ok = await confirm({
      title: 'Email invoice to client?',
      message: `A copy will be sent to ${to}.`,
      confirmLabel: 'Send email',
    })
    if (!ok) return
    setSaving(true)
    const { error } = await opsApi.sendBillingDocumentEmail('invoice', invoiceId)
    setSaving(false)
    if (error) {
      showError(error.message)
      return
    }
    showSuccess(`Email sent to ${to}.`)
  }

  function rowBlocked(invoiceId) {
    return invoiceId === editingId && isDirty
  }

  function rowInvoiceMenuItems(row) {
    const id = row.id
    const status = row.status
    const blocked = rowBlocked(id)
    const rowCanIssue = status === 'draft' && !blocked && !saving
    const rowCanVoid = status !== 'void' && !blocked && !saving
    const rowCanDeleteDraft =
      isAdmin(user?.role) && status === 'draft' && !blocked && !saving
    const rowCanDeleteVoid =
      isAdmin(user?.role) && status === 'void' && !saving
    const rowCanDelete = rowCanDeleteDraft || rowCanDeleteVoid
    const rowCanVoidOrDelete = rowCanDelete || rowCanVoid
    const rowCanShare = !blocked && !saving
    const rowCanApplyCredit =
      ['issued', 'partial'].includes(status) && !blocked && !saving

    const items = [
      {
        label: 'Open invoice',
        icon: 'eye',
        onClick: () => openRow(id),
      },
      {
        label: 'Issue invoice',
        icon: 'checkCircle',
        disabled: !rowCanIssue,
        onClick: () => handleIssue(id),
      },
      {
        label: 'Apply credit',
        icon: 'payment',
        disabled: !rowCanApplyCredit,
        onClick: () => handleApplyCreditFor(id, row),
      },
      {
        label: 'Print / Save PDF',
        icon: 'print',
        disabled: !rowCanShare,
        onClick: () => printInvoice(id),
      },
      {
        label: 'Email to client',
        icon: 'mail',
        disabled: !rowCanShare,
        onClick: () => emailInvoice(id),
      },
    ]

    if (rowCanVoidOrDelete) {
      items.push({
        label: rowCanDelete ? 'Delete invoice' : 'Void invoice',
        icon: rowCanDelete ? 'trash' : 'ban',
        tone: 'danger',
        onClick: () => handleVoidOrDelete(id, row),
      })
    }

    return items
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
          ref={formRef}
          onSubmit={handleSave}
          className="space-y-4 rounded-2xl border border-white/10 bg-ink-900/40 p-4 sm:p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">
              {editingId
                ? `${form.number || 'Draft invoice'} · ${invoiceDisplayStatus(form)}`
                : 'New invoice'}
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={closeForm}
                className={adminBtnSecondary}
              >
                Close
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block sm:col-span-2 lg:col-span-1">
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
              label="Issue date"
              disabled={readOnly}
              value={form.issue_date}
              onChange={(issue_date) => {
                if (!editingId && issue_date === todayIso()) {
                  clearDefaultNewInvoiceIssueDate()
                }
                setForm((f) => ({
                  ...f,
                  issue_date,
                  due_date:
                    f.billing_period || !issue_date
                      ? f.due_date
                      : dueDateFromIssueDate(issue_date),
                }))
              }}
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
              onClick={() => handleIssue()}
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
              onClick={() => handleApplyCreditFor(editingId, form)}
              className={adminBtnPrimary}
            >
              Apply credit
              {canApplyCredit ? ` (${formatPula(applyCreditAmount)})` : ''}
            </button>
            {canDelete ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => handleDelete()}
                className={adminBtnDanger}
              >
                Delete invoice
              </button>
            ) : canVoid ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => handleVoid()}
                className={adminBtnDanger}
              >
                Void invoice
              </button>
            ) : null}
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
        <div className="flex flex-wrap items-center justify-end gap-3 pb-2">
          <button
            type="button"
            disabled={saving || issueSelectedIds.length === 0}
            onClick={handleIssueSelected}
            className={adminBtnPrimary}
            title={issueSelectedIds.length ? undefined : 'Select draft invoices to issue'}
          >
            {saving ? 'Issuing…' : `Issue selected (${issueSelectedIds.length})`}
          </button>
        </div>
        <table className={adminTableClass}>
          <thead className="bg-ink-900/80 text-xs uppercase tracking-wider text-ink-400">
            <tr>
              <th className="px-4 py-3 w-10">
                <input
                  ref={masterIssueCheckboxRef}
                  type="checkbox"
                  aria-label="Select all draft invoices"
                  checked={allIssueableSelected}
                  disabled={saving || issueableDraftIds.length === 0}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    if (saving) return
                    if (e.target.checked) setIssueSelectedIds(issueableDraftIds)
                    else setIssueSelectedIds([])
                  }}
                />
              </th>
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
                <td colSpan={8} className="px-4 py-6 text-ink-400">
                  Loading…
                </td>
              </tr>
            ) : visibleRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-ink-400">
                  {rows.length === 0
                    ? 'No invoices yet.'
                    : 'No invoices in the selected date range.'}
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => {
                const displayStatus = invoiceDisplayStatus(row)
                const unread = unreadByInvoice[row.id] || 0
                const open = () => openRow(row.id)
                return (
                  <tr
                    key={row.id}
                    data-row-id={row.id}
                    role="link"
                    tabIndex={0}
                    className={`group ${invoiceRowClass(displayStatus)} ${clickableRowClass}${highlightId === row.id ? ' ring-2 ring-amber-400/60' : ''}`}
                    onClick={open}
                    onKeyDown={(e) => activateRowKey(e, open)}
                  >
                    <td className="px-4 py-3">
                      {row.status === 'draft' ? (
                        <input
                          type="checkbox"
                          checked={issueSelectedSet.has(row.id)}
                          disabled={saving || rowBlocked(row.id)}
                          aria-label={`Select invoice ${row.number || row.id}`}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            const checked = e.target.checked
                            setIssueSelectedIds((prev) => {
                              if (checked)
                                return prev.includes(row.id) ? prev : [...prev, row.id]
                              return prev.filter((id) => id !== row.id)
                            })
                          }}
                        />
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span className={clickableDocClass}>{row.number || 'Draft'}</span>
                      {unread > 0 ? (
                        <span className="ml-2 inline-flex rounded-md bg-amber-500/25 px-2 py-0.5 text-xs font-semibold text-amber-100">
                          {unread === 1 ? '1 new' : `${unread} new`}
                        </span>
                      ) : null}
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
                    <td
                      className="px-4 py-3 text-right"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <ActionsMenu
                        label={`Actions for ${row.number || 'invoice'}`}
                        items={rowInvoiceMenuItems(row)}
                      />
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
