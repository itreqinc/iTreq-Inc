import {
  useCallback,
  useEffect,
  useMemo,
  useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { opsApi } from '../../lib/opsApi'
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
import { CountryPhoneInput } from '../../components/CountryPhoneInput'
import { YearMonthDaySelect } from '../../components/YearMonthDaySelect'
import { ActionsMenu } from '../ActionsMenu'
import { useOpsAlert } from '../OpsAlertContext'
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

function ActionIcon({ d, className = 'h-4 w-4' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  )
}

const ICONS = {
  pencil:
    'M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10',
  invoice:
    'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
  payment:
    'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z',
  print:
    'M6.72 13.829V21m0 0h10.56m-10.56 0H4.5A2.25 2.25 0 012.25 18.75V9.75A2.25 2.25 0 014.5 7.5h15a2.25 2.25 0 012.25 2.25v9A2.25 2.25 0 0119.5 21h-2.22m-10.56 0H15M6.72 13.829V7.5A2.25 2.25 0 019 5.25h6a2.25 2.25 0 012.25 2.25v6.329',
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

function ClientRowActions({ onEdit, onInvoice, onPayment, onPrint, printing }) {
  return (
    <div
      className="inline-flex items-center justify-end gap-0.5"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <IconAction label="Edit client" onClick={onEdit}>
        <ActionIcon d={ICONS.pencil} />
      </IconAction>
      <IconAction label="New invoice" onClick={onInvoice}>
        <ActionIcon d={ICONS.invoice} />
      </IconAction>
      <IconAction label="Record payment" onClick={onPayment}>
        <ActionIcon d={ICONS.payment} />
      </IconAction>
      <IconAction
        label={printing ? 'Opening statement…' : 'Print statement'}
        disabled={printing}
        onClick={onPrint}
      >
        <ActionIcon d={ICONS.print} />
      </IconAction>
    </div>
  )
}

export default function ClientsPage() {
  const navigate = useNavigate()
  const { showError, showSuccess, showWarning, confirm } = useOpsAlert()
  const [view, setView] = useState('directory')
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(emptyClientForm)
  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [printingStmt, setPrintingStmt] = useState(false)
  const [stmtModalClient, setStmtModalClient] = useState(null)
  const [stmtFrom, setStmtFrom] = useState(monthStartIso)
  const [stmtTo, setStmtTo] = useState(todayIso)

  const [selectedId, setSelectedId] = useState(null)
  const [statement, setStatement] = useState(null)
  const [stmtLoading, setStmtLoading] = useState(false)
  const [showAllTx, setShowAllTx] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: err } =
      view === 'accounts'
        ? await opsApi.listClientsWithBalances()
        : await opsApi.listClients()
    setLoading(false)
    if (err) {
      showError(err.message)
      return
    }
    setClients(data || [])
  }, [showError, view])

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
    let cancelled = false
    setStmtLoading(true)
    setShowAllTx(false)
    opsApi.getClientStatement({ client_id: selectedId }).then(({ data, error }) => {
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
  }, [view, selectedId, showError])

  useEffect(() => {
    if (view === 'accounts' && clients.length && !selectedId) {
      setSelectedId(clients[0].id)
    }
  }, [view, clients, selectedId])

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function startNew() {
    setEditingId(null)
    setForm(emptyClientForm())
    setShowForm(true)
    setView('directory')
  }

  function startEdit(client) {
    setEditingId(client.id)
    setForm(clientToForm(client))
    setShowForm(true)
    setView('directory')
  }

  function closeForm() {
    setEditingId(null)
    setForm(emptyClientForm())
    setShowForm(false)
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
    closeForm()
    await load()
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
          <h1 className="font-display text-2xl font-bold text-white">Clients</h1>
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
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                  First name *
                </span>
                <input
                  required
                  className={adminFieldClass}
                  value={form.first_name}
                  onChange={(e) => setField('first_name', e.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                  Middle name
                </span>
                <input
                  className={adminFieldClass}
                  value={form.middle_name}
                  onChange={(e) => setField('middle_name', e.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                  Surname *
                </span>
                <input
                  required
                  className={adminFieldClass}
                  value={form.surname}
                  onChange={(e) => setField('surname', e.target.value)}
                />
              </label>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="block w-fit shrink-0">
                <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                  Gender / sex
                </span>
                <select
                  className={`${adminFieldClass} w-[4.5rem] min-w-0 px-2`}
                  value={form.gender}
                  onChange={(e) => setField('gender', e.target.value)}
                >
                  <option value="">—</option>
                  <option value="M">M</option>
                  <option value="F">F</option>
                </select>
              </label>
              <label className="block min-w-0 flex-1">
                <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                  ID / Passport number *
                </span>
                <input
                  required
                  className={adminFieldClass}
                  value={form.id_number}
                  onChange={(e) => setField('id_number', e.target.value)}
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="sm:col-span-2 lg:col-span-3">
                <CountryPhoneInput
                  required
                  country={form.country}
                  phone={form.cellphone}
                  onChange={({ country, phone }) =>
                    setForm((f) => ({ ...f, country, cellphone: phone }))
                  }
                />
              </div>

              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                  Email *
                </span>
                <input
                  required
                  type="email"
                  className={adminFieldClass}
                  value={form.email}
                  onChange={(e) => setField('email', e.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                  Landline
                </span>
                <input
                  className={adminFieldClass}
                  value={form.landline}
                  onChange={(e) => setField('landline', e.target.value)}
                />
              </label>
              <label className="block sm:col-span-2 lg:col-span-3">
                <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                  Postal address
                </span>
                <input
                  className={adminFieldClass}
                  value={form.postal_address}
                  onChange={(e) => setField('postal_address', e.target.value)}
                />
              </label>
              <label className="block sm:col-span-2 lg:col-span-3">
                <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                  Physical address
                </span>
                <input
                  className={adminFieldClass}
                  value={form.physical_address}
                  onChange={(e) => setField('physical_address', e.target.value)}
                />
              </label>
              <label className="block sm:col-span-2 lg:col-span-3">
                <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">Notes</span>
                <textarea
                  rows={2}
                  className={`${adminFieldClass} resize-y`}
                  value={form.notes}
                  onChange={(e) => setField('notes', e.target.value)}
                />
              </label>
            </div>
          </div>
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
              ) : (
                clients.map((c) => {
                  const open = () => openClientDetails(c)
                  return (
                    <tr
                      key={c.id}
                      role="link"
                      tabIndex={0}
                      className={`group bg-ink-900/20 ${clickableRowClass}`}
                      onClick={open}
                      onKeyDown={(e) => activateRowKey(e, open)}
                    >
                      <td className="min-w-0 break-words px-4 py-3">
                        <span className={clickableDocClass}>{c.name}</span>
                      </td>
                      <td className={`px-4 py-3 text-ink-300 ${adminColSecondary}`}>
                        {c.id_number || '—'}
                      </td>
                      <td className="px-4 py-3 text-ink-300">{c.cellphone || c.phone || '—'}</td>
                      <td className={`px-4 py-3 text-ink-300 ${adminColSecondary}`}>
                        {c.email || '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <ClientRowActions {...clientIconActions(c)} />
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-ink-900 lg:grid lg:grid-cols-[minmax(0,17rem)_1fr]">
          <aside className="admin-scroll max-h-[70vh] overflow-y-auto border-b border-white/10 lg:border-b-0">
            <div className="sticky top-0 z-10 border-b border-white/10 bg-ink-900 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-ink-400">
              Clients
            </div>
            {loading ? (
              <p className="px-3 py-6 text-sm text-ink-400">Loading…</p>
            ) : clients.length === 0 ? (
              <p className="px-3 py-6 text-sm text-ink-400">No clients yet.</p>
            ) : (
              <ul className="py-3">
                {clients.map((c) => {
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
                      <ClientRowActions {...clientIconActions(selectedClient)} />
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
                            {showAllTx
                              ? 'No invoices, quotations, or payments for this client yet.'
                              : 'No active transactions for this client.'}
                          </td>
                        </tr>
                      ) : (
                        visibleLines.map((line, i) => {
                          const openable = Boolean(line.id)
                          const open = () => openTransaction(line)
                          const label =
                            line.type === 'invoice'
                              ? `Invoice ${line.label}`
                              : line.type === 'quotation'
                                ? `Quotation ${line.label}`
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
      )}

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
            className="relative w-full max-w-md rounded-2xl border border-white/10 bg-ink-900 p-5 shadow-xl"
          >
            <h2 id="statement-range-title" className="text-base font-semibold text-white">
              Print statement
            </h2>
            <p className="mt-1 text-sm text-ink-300">
              Choose the period for{' '}
              <span className="text-ink-100">{stmtModalClient.name}</span>.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <YearMonthDaySelect
                label="From"
                value={stmtFrom}
                onChange={setStmtFrom}
                showHint={false}
              />
              <YearMonthDaySelect
                label="To"
                value={stmtTo}
                onChange={setStmtTo}
                showHint={false}
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
