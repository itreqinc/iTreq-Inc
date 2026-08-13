import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { isAdmin, isStaffLike, canStaffEditOpeningBalance, VIEW_MODES, truncateEmail } from '../../lib/authConfig'
import { syncClientLoginEmail, resetClientPassword } from '../../lib/authApi'
import { opsApi } from '../../lib/opsApi'
import { upsertById, removeById } from '../../lib/listState'
import { clientToForm,
  emptyClientForm,
} from '../../lib/clientRegistration'
import { validateClientForm, normEmail } from '../../lib/clientValidation'
import {
  invoiceUrlFromClients,
  paymentUrlFromClients,
} from '../../lib/clientsReturnNav'
import { statementLineLabel, statementLineMethodSuffix } from '../../lib/payments'
import { quotationDisplayStatus } from '../../lib/portalQuote'
import {
  openStatementDocumentPrintWindow,
  closeStatementDocumentPrintWindow,
  fillStatementDocumentPrintWindow,
  prepareStatementDocument,
  } from '../../lib/statementDocument'
import { ClientRegistrationFields } from '../../components/ClientRegistrationFields'
import { YearMonthDaySelect } from '../../components/YearMonthDaySelect'
import { usePersistedDateRange } from '../../hooks/usePersistedDateRange'
import {
  dateRangeIsBackwards,
  dayBeforeIso,
  endOfNextMonthIso,
  todayIso as rangeTodayIso,
} from '../../lib/dateRange'
import { ActionsMenu } from '../ActionsMenu'
import { AdminIconAction } from '../AdminIconAction'
import { useOpeningBalanceActions } from '../components/OpeningBalanceActions'
import { useOpsAlert } from '../OpsAlertContext'
import { useScrollAndHighlight } from '../hooks/useScrollAndHighlight'
import { adminBtnPrimary,
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
} from '../ui'

const dash = (value) => {
  const text = String(value ?? '').trim()
  return text || '—'
}

const genderLabel = (value) =>
  value === 'M' ? 'Male' : value === 'F' ? 'Female' : '—'

function DetailField({ label, children, className = '' }) {
  return (
    <div className={className}>
      <dt className="text-xs uppercase tracking-wide text-ink-500">{label}</dt>
      <dd className="mt-1 whitespace-pre-line break-words text-sm text-ink-100">{children}</dd>
    </div>
  )
}

function monthStartIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function balanceClass(balance) {
  const n = Number(balance) || 0
  if (n > 0.001) return 'text-amber-200'
  if (n < -0.001) return 'text-emerald-300'
  return 'text-ink-300'
}

function ClientRowActions({ items, label = 'Client actions' }) {
  return (
    <div
      className="inline-flex items-center justify-end"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <ActionsMenu label={label} items={items} />
    </div>
  )
}

