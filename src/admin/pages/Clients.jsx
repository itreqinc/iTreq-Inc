import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { opsApi } from '../../lib/opsApi'
import { clientToForm, emptyClientForm } from '../../lib/clientRegistration'
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
import { ActionsMenu } from '../ActionsMenu'
import { useOpsAlert } from '../OpsAlertContext'
import { adminBtnPrimary, adminBtnSecondary, adminFieldClass, activateRowKey, clickableDocClass, clickableRowClass, formatPula } from '../ui'

function balanceClass(balance) {
  const n = Number(balance) || 0
  if (n > 0.001) return 'text-amber-200'
  if (n < -0.001) return 'text-emerald-300'
  return 'text-ink-300'
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

  async function printClientStatement(clientId) {
    const opened = openStatementDocumentPrintWindow()
    if (!opened.ok) {
      showError(opened.message)
      return
    }
    const { win } = opened
    setPrintingStmt(true)
    const [stmtRes, settingsRes] = await Promise.all([
      opsApi.getClientStatement({ client_id: clientId }),
      opsApi.getSettings(),
    ])
    setPrintingStmt(false)
    if (stmtRes.error || settingsRes.error) {
      closeStatementDocumentPrintWindow(win)
      showError(stmtRes.error?.message || settingsRes.error?.message)
      return
    }
    const { model } = prepareStatementDocument({
      statement: stmtRes.data,
      settings: settingsRes.data,
    })
    const result = fillStatementDocumentPrintWindow(win, model)
    if (!result.ok) showError(result.message)
  }

  function clientMenuItems(client) {
    return [
      {
        label: 'Edit client',
        onClick: () => startEdit(client),
      },
      {
        label: 'New invoice',
        onClick: () => navigate(`/admin/invoices?client=${client.id}`),
      },
      {
        label: 'Record payment',
        onClick: () => navigate(`/admin/payments?client=${client.id}`),
      },
      {
        label: printingStmt ? 'Opening statement…' : 'Print statement',
        disabled: printingStmt,
        onClick: () => printClientStatement(client.id),
      },
    ]
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
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-ink-900/80 text-xs uppercase tracking-wider text-ink-400">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Email</th>
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
                clients.map((c) => (
                  <tr key={c.id} className="bg-ink-900/20">
                    <td className="px-4 py-3 font-medium text-white">{c.name}</td>
                    <td className="px-4 py-3 text-ink-300">{c.id_number || '—'}</td>
                    <td className="px-4 py-3 text-ink-300">{c.cellphone || c.phone || '—'}</td>
                    <td className="px-4 py-3 text-ink-300">{c.email || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => startEdit(c)}
                        className="text-xs font-semibold text-brand-400 hover:text-brand-300"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-ink-900 lg:grid lg:grid-cols-[minmax(0,17rem)_1fr]">
          <aside className="max-h-[70vh] overflow-y-auto border-b border-white/10 lg:border-b-0">
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
                    <li
                      key={c.id}
                      className={`flex items-stretch gap-0 ${
                        active ? 'accounts-tab-active' : 'hover:bg-white/5'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedId(c.id)}
                        className={`flex min-w-0 flex-1 items-start justify-between gap-2 px-3 py-2.5 text-left text-sm ${
                          active ? 'text-white' : 'text-ink-200'
                        }`}
                      >
                        <span className="min-w-0 font-medium leading-snug">{c.name}</span>
                        <span
                          className={`shrink-0 self-center text-xs font-semibold tabular-nums ${balanceClass(c.balance)}`}
                        >
                          {formatPula(c.balance)}
                        </span>
                      </button>
                      <div className="flex items-center pr-1">
                        <ActionsMenu
                          items={clientMenuItems(c)}
                          align="right"
                          label={`Actions for ${c.name}`}
                        />
                      </div>
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
                  <div className="flex flex-wrap gap-2">
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
                    <button
                      type="button"
                      onClick={() => selectedClient && startEdit(selectedClient)}
                      className={adminBtnSecondary}
                    >
                      Edit client
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-white/10 bg-ink-950/30">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-ink-950/50 text-xs uppercase tracking-wider text-ink-400">
                      <tr>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Description</th>
                        <th className="px-3 py-2 text-right">Debit</th>
                        <th className="px-3 py-2 text-right">Credit</th>
                        <th className="px-3 py-2 text-right">Balance</th>
                        <th className="px-2 py-2 w-10" />
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
                            <td className="px-3 py-2 text-ink-200">
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
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-ink-300">
                              {line.debit ? formatPula(line.debit) : '—'}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-ink-300">
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
    </div>
  )
}
