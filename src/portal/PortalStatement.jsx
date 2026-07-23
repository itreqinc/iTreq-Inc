import { useCallback, useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { YearMonthDaySelect } from '../components/YearMonthDaySelect'
import { opsApi } from '../lib/opsApi'
import { paymentMethodLabel } from '../lib/payments'
import {
  openStatementDocumentPrintWindow,
  closeStatementDocumentPrintWindow,
  fillStatementDocumentPrintWindow,
  prepareStatementDocument,
} from '../lib/statementDocument'
import { useOpsAlert } from '../admin/OpsAlertContext'
import { adminBtnPrimary, adminBtnSecondary, formatPula } from '../admin/ui'

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
  const { clientId, client } = useOutletContext()
  const { showError } = useOpsAlert()
  const [from, setFrom] = useState(monthStartIso())
  const [to, setTo] = useState(todayIso())
  const [statement, setStatement] = useState(null)
  const [loading, setLoading] = useState(false)
  const [printing, setPrinting] = useState(false)

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
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">From</span>
          <YearMonthDaySelect value={from} onChange={setFrom} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">To</span>
          <YearMonthDaySelect value={to} onChange={setTo} />
        </label>
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

          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-ink-900/40">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-ink-950/50 text-xs uppercase tracking-wider text-ink-400">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3 text-right">Debit</th>
                  <th className="px-4 py-3 text-right">Credit</th>
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
                  statement.lines.map((line) => (
                    <tr key={`${line.type}-${line.id}`}>
                      <td className="px-4 py-2 whitespace-nowrap text-ink-300">{line.sortDate}</td>
                      <td className="px-4 py-2 text-ink-200">
                        {line.type === 'invoice'
                          ? `Invoice ${line.label}`
                          : `Payment ${line.label}`}
                        {line.method ? ` (${paymentMethodLabel(line.method)})` : ''}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-ink-300">
                        {line.debit ? formatPula(line.debit) : '—'}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-ink-300">
                        {line.credit ? formatPula(line.credit) : '—'}
                      </td>
                      <td
                        className={`px-4 py-2 text-right tabular-nums font-medium ${balanceClass(line.balance)}`}
                      >
                        {formatPula(line.balance)}
                      </td>
                    </tr>
                  ))
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