export default function ClientsPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { user } = useAuth()
  const admin = isAdmin(user?.role)
  const staffLike = isStaffLike(user?.role)
  const { showError, showSuccess, showWarning, confirm } = useOpsAlert()
  const [view, setView] = useState('directory')
  // Directory filter: default to active clients only.
  const [showAllClients, setShowAllClients] = useState(false)
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(emptyClientForm)
  const [editingId, setEditingId] = useState(null)
  const canEditOpeningOnForm =
    staffLike && canStaffEditOpeningBalance(user, editingId || null, VIEW_MODES.staff)
  const [showForm, setShowForm] = useState(false)
  const [viewId, setViewId] = useState(null)
  const [editEmailBaseline, setEditEmailBaseline] = useState({ profile: '', login: null })
  const [saving, setSaving] = useState(false)
  const { formRef, highlightId, scrollToForm, highlightRow } = useScrollAndHighlight()
  const pendingAccountFocusRef = useRef(null)

  /** Keep the selected client as the 3rd visible row in the accounts list. */
  function scrollAccountsClientToThird(clientId) {
    if (!clientId) return
    const nodes = document.querySelectorAll(`[data-accounts-client="${clientId}"]`)
    let el = null
    for (const node of nodes) {
      if (node.getClientRects().length > 0) {
        el = node
        break
      }
    }
    if (!el) return

    const container = el.closest('[data-accounts-client-list]')
    const rowH = el.getBoundingClientRect().height || 40
    const gapAbove = 2 * rowH // two rows above → selected is 3rd
    const canScrollContainer =
      container && container.scrollHeight > container.clientHeight + 1

    if (canScrollContainer) {
      const header = container.querySelector('[data-accounts-client-list-header]')
      const headerH = header?.offsetHeight || 0
      const cRect = container.getBoundingClientRect()
      const eRect = el.getBoundingClientRect()
      const elTopInContent = eRect.top - cRect.top + container.scrollTop
      const target = Math.max(0, elTopInContent - headerH - gapAbove)
      container.scrollTo({ top: target, behavior: 'smooth' })
      return
    }

    // Mobile / short lists: park selection ~3rd from the viewport top.
    const eRect = el.getBoundingClientRect()
    const target = Math.max(0, window.scrollY + eRect.top - gapAbove - 8)
    window.scrollTo({ top: target, behavior: 'smooth' })
  }

  const [printingStmt, setPrintingStmt] = useState(false)
  const [stmtModalClient, setStmtModalClient] = useState(null)
  const [stmtFrom, setStmtFrom] = useState(monthStartIso)
  const [stmtTo, setStmtTo] = useState(todayIso)
  const [deletingId, setDeletingId] = useState(null)

  const [selectedId, setSelectedId] = useState(null)
  const [selectedAccountCredit, setSelectedAccountCredit] = useState(0)
  const [statement, setStatement] = useState(null)
  const [stmtLoading, setStmtLoading] = useState(false)
  const [showAllTx, setShowAllTx] = useState(false)
  const [txDateSort, setTxDateSort] = useState('asc') // asc = oldest first (statement order)
  const [searchQuery, setSearchQuery] = useState('')
  const [txFrom, setTxFrom, txTo, setTxTo] = usePersistedDateRange(
    'admin.clients.accounts.all',
    { defaultFrom: '', defaultTo: '' },
  )
  const txRangeBackwards = dateRangeIsBackwards(txFrom, txTo)
  const openingAsOf = txFrom ? dayBeforeIso(txFrom) : ''

  const filteredClients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return clients
    return clients.filter((c) => {
      const hay = [
        c.name,
        c.email,
        c.phone,
        c.cellphone,
        c.id_number,
      ]
        .map((v) => String(v || '').toLowerCase())
        .join(' ')
      return hay.includes(q)
    })
  }, [clients, searchQuery])

  const load = useCallback(async () => {
    setLoading(true)
    const activeOnly = !showAllClients
    const { data, error: err } =
      view === 'accounts'
        ? await opsApi.listClientsWithBalances({ activeOnly })
        : await opsApi.listClients({ activeOnly })
    setLoading(false)
    if (err) {
      showError(err.message)
      return
    }
    setClients(data || [])
  }, [showError, view, showAllClients])

  const refreshSelectedStatement = useCallback(async () => {
    if (view !== 'accounts' || !selectedId || txRangeBackwards) return
    const { data, error } = await opsApi.getClientStatement({
      client_id: selectedId,
      from: txFrom || undefined,
      to: txTo || undefined,
    })
    if (error) {
      showError(error.message)
      return
    }
    setStatement(data)
  }, [view, selectedId, txFrom, txTo, txRangeBackwards, showError])

  const onOpeningBalanceDone = useCallback(async () => {
    await load()
    await refreshSelectedStatement()
    if (selectedId) {
      const creditRes = await opsApi.getClientCreditBalance(selectedId)
      if (!creditRes.error) {
        setSelectedAccountCredit(Number(creditRes.data?.balance) || 0)
      }
    }
  }, [load, refreshSelectedStatement, selectedId])

  const { menuItemsFor: openingBalanceMenuItems, dialogs: openingBalanceDialogs } =
    useOpeningBalanceActions({ onDone: onOpeningBalanceDone })

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const accountId = String(params.get('account') || '').trim()
    if (!accountId) return
    setView('accounts')
    setSelectedId(accountId)
    setShowForm(false)
    setViewId(null)
    setSearchQuery('')
    pendingAccountFocusRef.current = accountId
    const next = new URLSearchParams(params)
    next.delete('account')
    setParams(next, { replace: true })
  }, [params, setParams])

  // Keep the selected accounts client visible as the 3rd row in the list.
  useEffect(() => {
    if (view !== 'accounts' || loading || !selectedId) return
    if (!filteredClients.some((c) => c.id === selectedId)) return

    const isPendingReturn = pendingAccountFocusRef.current === selectedId
    if (isPendingReturn) {
      pendingAccountFocusRef.current = null
      highlightRow(selectedId)
    }

    const timer = window.setTimeout(() => {
      scrollAccountsClientToThird(selectedId)
    }, 50)
    return () => window.clearTimeout(timer)
  }, [view, loading, selectedId, filteredClients, highlightRow])

  useEffect(() => {
    if (view !== 'accounts' || !selectedId) {
      setSelectedAccountCredit(0)
      return
    }
    let cancelled = false
    opsApi.getClientCreditBalance(selectedId).then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        setSelectedAccountCredit(0)
        return
      }
      setSelectedAccountCredit(Number(data?.balance) || 0)
    })
    return () => {
      cancelled = true
    }
  }, [view, selectedId])
  useEffect(() => {
    if (!stmtModalClient) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(e) {
      if (e.key === 'Escape') closeStatementRangeModal()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [stmtModalClient, printingStmt])

  useEffect(() => {
    if (view !== 'accounts') {
      setStatement(null)
      setShowAllTx(false)
      return
    }
    if (!selectedId) {
      setStatement(null)
      setShowAllTx(false)
      return
    }
    if (txRangeBackwards) {
      setStatement(null)
      setStmtLoading(false)
      return
    }
    let cancelled = false
    setStmtLoading(true)
    setShowAllTx(false)
    opsApi
      .getClientStatement({
        client_id: selectedId,
        from: txFrom || undefined,
        to: txTo || undefined,
      })
      .then(({ data, error }) => {
        if (cancelled) return
        setStmtLoading(false)
        if (error) {
          showError(error.message)
          setStatement(null)
          return
        }
        setStatement(data)
      })
    return () => {
      cancelled = true
    }
  }, [view, selectedId, txFrom, txTo, txRangeBackwards, showError])

  useEffect(() => {
    if (view !== 'accounts') return
    if (loading) return
    const pendingId = pendingAccountFocusRef.current
    if (pendingId) {
      if (filteredClients.some((c) => c.id === pendingId)) {
        setSelectedId(pendingId)
      }
      return
    }
    if (!filteredClients.length) {
      if (selectedId) setSelectedId(null)
      return
    }
    if (!selectedId || !filteredClients.some((c) => c.id === selectedId)) {
      setSelectedId(filteredClients[0]?.id || null)
    }
  }, [view, filteredClients, selectedId, loading])

  function startNew() {
    setEditingId(null)
    setViewId(null)
    setEditEmailBaseline({ profile: '', login: null })
    setForm(emptyClientForm())
    setShowForm(true)
    setView('directory')
    scrollToForm()
  }

  function openViewProfile(client) {
    setViewId(client.id)
    setShowForm(false)
    setEditingId(null)
    setView('directory')
  }

  function closeViewProfile() {
    setViewId(null)
  }

  function startEdit(client) {
    setEditingId(client.id)
    setViewId(null)
    setEditEmailBaseline({
      profile: normEmail(client.email),
      login: client.portal_login_email ? normEmail(client.portal_login_email) : null,
    })
    setForm(clientToForm(client))
    setShowForm(true)
    setView('directory')
    scrollToForm()
  }

  function closeForm(savedId) {
    setEditingId(null)
    setEditEmailBaseline({ profile: '', login: null })
    setForm(emptyClientForm())
    setShowForm(false)
    if (savedId) highlightRow(savedId)
  }

  async function resetPassword(client) {
    const ok = await confirm({
      title: 'Reset password?',
      message: `${client.name}'s portal password will be set to password123. They must change it on next sign-in. Active sessions will be signed out.`,
      confirmLabel: 'Reset to password123',
    })
    if (!ok) return
    const { data, error } = await resetClientPassword(client.id)
    if (error || data?.success === false) {
      showError(error?.message || data?.message || 'Could not reset password')
      return
    }
    showSuccess(
      `Password reset for ${client.name}. Temporary password: ${data.temporary_password || 'password123'}`,
    )
  }

  function openStatementRangeModal(client) {
    setStmtFrom(monthStartIso())
    setStmtTo(todayIso())
    setStmtModalClient(client)
  }

  function closeStatementRangeModal() {
    if (printingStmt) return
    setStmtModalClient(null)
  }

  async function printClientStatement(clientId, from, to) {
    if (from && to && from > to) {
      showWarning('From date must be on or before To date.')
      return
    }

    const opened = openStatementDocumentPrintWindow()
    if (!opened.ok) {
      showError(opened.message)
      return
    }
    const { win } = opened
    setPrintingStmt(true)
    const [stmtRes, settingsRes] = await Promise.all([
      opsApi.getClientStatement({ client_id: clientId, from, to }),
      opsApi.getSettings(),
    ])
    setPrintingStmt(false)
    if (stmtRes.error || settingsRes.error) {
      closeStatementDocumentPrintWindow(win)
      showError(stmtRes.error?.message || settingsRes.error?.message)
      return
    }
    const printable = {
      ...stmtRes.data,
      lines: (stmtRes.data.lines || []).filter((l) => !l.inactive || l.alwaysShow),
    }
    const { model } = prepareStatementDocument({
      statement: printable,
      settings: settingsRes.data,
    })
    setStmtModalClient(null)
    const result = fillStatementDocumentPrintWindow(win, model)
    if (!result.ok) showError(result.message)
  }

  function openClientDetails(client) {
    setSelectedId(client.id)
    setShowForm(false)
    setViewId(null)
    setView('accounts')
  }

  function clientIconActions(client) {
    return {
      onEdit: () => startEdit(client),
      onInvoice: () => navigate(invoiceUrlFromClients(client.id)),
      onPayment: () => navigate(paymentUrlFromClients(client.id)),
      onPrint: () => openStatementRangeModal(client),
      printing: printingStmt,
    }
  }

  async function toggleClientActive(client) {
    const next = !client.is_active
    const ok = await confirm({
      title: next ? 'Activate this client?' : 'Deactivate this client?',
      message: next
        ? `${client.name} will appear in client pickers and can receive new quotes, invoices, and payments.`
        : `${client.name} will be hidden from client pickers. Existing invoices, quotations, and payments stay on record.`,
      confirmLabel: next ? 'Activate' : 'Deactivate',
      type: next ? 'warning' : 'warning',
    })
    if (!ok) return

    const { data, error } = await opsApi.setClientActive(client.id, next)
    if (error) {
      showError(error.message)
      return
    }
    showSuccess(next ? 'Client activated.' : 'Client deactivated.')
    if (!showAllClients && !next) {
      setClients((prev) => removeById(prev, client.id))
      if (selectedId === client.id) {
        setSelectedId(null)
        setStatement(null)
      }
      return
    }
    setClients((prev) => upsertById(prev, { ...client, ...data, is_active: next }))
  }

  async function removeClient(client) {
    const ok = await confirm({
      title: 'Delete this client?',
      message: `Permanently remove ${client.name}? This only works when there are no invoices, quotations, or payments.`,
      confirmLabel: 'Delete client',
      type: 'warning',
    })
    if (!ok) return

    setDeletingId(client.id)
    const { error } = await opsApi.deleteClient(client.id)
    setDeletingId(null)
    if (error) {
      showError(error.message)
      return
    }
    showSuccess('Client deleted.')
    if (selectedId === client.id) {
      setSelectedId(null)
      setStatement(null)
    }
    if (viewId === client.id) setViewId(null)
    setClients((prev) => removeById(prev, client.id))
  }

  function clientMenuItems(client) {
    const actions = clientIconActions(client)
    const bfClient =
      client.id === selectedId
        ? { ...client, account_credit: selectedAccountCredit }
        : client
    const items = [
      {
        label: 'View Profile',
        icon: 'eye',
        onClick: () => openViewProfile(client),
      },
      { label: 'Edit client', icon: 'pencil', onClick: actions.onEdit },
      {
        label: 'Reset Password',
        icon: 'key',
        onClick: () => resetPassword(client),
      },
      ...openingBalanceMenuItems(bfClient),
      { label: 'New invoice', icon: 'invoice', onClick: actions.onInvoice },
      { label: 'Record payment', icon: 'payment', onClick: actions.onPayment },
      {
        label: actions.printing ? 'Opening statement…' : 'Print statement',
        icon: 'print',
        onClick: actions.onPrint,
        disabled: actions.printing,
      },
    ]

    if (client.is_active !== false) {
      items.push({
        label: 'Deactivate client',
        icon: 'ban',
        tone: 'danger',
        onClick: () => toggleClientActive(client),
      })
    } else {
      items.push({
        label: 'Activate client',
        icon: 'checkCircle',
        onClick: () => toggleClientActive(client),
      })
    }

    if (admin && !client.has_financial_records) {
      items.push({
        label: deletingId === client.id ? 'Deleting…' : 'Delete client',
        icon: 'trash',
        tone: 'danger',
        disabled: deletingId === client.id,
        onClick: () => removeClient(client),
      })
    }

    return items
  }

  function openTransaction(line) {
    if (!line?.id || !selectedId) return
    if (line.type === 'invoice') {
      navigate(invoiceUrlFromClients(selectedId, { openInvoiceId: line.id }))
    } else if (line.type === 'payment') {
      navigate(paymentUrlFromClients(selectedId, { openPaymentId: line.id }))
    } else if (line.type === 'quotation') {
      navigate(`/admin/quotations?open=${line.id}`)
    }
  }

  function transactionMenuItems(line) {
    if (line.type === 'invoice' && line.id) {
      return [
        {
          label: 'Open invoice',
          onClick: () => openTransaction(line),
        },
      ]
    }
    if (line.type === 'payment' && line.id) {
      return [
        {
          label: 'Open payment',
          onClick: () => openTransaction(line),
        },
      ]
    }
    if (line.type === 'quotation' && line.id) {
      return [
        {
          label: 'Open quotation',
          onClick: () => openTransaction(line),
        },
      ]
    }
    return []
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const check = validateClientForm(form)
    if (!check.ok) {
      showWarning(check.message)
      return
    }
    if (canEditOpeningOnForm || (!editingId && staffLike)) {
      const opening = Math.round((Number(form.opening_balance) || 0) * 100) / 100
      if (opening !== 0 && !String(form.opening_balance_date || '').trim()) {
        showWarning('Choose an opening balance date when the amount is not zero.')
        return
      }
    }

    const ok = await confirm({
      title: editingId ? 'Save client changes?' : 'Add this client?',
      message: editingId
        ? 'Your updates to this client record will be saved.'
        : 'A new client will be added to the system.',
      confirmLabel: editingId ? 'Save changes' : 'Add client',
    })
    if (!ok) return

    setSaving(true)
    const result = editingId
      ? await opsApi.updateClient(editingId, form)
      : await opsApi.createClient(form)
    setSaving(false)
    if (result.error) {
      showError(result.error.message)
      return
    }

    const saved = result.data
    const savedId = saved?.id || editingId
    const newProfileEmail = normEmail(form.email)
    const emailChanged = Boolean(editingId && newProfileEmail !== editEmailBaseline.profile)
    const canSyncLogin =
      emailChanged &&
      editEmailBaseline.login != null &&
      newProfileEmail &&
      newProfileEmail !== editEmailBaseline.login

    if (canSyncLogin) {
      const syncOk = await confirm({
        title: 'Update portal login email?',
        message: `Profile email is now ${newProfileEmail}. Also change portal login from ${truncateEmail(editEmailBaseline.login)} to match? Active portal sessions will be signed out.`,
        confirmLabel: 'Update login email',
        cancelLabel: 'Profile only',
      })
      if (syncOk) {
        const syncRes = await syncClientLoginEmail(savedId)
        if (syncRes.error || syncRes.data?.success === false) {
          showWarning(
            syncRes.error?.message ||
              syncRes.data?.message ||
              'Client saved, but portal login email could not be updated.',
            'Profile saved',
          )
        } else if (!syncRes.data?.unchanged) {
          showSuccess('Client profile and portal login email updated.')
          setClients((prev) =>
            upsertById(prev, {
              ...saved,
              portal_login_email: syncRes.data.login_email || newProfileEmail,
              balance: prev.find((c) => c.id === savedId)?.balance ?? 0,
              has_financial_records:
                prev.find((c) => c.id === savedId)?.has_financial_records ?? false,
            }),
          )
          closeForm(savedId)
          return
        }
      }
    }

    showSuccess(
      editingId
        ? "The Client's details have been updated."
        : 'A new Client has been added to the system.',
    )
    closeForm(savedId)
    if (!saved?.id) return
    setClients((prev) => {
      const existing = prev.find((c) => c.id === saved.id)
      return upsertById(prev, {
        ...saved,
        portal_login_email: existing?.portal_login_email ?? editEmailBaseline.login ?? null,
        balance: existing?.balance ?? 0,
        has_financial_records: existing?.has_financial_records ?? false,
      })
    })
  }

  const selectedClient = clients.find((c) => c.id === selectedId)
  const viewing = viewId ? clients.find((c) => c.id === viewId) : null

  const visibleLines = useMemo(() => {
    const lines = statement?.lines || []
    const filtered = showAllTx
      ? lines
      : // Draft quotations (and any alwaysShow lines) stay visible; they don't affect balance.
        lines.filter((l) => !l.inactive || l.alwaysShow)
    if (txDateSort === 'desc') return [...filtered].reverse()
    return filtered
  }, [statement, showAllTx, txDateSort])

  const hasInactive = useMemo(
    () => (statement?.lines || []).some((l) => l.inactive && !l.alwaysShow),
    [statement],
  )

  function renderAccountsClientButton(c) {
    const active = c.id === selectedId
    const focused = highlightId === c.id
    return (
      <button
        type="button"
        data-row-id={c.id}
        data-accounts-client={c.id}
        onClick={() => setSelectedId(c.id)}
        className={`flex w-full items-start justify-between gap-2 px-3 py-2.5 text-left text-sm ${
          active ? 'accounts-tab-active text-white' : 'text-ink-200 hover:bg-white/5'
        }${focused ? ' ring-2 ring-amber-400/60' : ''}`}
      >
        <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere] font-medium leading-snug">
          {c.name}
        </span>
        <span
          className={`shrink-0 self-center text-xs font-semibold tabular-nums ${balanceClass(c.balance)}`}
        >
          {formatPula(c.balance)}
        </span>
      </button>
    )
  }

  function renderAccountsClientListEmpty() {
    if (loading) return <p className="px-3 py-6 text-sm text-ink-400">Loading…</p>
    if (clients.length === 0) {
      return <p className="px-3 py-6 text-sm text-ink-400">No clients yet.</p>
    }
    if (filteredClients.length === 0) {
      return <p className="px-3 py-6 text-sm text-ink-400">No clients match your search.</p>
    }
    return null
  }

  function renderAccountsDetailPanel({ className = '' } = {}) {
    return (
      <div
        className={`min-h-[16rem] min-w-0 p-4 sm:p-5 lg:min-h-full ${selectedId ? 'accounts-surface' : ''} ${className}`}
      >
        {!selectedId ? (
          <p className="text-sm text-ink-400">Select a client to view transactions.</p>
        ) : txRangeBackwards ? (
          <p className="text-sm text-ink-400">Fix the date range to load transactions.</p>
        ) : stmtLoading ? (
          <p className="text-sm text-ink-400">Loading transactions…</p>
        ) : !statement ? (
          <p className="text-sm text-ink-400">No statement data.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  {selectedClient?.name || statement.client?.name}
                </h2>
                {txFrom || txTo ? (
                  <p className="mt-1 text-xs text-ink-500">
                    Period:{' '}
                    <span className="text-ink-300">
                      {txFrom || '…'} → {txTo || '…'}
                    </span>
                  </p>
                ) : null}
                {txFrom ? (
                  <p className="mt-1 text-sm text-ink-300">
                    Opening balance
                    {openingAsOf ? (
                      <span className="text-ink-500"> (as of {openingAsOf})</span>
                    ) : null}
                    :{' '}
                    <span className={`font-semibold ${balanceClass(statement.openingBalance)}`}>
                      {formatPula(statement.openingBalance)}
                    </span>
                  </p>
                ) : null}
                {statement?.carryIn?.hasHistory ? (
                  <p className="mt-1 text-sm text-ink-300">
                    Opening balance
                    {statement.carryIn.asOfDate ? (
                      <span className="text-ink-500">
                        {' '}
                        (as of {statement.carryIn.asOfDate})
                      </span>
                    ) : null}
                    :{' '}
                    <span
                      className={`font-semibold ${balanceClass(statement.carryIn.originalAmount)}`}
                    >
                      {formatPula(statement.carryIn.originalAmount)}
                    </span>
                    {statement.carryIn.isSettled ? (
                      <span className="text-ink-500"> · settled</span>
                    ) : Math.abs(statement.carryIn.remaining) > 0.001 ? (
                      <span className="text-ink-500">
                        {' '}
                        · {formatPula(statement.carryIn.remaining)} remaining
                      </span>
                    ) : null}
                  </p>
                ) : null}
                <p className="mt-1 text-sm text-ink-300">
                  Closing balance:{' '}
                  <span className={`font-semibold ${balanceClass(statement.closingBalance)}`}>
                    {formatPula(statement.closingBalance)}
                  </span>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {hasInactive ? (
                  <button
                    type="button"
                    onClick={() => setShowAllTx((v) => !v)}
                    aria-pressed={showAllTx}
                    className={showAllTx ? adminBtnPrimary : adminBtnSecondary}
                  >
                    Show all
                  </button>
                ) : null}
                {selectedClient ? (
                  <ClientRowActions
                    label={`Actions for ${selectedClient.name}`}
                    items={clientMenuItems(selectedClient)}
                  />
                ) : null}
              </div>
            </div>

            <div className={`${adminTableShellSmClass} bg-ink-950/30`}>
              <table className={adminTableClass}>
                <thead className="bg-ink-950/50 text-xs uppercase tracking-wider text-ink-400">
                  <tr>
                    <th className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setTxDateSort((d) => (d === 'asc' ? 'desc' : 'asc'))}
                        className="inline-flex items-center gap-1 rounded-md text-left uppercase tracking-wider text-ink-400 transition hover:text-ink-200"
                        aria-label={
                          txDateSort === 'asc'
                            ? 'Date sorted oldest first. Click for newest first.'
                            : 'Date sorted newest first. Click for oldest first.'
                        }
                        title={txDateSort === 'asc' ? 'Oldest first' : 'Newest first'}
                      >
                        Date
                        <svg
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          className={`h-3.5 w-3.5 shrink-0 transition ${
                            txDateSort === 'desc' ? 'rotate-180' : ''
                          }`}
                          aria-hidden
                        >
                          <path
                            fillRule="evenodd"
                            d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>
                    </th>
                    <th className="px-3 py-2">Description</th>
                    <th className={`px-3 py-2 text-right ${adminColSecondary}`}>Debit</th>
                    <th className={`px-3 py-2 text-right ${adminColSecondary}`}>Credit</th>
                    <th className="px-3 py-2 text-right">Balance</th>
                    <th className="w-10 px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {visibleLines.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-ink-400">
                        {txFrom || txTo
                          ? showAllTx
                            ? 'No invoices, quotations, or payments in this date range.'
                            : 'No active transactions in this date range.'
                          : showAllTx
                            ? 'No invoices, quotations, or payments for this client yet.'
                            : 'No active transactions for this client.'}
                      </td>
                    </tr>
                  ) : (
                    visibleLines.map((line, i) => {
                      const openable = Boolean(line.id) && line.type !== 'opening_balance'
                      const open = () => openTransaction(line)
                      const label = statementLineLabel(line)
                      const methodSuffix = statementLineMethodSuffix(line)
                      return (
                        <tr
                          key={`${line.type}-${line.id || i}`}
                          role={openable ? 'link' : undefined}
                          tabIndex={openable ? 0 : undefined}
                          className={`group ${line.inactive ? 'opacity-50' : ''} ${
                            openable ? clickableRowClass : ''
                          }`}
                          onClick={openable ? open : undefined}
                          onKeyDown={openable ? (e) => activateRowKey(e, open) : undefined}
                        >
                          <td className="px-3 py-2 whitespace-nowrap text-ink-300">
                            {line.sortDate}
                          </td>
                          <td className="min-w-0 break-words px-3 py-2 text-ink-200">
                            {openable ? (
                              <span className={clickableDocClass}>{label}</span>
                            ) : (
                              label
                            )}
                            {methodSuffix}
                            {line.inactive ? (
                              <span className="ml-1 text-xs text-red-300">
                                (
                                {line.type === 'quotation'
                                  ? quotationDisplayStatus(line)
                                  : line.status || 'inactive'}
                                )
                              </span>
                            ) : null}
                            <span className="mt-0.5 block text-xs text-ink-500 sm:hidden">
                              {line.debit
                                ? `Debit ${formatPula(line.debit)}`
                                : line.credit
                                  ? `Credit ${formatPula(line.credit)}`
                                  : null}
                            </span>
                          </td>
                          <td
                            className={`px-3 py-2 text-right tabular-nums text-ink-300 ${adminColSecondary}`}
                          >
                            {line.debit ? formatPula(line.debit) : '—'}
                          </td>
                          <td
                            className={`px-3 py-2 text-right tabular-nums text-ink-300 ${adminColSecondary}`}
                          >
                            {line.credit ? formatPula(line.credit) : '—'}
                          </td>
                          <td
                            className={`px-3 py-2 text-right tabular-nums font-medium ${
                              line.inactive ? 'text-ink-500' : balanceClass(line.balance)
                            }`}
                          >
                            {line.inactive ? '—' : formatPula(line.balance)}
                          </td>
                          <td
                            className="px-1 py-1 text-right"
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                            <ActionsMenu
                              items={transactionMenuItems(line)}
                              align="right"
                              label="Transaction actions"
                            />
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-bold text-white">Clients</h1>
            <button
              type="button"
              onClick={() => setShowAllClients((v) => !v)}
              aria-pressed={showAllClients}
              aria-label={showAllClients ? 'Showing all clients' : 'Showing active clients only'}
              className="relative inline-flex h-6 w-[4.5rem] shrink-0 items-center rounded-md border border-white/15 bg-ink-900/80 p-0.5 transition hover:bg-white/10"
            >
              <span
                aria-hidden="true"
                className={`absolute inset-y-0.5 left-0.5 w-[calc(50%-0.125rem)] rounded border border-brand-500/35 bg-brand-500/20 transition-transform duration-200 ${
                  showAllClients ? 'translate-x-[calc(100%+0.125rem)]' : 'translate-x-0'
                }`}
              />
              <span
                className={`relative z-10 flex-1 text-center text-[10px] font-semibold leading-none transition ${
                  !showAllClients ? 'text-brand-200' : 'text-ink-500'
                }`}
              >
                Active
              </span>
              <span
                className={`relative z-10 flex-1 text-center text-[10px] font-semibold leading-none transition ${
                  showAllClients ? 'text-brand-200' : 'text-ink-500'
                }`}
              >
                All
              </span>
            </button>
          </div>
          <p className="mt-1 text-sm text-ink-300">
            {view === 'directory'
              ? 'Capture core client details. Manage client information and contact details for easy tracking and communication.'
              : 'Select a client to see their balance, quotations, and invoice / payment history.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-white/10 bg-ink-900 p-0.5 shadow-inner shadow-black/40">
            <button
              type="button"
              onClick={() => {
                setView('directory')
                setShowForm(false)
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                view === 'directory'
                  ? 'bg-brand-500 text-ink-950'
                  : 'text-ink-300 hover:text-white'
              }`}
            >
              Directory
            </button>
            <button
              type="button"
              onClick={() => {
                setView('accounts')
                setShowForm(false)
                setViewId(null)
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                view === 'accounts'
                  ? 'bg-brand-500 text-ink-950'
                  : 'text-ink-300 hover:text-white'
              }`}
            >
              Accounts
            </button>
          </div>
          {!showForm && !viewing ? (
            <button type="button" onClick={startNew} className={adminBtnPrimary}>
              New client
            </button>
          ) : null}
        </div>
      </div>

      {viewing && !showForm && view === 'directory' ? (
        <section className="rounded-2xl border border-white/10 bg-ink-900/40 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-white">{viewing.name}</h2>
              <p className="mt-1 text-xs text-ink-400">
                Client profile ·{' '}
                <span className={viewing.is_active === false ? 'text-red-300' : 'text-brand-300'}>
                  {viewing.is_active === false ? 'Inactive' : 'Active'}
                </span>
              </p>
            </div>
            <div className="flex items-center gap-1">
              <AdminIconAction
                label="Edit"
                icon="pencil"
                onClick={() => startEdit(viewing)}
              />
              <AdminIconAction
                label="Close"
                icon="x"
                tone="muted"
                onClick={closeViewProfile}
              />
            </div>
          </div>

          <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <DetailField label="First name">{dash(viewing.first_name)}</DetailField>
            <DetailField label="Middle name">{dash(viewing.middle_name)}</DetailField>
            <DetailField label="Last name">{dash(viewing.surname)}</DetailField>
            <DetailField label="Gender">{genderLabel(viewing.gender)}</DetailField>
            <DetailField label="ID number">{dash(viewing.id_number)}</DetailField>
            <DetailField label="Country">{dash(viewing.country)}</DetailField>
            <DetailField label="Email">{dash(viewing.email)}</DetailField>
            <DetailField label="Cellphone">{dash(viewing.cellphone || viewing.phone)}</DetailField>
            <DetailField label="Landline">{dash(viewing.landline)}</DetailField>
            <DetailField label="Postal address" className="sm:col-span-2 lg:col-span-3">
              {dash(viewing.postal_address)}
            </DetailField>
            <DetailField label="Physical address" className="sm:col-span-2 lg:col-span-3">
              {dash(viewing.physical_address || viewing.address)}
            </DetailField>
            <DetailField label="Notes" className="sm:col-span-2 lg:col-span-3">
              {dash(viewing.notes)}
            </DetailField>
          </dl>
        </section>
      ) : null}

      {showForm && view === 'directory' ? (
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="space-y-3 rounded-2xl border border-white/10 bg-ink-900/40 p-4 sm:p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">
              {editingId ? 'Edit client' : 'New client'}
            </h2>
            <button type="button" onClick={closeForm} className={adminBtnSecondary}>
              Close
            </button>
          </div>
          <ClientRegistrationFields form={form} setForm={setForm} fieldClass={adminFieldClass} />
          {canEditOpeningOnForm || (!editingId && staffLike) ? (
            <div className="space-y-3 rounded-xl border border-white/10 bg-ink-950/40 p-3 sm:p-4">
              <div>
                <p className="text-sm font-semibold text-white">Opening balance</p>
                <p className="mt-1 text-xs text-ink-400">
                  Carry-in amount as of a date. Positive means the client owes iTreq (same as an
                  invoice).
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                    Amount (P)
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    className={adminFieldClass}
                    value={form.opening_balance}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, opening_balance: e.target.value }))
                    }
                    placeholder="0.00"
                  />
                </label>
                <div className="block text-sm text-ink-300">
                  <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                    As of date
                  </span>
                  <YearMonthDaySelect
                    value={form.opening_balance_date || ''}
                    onChange={(next) =>
                      setForm((f) => ({ ...f, opening_balance_date: next }))
                    }
                  />
                </div>
              </div>
            </div>
          ) : Number(form.opening_balance) ? (
            <p className="rounded-xl border border-white/10 bg-ink-950/40 px-3 py-2 text-sm text-ink-300">
              Opening balance:{' '}
              <span className="font-semibold text-white">
                {formatPula(form.opening_balance)}
              </span>
              {form.opening_balance_date ? (
                <span className="text-ink-500"> · as of {form.opening_balance_date}</span>
              ) : null}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={saving} className={adminBtnPrimary}>
              {saving ? 'Saving…' : editingId ? 'Update client' : 'Add client'}
            </button>
            <button type="button" onClick={closeForm} className={adminBtnSecondary}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {view === 'directory' ? (
        <div className="space-y-3">
          <label className="block max-w-md">
            <span className="sr-only">Search clients</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, phone, email, or ID…"
              className={adminFieldClass}
              autoComplete="off"
            />
          </label>
          <div className={adminTableShellClass}>
          <table className={adminTableClass}>
            <thead className="bg-ink-900/80 text-xs uppercase tracking-wider text-ink-400">
              <tr>
                <th className="min-w-[11rem] px-4 py-3 sm:min-w-[14rem]">Name</th>
                <th className={`px-4 py-3 ${adminColSecondary}`}>ID</th>
                <th className="whitespace-nowrap px-4 py-3">Phone</th>
                <th className={`px-4 py-3 ${adminColSecondary}`}>Email</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-ink-400">
                    Loading…
                  </td>
                </tr>
              ) : clients.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-ink-400">
                    No clients yet.
                  </td>
                </tr>
              ) : filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-ink-400">
                    No clients match your search.
                  </td>
                </tr>
              ) : (
                filteredClients.map((c) => {
                  const open = () => openClientDetails(c)
                  return (
                    <tr
                      key={c.id}
                      data-row-id={c.id}
                      role="link"
                      tabIndex={0}
                      className={`group bg-ink-900/20 ${clickableRowClass} ${
                        c.is_active === false ? 'opacity-60' : ''
                      }${highlightId === c.id ? ' ring-2 ring-amber-400/60' : ''}`}
                      onClick={open}
                      onKeyDown={(e) => activateRowKey(e, open)}
                    >
                      <td className="min-w-[11rem] px-4 py-3 sm:min-w-[14rem]">
                        <span
                          className={`${clickableDocClass} break-words [overflow-wrap:anywhere]`}
                        >
                          {c.name}
                        </span>
                        {c.is_active === false ? (
                          <span className="ml-2 text-xs text-red-300">Inactive</span>
                        ) : null}
                      </td>
                      <td className={`px-4 py-3 text-ink-300 ${adminColSecondary}`}>
                        {c.id_number || '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-ink-300">
                        {c.cellphone || c.phone || '—'}
                      </td>
                      <td className={`max-w-[10rem] px-4 py-3 text-ink-300 sm:max-w-[14rem] ${adminColSecondary}`}>
                        {c.email ? (
                          <span className="block truncate" title={c.email}>
                            {c.email}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <ClientRowActions
                          label={`Actions for ${c.name}`}
                          items={clientMenuItems(c)}
                        />
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2.5">
            <label className="block min-w-[10rem] max-w-sm flex-1">
              <span className="sr-only">Search clients</span>
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search clients…"
                className={`${adminFieldClass} py-1.5 text-[13px]`}
                autoComplete="off"
              />
            </label>
            <YearMonthDaySelect
              size="compact"
              label="From"
              value={txFrom}
              onChange={setTxFrom}
              maxYmd={rangeTodayIso()}
              className="w-[14rem] shrink-0"
            />
            <YearMonthDaySelect
              size="compact"
              label="To"
              value={txTo}
              onChange={setTxTo}
              maxYmd={endOfNextMonthIso()}
              className="w-[14rem] shrink-0"
            />
            <button
              type="button"
              disabled={!txFrom && !txTo}
              onClick={() => {
                setTxFrom('')
                setTxTo('')
              }}
              className={`${adminBtnSecondary} px-3 py-1.5 text-[13px]`}
            >
              Clear
            </button>
          </div>
          {txRangeBackwards ? (
            <p className="text-sm text-amber-200">The “From” date is after the “To” date.</p>
          ) : null}
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-ink-900 lg:grid lg:max-h-[70vh] lg:grid-cols-[minmax(0,17rem)_1fr] lg:items-stretch">
          {/* Mobile: detail panel inline below the selected client */}
          <div className="lg:hidden" data-accounts-client-list>
            <div
              data-accounts-client-list-header
              className="sticky top-0 z-10 border-b border-white/10 bg-ink-900 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-ink-400"
            >
              Clients
            </div>
            {renderAccountsClientListEmpty() ?? (
              <ul className="py-3">
                {filteredClients.map((c) => (
                  <Fragment key={c.id}>
                    <li>{renderAccountsClientButton(c)}</li>
                    {c.id === selectedId ? (
                      <li className="border-b border-white/10">{renderAccountsDetailPanel()}</li>
                    ) : null}
                  </Fragment>
                ))}
              </ul>
            )}
          </div>

          {/* Desktop: client list + detail pane */}
          <aside
            data-accounts-client-list
            className="admin-scroll hidden min-h-0 overflow-y-auto border-b border-white/10 lg:block lg:border-b-0"
          >
            <div
              data-accounts-client-list-header
              className="sticky top-0 z-10 border-b border-white/10 bg-ink-900 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-ink-400"
            >
              Clients
            </div>
            {renderAccountsClientListEmpty() ?? (
              <ul className="py-3">
                {filteredClients.map((c) => (
                  <li key={c.id}>{renderAccountsClientButton(c)}</li>
                ))}
              </ul>
            )}
          </aside>

          <section className="admin-scroll hidden min-h-0 min-w-0 overflow-y-auto lg:flex lg:flex-col">
            {renderAccountsDetailPanel({ className: 'flex-1' })}
          </section>
        </div>
        </div>
      )}

      {openingBalanceDialogs}

      {stmtModalClient ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-ink-950/50 backdrop-blur-[2px]"
            aria-label="Close dialog"
            onClick={closeStatementRangeModal}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="statement-range-title"
            className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-ink-900 p-5 shadow-xl"
          >
            <h2 id="statement-range-title" className="text-base font-semibold text-white">
              Print statement
            </h2>
            <p className="mt-1 text-sm text-ink-300">
              Choose the period for{' '}
              <span className="text-ink-100">{stmtModalClient.name}</span>.
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-2.5">
              <YearMonthDaySelect
                size="compact"
                label="From"
                value={stmtFrom}
                onChange={setStmtFrom}
                className="w-[14rem] shrink-0"
              />
              <YearMonthDaySelect
                size="compact"
                label="To"
                value={stmtTo}
                onChange={setStmtTo}
                className="w-[14rem] shrink-0"
              />
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={printingStmt}
                onClick={closeStatementRangeModal}
                className={adminBtnSecondary}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={printingStmt || !stmtFrom || !stmtTo}
                onClick={() =>
                  printClientStatement(stmtModalClient.id, stmtFrom, stmtTo)
                }
                className={adminBtnPrimary}
              >
                {printingStmt ? 'Opening…' : 'Open statement'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
