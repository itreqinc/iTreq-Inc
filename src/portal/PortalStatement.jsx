import {
  useCallback,
  useEffect,
  useState } from 'react'
import { useNavigate,
  useOutletContext } from 'react-router-dom'
import { YearMonthDaySelect } from '../components/YearMonthDaySelect'
import { opsApi } from '../lib/opsApi'
import { invoiceBalanceDue, paymentMethodLabel } from '../lib/payments'
import {
  openStatementDocumentPrintWindow,
  closeStatementDocumentPrintWindow,
  fillStatementDocumentPrintWindow,
  prepareStatementDocument,
  } from '../lib/statementDocument'
import { buildStatementDocumentModel } from '../lib/statementDocumentHtml'
import { fillDocumentPackPrintWindow } from '../lib/documentPack'
import { useOpsAlert } from '../admin/OpsAlertContext'
import {
  adminBtnPrimary,
  adminBtnSecondary,
  activateRowKey,
  clickableDocClass,
  clickableRowClass,
  formatPula,
  adminTableShellClass,
  adminTableClass,
  adminColSecondary,
} from '../admin/ui'

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

export default function PortalStatement() {
  const navigate = useNavigate()
  const { clientId, client } = useOutletContext()
  const { showError } = useOpsAlert()
  const [from, setFrom] = useState(monthStartIso())
  const [to, setTo] = useState(todayIso())
  const [statement, setStatement] = useState(null)
  const [loading, setLoading] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [packing, setPacking] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await opsApi.getClientStatement({
      client_id: clientId,
      from,
      to,
    })
    setLoading(false)
    if (error) {
      showError(error.message)
      return
    }
    setStatement({
      ...data,
      lines: (data.lines || []).filter((l) => !l.inactive),
    })
  }, [clientId, from, to, showError])

  useEffect(() => {
    load()
  }, [load])

  const printStatement = useCallback(async () => {
    const opened = openStatementDocumentPrintWindow()
    if (!opened.ok) {
      showError(opened.message)
      return
    }
    const { win } = opened
    setPrinting(true)
    const [stmtRes, settingsRes] = await Promise.all([
      opsApi.getClientStatement({ client_id: clientId, from, to }),
      opsApi.getSettings(),
    ])
    setPrinting(false)
    if (stmtRes.error || settingsRes.error) {
      closeStatementDocumentPrintWindow(win)
      showError(stmtRes.error?.message || settingsRes.error?.message)
      return
    }
    const printable = {
      ...stmtRes.data,
      lines: (stmtRes.data.lines || []).filter((l) => !l.inactive),
    }
    const { model } = prepareStatementDocument({
      statement: printable,
      settings: settingsRes.data,
    })
    const result = fillStatementDocumentPrintWindow(win, model)
    if (!result.ok) showError(result.message)
  }, [clientId, from, to, showError])

  /** Statement + every unpaid invoice as one printable file, for accountants and audits. */
  const downloadPack = useCallback(async () => {
    const opened = openStatementDocumentPrintWindow()
    if (!opened.ok) {
      showError(opened.message)
      return
    }
    const { win } = opened
    setPacking(true)

    const [stmtRes, settingsRes, invRes] = await Promise.all([
      opsApi.getClientStatement({ client_id: clientId, from, to }),
      opsApi.getSettings(),
      opsApi.listInvoices({ client_id: clientId, forPortal: true }),
    ])
    if (stmtRes.error || settingsRes.error || invRes.error) {
      setPacking(false)
      closeStatementDocumentPrintWindow(win)
      showError(stmtRes.error?.message || settingsRes.error?.message || invRes.error?.message)
      return
    }

    const openInvoices = (invRes.data || []).filter((inv) => invoiceBalanceDue(inv) > 0.001)
    const bundles = await Promise.all(
      openInvoices.map((inv) =>
        opsApi.getBillingDocumentBundleForClient('invoice', inv.id, clientId),
      ),
    )
    setPacking(false)

    const failed = bundles.find((b) => b.error)
    if (failed) {
      closeStatementDocumentPrintWindow(win)
      showError(failed.error.message)
      return
    }

    const statementModel = buildStatementDocumentModel({
      statement: {
        ...stmtRes.data,
        lines: (stmtRes.data.lines || []).filter((l) => !l.inactive),
      },
      settings: settingsRes.data,
    })

    const result = fillDocumentPackPrintWindow(win, {
      statementModel,
      invoiceModels: bundles.map((b) => b.data.model),
    })
    if (!result.ok) showError(result.message)
  }, [clientId, from, to, showError])

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">Statement</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-white">
          Account statement
        </h1>
        <p className="mt-1 text-sm text-ink-300">
          {client?.name || statement?.client?.name || 'Your account'}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-white/10 bg-ink-900/40 p-4">
        <YearMonthDaySelect label="From" value={from} onChange={setFrom} />
        <YearMonthDaySelect label="To" value={to} onChange={setTo} />
        <button type="button" onClick={load} disabled={loading} className={adminBtnSecondary}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        <button
          type="button"
          onClick={printStatement}
          disabled={printing || loading}
          className={adminBtnPrimary}
        >
          {printing ? 'Loading…' : 'Print / Save PDF'}
        </button>
        <button
          type="button"
          onClick={downloadPack}
          disabled={packing || loading}
          className={adminBtnPrimary}
          title="Statement plus every unpaid invoice in one printable file"
        >
          {packing ? 'Building…' : 'Download pack'}
        </button>
        <p className="w-full text-xs text-ink-400">
          <span className="font-semibold text-ink-300">Download pack</span> puts this statement and
          every unpaid invoice into one A4 file &mdash; handy for your accountant or an audit.
        </p>
      </div>

      {statement ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-ink-900/50 p-4">
              <p className="text-xs uppercase tracking-wider text-ink-400">Opening</p>
              <p className={`mt-1 text-lg font-semibold ${balanceClass(statement.openingBalance)}`}>
                {formatPula(statement.openingBalance)}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-ink-900/50 p-4">
              <p className="text-xs uppercase tracking-wider text-ink-400">Closing</p>
              <p className={`mt-1 text-lg font-semibold ${balanceClass(statement.closingBalance)}`}>
                {formatPula(statement.closingBalance)}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-ink-900/50 p-4">
              <p className="text-xs uppercase tracking-wider text-ink-400">Period</p>
              <p className="mt-1 text-sm text-ink-200">
                Charges {formatPula(statement.periodCharges)} · Credits{' '}
                {formatPula(statement.periodCredits)}
              </p>
            </div>
          </div>

          <div className={`${adminTableShellClass} bg-ink-900/40`}>
            <table className={adminTableClass}>
              <thead className="bg-ink-950/50 text-xs uppercase tracking-wider text-ink-400">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Description</th>
                  <th className={`px-4 py-3 text-right ${adminColSecondary}`}>Debit</th>
                  <th className={`px-4 py-3 text-right ${adminColSecondary}`}>Credit</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {statement.lines.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-ink-400">
                      No transactions in this period.
                    </td>
                  </tr>
                ) : (
                  statement.lines.map((line) => {
                    const openable =
                      Boolean(line.id) && (line.type === 'invoice' || line.type === 'payment')
                    const open = () =>
                      navigate(
                        line.type === 'payment'
                          ? `/portal/payments/${line.id}`
                          : `/portal/invoices/${line.id}`,
                      )
                    const label =
                      line.type === 'invoice'
                        ? `Invoice ${line.label}`
                        : `Payment ${line.label}`
                    return (
                    <tr
                      key={`${line.type}-${line.id}`}
                      role={openable ? 'link' : undefined}
                      tabIndex={openable ? 0 : undefined}
                      className={`group ${openable ? clickableRowClass : ''}`}
                      onClick={openable ? open : undefined}
                      onKeyDown={openable ? (e) => activateRowKey(e, open) : undefined}
                    >
                      <td className="whitespace-nowrap px-4 py-2 text-ink-300">{line.sortDate}</td>
                      <td className="min-w-0 break-words px-4 py-2 text-ink-200">
                        {openable ? (
                          <span className={clickableDocClass}>{label}</span>
                        ) : (
                          label
                        )}
                        {line.method ? ` (${paymentMethodLabel(line.method)})` : ''}
                        <span className="mt-0.5 block text-xs text-ink-500 sm:hidden">
                          {line.debit
                            ? `Debit ${formatPula(line.debit)}`
                            : line.credit
                              ? `Credit ${formatPula(line.credit)}`
                              : null}
                        </span>
                      </td>
                      <td className={`px-4 py-2 text-right tabular-nums text-ink-300 ${adminColSecondary}`}>
                        {line.debit ? formatPula(line.debit) : '—'}
                      </td>
                      <td className={`px-4 py-2 text-right tabular-nums text-ink-300 ${adminColSecondary}`}>
                        {line.credit ? formatPula(line.credit) : '—'}
                      </td>
                      <td
                        className={`px-4 py-2 text-right tabular-nums font-medium ${balanceClass(line.balance)}`}
                      >
                        {formatPula(line.balance)}
                      </td>
                    </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : loading ? (
        <p className="text-sm text-ink-400">Loading statement…</p>
      ) : null}
    </div>
  )
}
