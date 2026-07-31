import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { isAdmin } from '../../lib/authConfig'
import { opsApi } from '../../lib/opsApi'
import { upsertById, removeById } from '../../lib/listState'
import { clientToForm,
  emptyClientForm } from '../../lib/clientRegistration'
import { validateClientForm } from '../../lib/clientValidation'
import { paymentMethodLabel } from '../../lib/payments'
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
  const { user } = useAuth()
  const admin = isAdmin(user?.role)
  const { showError, showSuccess, showWarning, confirm } = useOpsAlert()
  const [view, setView] = useState('directory')
  // Directory filter: default to active clients only.
  const [showAllClients, setShowAllClients] = useState(false)
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(emptyClientForm)
  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const { formRef, highlightId, scrollToForm, highlightRow } = useScrollAndHighlight()
  const [printingStmt, setPrintingStmt] = useState(false)
  const [stmtModalClient, setStmtModalClient] = useState(null)
  const [stmtFrom, setStmtFrom] = useState(monthStartIso)
  const [stmtTo, setStmtTo] = useState(todayIso)
  const [openingModalClient, setOpeningModalClient] = useState(null)
  const [openingAmount, setOpeningAmount] = useState('')
  const [openingDate, setOpeningDate] = useState('')
  const [openingSaving, setOpeningSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const [selectedId, setSelectedId] = useState(null)
  const [statement, setStatement] = useState(null)
  const [stmtLoading, setStmtLoading] = useState(false)
  const [showAllTx, setShowAllTx] = useState(false)
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

  useEffect(() => {
    load()
  }, [load])

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
    if (!filteredClients.length) {
      if (selectedId) setSelectedId(null)
      return
    }
    if (!selectedId || !filteredClients.some((c) => c.id === selectedId)) {
      setSelectedId(filteredClients[0]?.id || null)
    }
  }, [view, filteredClients, selectedId])

  function startNew() {
    setEditingId(null)
    setForm(emptyClientForm())
    setShowForm(true)
    setView('directory')
    scrollToForm()
  }

  function startEdit(client) {
    setEditingId(client.id)
    setForm(clientToForm(client))
    setShowForm(true)
    setView('directory')
    scrollToForm()
  }

  function closeForm(savedId) {
    setEditingId(null)
    setForm(emptyClientForm())
    setShowForm(false)
    if (savedId) highlightRow(savedId)
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

  function openOpeningBalanceModal(client) {
    const amount = Number(client.opening_balance)
    setOpeningAmount(
      Number.isFinite(amount) && amount !== 0 ? String(amount) : amount === 0 ? '0' : '',
    )
    setOpeningDate(
      client.opening_balance_date ? String(client.opening_balance_date).slice(0, 10) : '',
    )
    setOpeningModalClient(client)
  }

  function closeOpeningBalanceModal() {
    if (openingSaving) return
    setOpeningModalClient(null)
  }

  async function saveOpeningBalance() {
    if (!openingModalClient) return
    const opening = Math.round((Number(openingAmount) || 0) * 100) / 100
    if (opening !== 0 && !String(openingDate || '').trim()) {
      showWarning('Choose an opening balance date when the amount is not zero.')
      return
    }

    const formPayload = {
      ...clientToForm(openingModalClient),
      opening_balance: opening === 0 ? '0' : String(opening),
      opening_balance_date: opening === 0 ? '' : openingDate,
    }

    setOpeningSaving(true)
    const { data, error } = await opsApi.updateClient(openingModalClient.id, formPayload)
    setOpeningSaving(false)
    if (error) {
      showError(error.message)
      return
    }

    showSuccess('Opening balance updated.')
    setOpeningModalClient(null)
    setClients((prev) => {
      const existing = prev.find((c) => c.id === data.id)
      return upsertById(prev, {
        ...existing,
        ...data,
        balance: existing?.balance,
        has_financial_records: existing?.has_financial_records,
      })
    })
    // Refresh list balances and on-screen statement for this client.
    if (view === 'accounts') {
      const { data: withBalances } = await opsApi.listClientsWithBalances({
        activeOnly: !showAllClients,
      })
      if (withBalances) setClients(withBalances)
      if (selectedId === data.id) {
        const { data: stmt } = await opsApi.getClientStatement({
          client_id: data.id,
          from: txFrom || undefined,
          to: txTo || undefined,
        })
        if (stmt) setStatement(stmt)
      }
    }
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
    setView('accounts')
  }

  function clientIconActions(client) {
    return {
      onEdit: () => startEdit(client),
      onInvoice: () => navigate(`/admin/invoices?client=${client.id}`),
      onPayment: () => navigate(`/admin/payments?client=${client.id}`),
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
    setClients((prev) => removeById(prev, client.id))
  }

  function clientMenuItems(client) {
    const actions = clientIconActions(client)
    const items = [
      { label: 'Edit client', icon: 'pencil', onClick: actions.onEdit },
      ...(admin
        ? [
            {
              label: 'Opening balance',
              icon: 'payment',
              onClick: () => openOpeningBalanceModal(client),
            },
          ]
        : []),
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
    if (!line?.id) return
    if (line.type === 'invoice') navigate(`/admin/invoices?open=${line.id}`)
    else if (line.type === 'payment') navigate(`/admin/payments?open=${line.id}`)
    else if (line.type === 'quotation') navigate(`/admin/quotations?open=${line.id}`)
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
    if (admin) {
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
    showSuccess(
      editingId
        ? "The Client's details have been updated."
        : 'A new Client has been added to the system.',
    )
    const saved = result.data
    closeForm(saved?.id || editingId)
    if (!saved?.id) return
    setClients((prev) => {
      const existing = prev.find((c) => c.id === saved.id)
      return upsertById(prev, {
        ...saved,
        balance: existing?.balance ?? 0,
        has_financial_records: existing?.has_financial_records ?? false,
      })
    })
  }

  const selectedClient = clients.find((c) => c.id === selectedId)

  const visibleLines = useMemo(() => {
    const lines = statement?.lines || []
    if (showAllTx) return lines
    // Draft quotations (and any alwaysShow lines) stay visible; they don't affect balance.
    return lines.filter((l) => !l.inactive || l.alwaysShow)
  }, [statement, showAllTx])

  const hasInactive = useMemo(
    () => (statement?.lines || []).some((l) => l.inactive && !l.alwaysShow),
    [statement],
  )

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
          {!showForm ? (
            <button type="button" onClick={startNew} className={adminBtnPrimary}>
              New client
            </button>
          ) : null}
        </div>
      </div>

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
          {admin ? (
            <div className="space-y-3 rounded-xl border border-white/10 bg-ink-950/40 p-3 sm:p-4">
              <div>
                <p className="text-sm font-semibold text-white">Opening balance</p>
                <p className="mt-1 text-xs text-ink-400">
                  Carry-in amount as of a date. Positive means the client owes iTreq (same as an
                  invoice). Only admins can edit this.
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
                <th className="px-4 py-3">Name</th>
                <th className={`px-4 py-3 ${adminColSecondary}`}>ID</th>
                <th className="px-4 py-3">Phone</th>
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
                      <td className="min-w-0 break-words px-4 py-3">
                        <span className={clickableDocClass}>{c.name}</span>
                        {c.is_active === false ? (
                          <span className="ml-2 text-xs text-red-300">Inactive</span>
                        ) : null}
                      </td>
                      <td className={`px-4 py-3 text-ink-300 ${adminColSecondary}`}>
                        {c.id_number || '—'}
                      </td>
                      <td className="px-4 py-3 text-ink-300">{c.cellphone || c.phone || '—'}</td>
                      <td className={`px-4 py-3 text-ink-300 ${adminColSecondary}`}>
                        {c.email || '—'}
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
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-ink-900 lg:grid lg:grid-cols-[minmax(0,17rem)_1fr]">
          <aside className="admin-scroll max-h-[70vh] overflow-y-auto border-b border-white/10 lg:border-b-0">
            <div className="sticky top-0 z-10 border-b border-white/10 bg-ink-900 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-ink-400">
              Clients
            </div>
            {loading ? (
              <p className="px-3 py-6 text-sm text-ink-400">Loading…</p>
            ) : clients.length === 0 ? (
              <p className="px-3 py-6 text-sm text-ink-400">No clients yet.</p>
            ) : filteredClients.length === 0 ? (
              <p className="px-3 py-6 text-sm text-ink-400">No clients match your search.</p>
            ) : (
              <ul className="py-3">
                {filteredClients.map((c) => {
                  const active = c.id === selectedId
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(c.id)}
                        className={`flex w-full items-start justify-between gap-2 px-3 py-2.5 text-left text-sm ${
                          active
                            ? 'accounts-tab-active text-white'
                            : 'text-ink-200 hover:bg-white/5'
                        }`}
                      >
                        <span className="min-w-0 font-medium leading-snug">{c.name}</span>
                        <span
                          className={`shrink-0 self-center text-xs font-semibold tabular-nums ${balanceClass(c.balance)}`}
                        >
                          {formatPula(c.balance)}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </aside>

          <section
            className={`min-h-[16rem] min-w-0 p-4 sm:p-5 ${
              selectedId ? 'accounts-surface' : ''
            }`}
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
                        <span
                          className={`font-semibold ${balanceClass(statement.openingBalance)}`}
                        >
                          {formatPula(statement.openingBalance)}
                        </span>
                      </p>
                    ) : null}
                    <p className="mt-1 text-sm text-ink-300">
                      Closing balance:{' '}
                      <span
                        className={`font-semibold ${balanceClass(statement.closingBalance)}`}
                      >
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
                        <th className="px-3 py-2">Date</th>
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
                          const label =
                            line.type === 'invoice'
                              ? `Invoice ${line.label}`
                              : line.type === 'quotation'
                                ? `Quotation ${line.label}`
                                : line.type === 'opening_balance'
                                  ? line.label || 'Opening balance'
                                  : `Payment ${line.label}`
                          return (
                          <tr
                            key={`${line.type}-${line.id || i}`}
                            role={openable ? 'link' : undefined}
                            tabIndex={openable ? 0 : undefined}
                            className={`group ${line.inactive ? 'opacity-50' : ''} ${
                              openable ? clickableRowClass : ''
                            }`}
                            onClick={openable ? open : undefined}
                            onKeyDown={
                              openable ? (e) => activateRowKey(e, open) : undefined
                            }
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
                              {line.method ? ` (${paymentMethodLabel(line.method)})` : ''}
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
                            <td className={`px-3 py-2 text-right tabular-nums text-ink-300 ${adminColSecondary}`}>
                              {line.debit ? formatPula(line.debit) : '—'}
                            </td>
                            <td className={`px-3 py-2 text-right tabular-nums text-ink-300 ${adminColSecondary}`}>
                              {line.credit ? formatPula(line.credit) : '—'}
                            </td>
                            <td
                              className={`px-3 py-2 text-right tabular-nums font-medium ${
                                line.inactive
                                  ? 'text-ink-500'
                                  : balanceClass(line.balance)
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
          </section>
        </div>
        </div>
      )}

      {openingModalClient ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-ink-950/50 backdrop-blur-[2px]"
            aria-label="Close dialog"
            onClick={closeOpeningBalanceModal}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="opening-balance-title"
            className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-ink-900 p-5 shadow-xl"
          >
            <h2 id="opening-balance-title" className="text-base font-semibold text-white">
              Opening balance
            </h2>
            <p className="mt-1 text-sm text-ink-300">
              Carry-in amount for{' '}
              <span className="text-ink-100">{openingModalClient.name}</span>. Positive means
              they owe iTreq.
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-2.5">
              <label className="block min-w-[8rem] flex-1">
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-ink-400">
                  Amount (P)
                </span>
                <input
                  type="number"
                  step="0.01"
                  className={`${adminFieldClass} py-1.5 text-[13px]`}
                  value={openingAmount}
                  onChange={(e) => setOpeningAmount(e.target.value)}
                  placeholder="0.00"
                />
              </label>
              <YearMonthDaySelect
                size="compact"
                label="As of"
                value={openingDate}
                onChange={setOpeningDate}
                className="w-[14rem] shrink-0"
              />
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={openingSaving}
                onClick={closeOpeningBalanceModal}
                className={adminBtnSecondary}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={openingSaving}
                onClick={saveOpeningBalance}
                className={adminBtnPrimary}
              >
                {openingSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
