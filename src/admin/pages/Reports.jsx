import { useCallback, useEffect, useState } from 'react'
import { opsApi } from '../../lib/opsApi'
import { paymentMethodLabel } from '../../lib/payments'
import {
  openStatementDocumentPrintWindow,
  closeStatementDocumentPrintWindow,
  fillStatementDocumentPrintWindow,
  prepareStatementDocument,
} from '../../lib/statementDocument'
import { useOpsAlert } from '../OpsAlertContext'
import { YearMonthDaySelect } from '../../components/YearMonthDaySelect'
import { adminBtnPrimary, adminBtnSecondary, adminFieldClass, formatPula } from '../ui'

function monthStartIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

export default function ReportsPage() {
  const { showError } = useOpsAlert()
  const [clients, setClients] = useState([])

  const [compareFrom, setCompareFrom] = useState(monthStartIso())
  const [compareTo, setCompareTo] = useState(todayIso())
  const [compare, setCompare] = useState(null)
  const [compareLoading, setCompareLoading] = useState(false)

  const [incomeFrom, setIncomeFrom] = useState(monthStartIso())
  const [incomeTo, setIncomeTo] = useState(todayIso())
  const [income, setIncome] = useState(null)
  const [incomeLoading, setIncomeLoading] = useState(false)

  const [stmtClient, setStmtClient] = useState('')
  const [stmtFrom, setStmtFrom] = useState(monthStartIso())
  const [stmtTo, setStmtTo] = useState(todayIso())
  const [statement, setStatement] = useState(null)
  const [stmtLoading, setStmtLoading] = useState(false)
  const [stmtPrinting, setStmtPrinting] = useState(false)

  useEffect(() => {
    opsApi.listClients().then(({ data, error }) => {
      if (error) showError(error.message)
      else setClients(data || [])
    })
  }, [showError])

  const runCompare = useCallback(async () => {
    setCompareLoading(true)
    const { data, error } = await opsApi.getExpectedVsCollectedReport({
      from: compareFrom,
      to: compareTo,
    })
    setCompareLoading(false)
    if (error) {
      showError(error.message)
      return
    }
    setCompare(data)
  }, [compareFrom, compareTo, showError])

  const runIncome = useCallback(async () => {
    setIncomeLoading(true)
    const { data, error } = await opsApi.getIncomeReport({
      from: incomeFrom,
      to: incomeTo,
    })
    setIncomeLoading(false)
    if (error) {
      showError(error.message)
      return
    }
    setIncome(data)
  }, [incomeFrom, incomeTo, showError])

  const runStatement = useCallback(async () => {
    if (!stmtClient) {
      showError('Select a client for the statement.')
      return
    }
    setStmtLoading(true)
    const { data, error } = await opsApi.getClientStatement({
      client_id: stmtClient,
      from: stmtFrom,
      to: stmtTo,
    })
    setStmtLoading(false)
    if (error) {
      showError(error.message)
      return
    }
    setStatement({
      ...data,
      lines: (data.lines || []).filter((l) => !l.inactive),
    })
  }, [stmtClient, stmtFrom, stmtTo, showError])

  async function printStatement() {
    if (!statement) return

    const opened = openStatementDocumentPrintWindow()
    if (!opened.ok) {
      showError(opened.message)
      return
    }
    const { win } = opened

    setStmtPrinting(true)
    const settingsRes = await opsApi.getSettings()
    setStmtPrinting(false)
    if (settingsRes.error) {
      closeStatementDocumentPrintWindow(win)
      showError(settingsRes.error.message)
      return
    }

    const { model } = prepareStatementDocument({
      statement,
      settings: settingsRes.data,
    })
    const result = fillStatementDocumentPrintWindow(win, model)
    if (!result.ok) showError(result.message)
  }

  return (
    <div className="space-y-8 print:space-y-4">
      <div className="print:hidden">
        <h1 className="font-display text-2xl font-bold text-white">Reports</h1>
        <p className="mt-1 text-sm text-ink-300">
          Compare invoices issued (expected) with payments collected, plus income totals and client
          statements.
        </p>
      </div>

      <section className="space-y-3 print:hidden">
        <div className="max-w-3xl rounded-2xl border border-white/10 bg-ink-900/40 p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-white">Expected vs collected</h2>
          <p className="mt-1 text-xs text-ink-400">
            <strong className="text-ink-300">Expected</strong> = totals of invoices issued in the
            range. <strong className="text-ink-300">Collected</strong> = payments recorded in the
            same range (may include payments on older invoices).
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <YearMonthDaySelect
              label="From"
              value={compareFrom}
              onChange={setCompareFrom}
              showHint={false}
            />
            <YearMonthDaySelect
              label="To"
              value={compareTo}
              onChange={setCompareTo}
              showHint={false}
            />
          </div>
          <button
            type="button"
            disabled={compareLoading}
            onClick={runCompare}
            className={`${adminBtnPrimary} mt-3`}
          >
            {compareLoading ? 'Loading…' : 'Run comparison'}
          </button>
        </div>

        {compare ? (
          <div className="max-w-3xl space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-white/10 bg-ink-950/50 p-3">
                <p className="text-xs uppercase tracking-wider text-ink-400">Expected</p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {formatPula(compare.expected)}
                </p>
                <p className="text-xs text-ink-500">{compare.invoiceCount} invoice(s) issued</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-ink-950/50 p-3">
                <p className="text-xs uppercase tracking-wider text-ink-400">Collected</p>
                <p className="mt-1 text-lg font-semibold text-brand-300">
                  {formatPula(compare.collected)}
                </p>
                <p className="text-xs text-ink-500">{compare.paymentCount} payment(s)</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-ink-950/50 p-3">
                <p className="text-xs uppercase tracking-wider text-ink-400">Difference</p>
                <p
                  className={`mt-1 text-lg font-semibold ${
                    compare.gap > 0.001
                      ? 'text-amber-200'
                      : compare.gap < -0.001
                        ? 'text-brand-300'
                        : 'text-white'
                  }`}
                >
                  {formatPula(compare.gap)}
                </p>
                <p className="text-xs text-ink-500">
                  {compare.collectionRate != null
                    ? `${compare.collectionRate}% of expected collected`
                    : 'No invoices in range'}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-ink-950/50 p-3">
                <p className="text-xs uppercase tracking-wider text-ink-400">
                  Still owed on those invoices
                </p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {formatPula(compare.outstandingOnExpected)}
                </p>
                <p className="text-xs text-ink-500">
                  Paid to date on them: {formatPula(compare.paidOnExpected)}
                </p>
              </div>
            </div>

            {compare.collectedByMethod?.length ? (
              <div className="rounded-xl border border-white/10 bg-ink-950/50 p-3 text-sm">
                <p className="text-xs uppercase tracking-wider text-ink-400">Collected by method</p>
                <ul className="mt-2 space-y-1 text-ink-300">
                  {compare.collectedByMethod.map((row) => (
                    <li key={row.method} className="flex justify-between gap-4">
                      <span>{paymentMethodLabel(row.method)}</span>
                      <span>{formatPula(row.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="overflow-x-auto rounded-2xl border border-white/10">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-ink-900/80 text-xs uppercase tracking-wider text-ink-400">
                  <tr>
                    <th className="px-4 py-3">Issued</th>
                    <th className="px-4 py-3">Invoice</th>
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Expected</th>
                    <th className="px-4 py-3 text-right">Paid</th>
                    <th className="px-4 py-3 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {compare.invoices.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-ink-400">
                        No issued invoices in this date range.
                      </td>
                    </tr>
                  ) : (
                    compare.invoices.map((inv) => (
                      <tr key={inv.id} className="bg-ink-900/20">
                        <td className="px-4 py-3 text-ink-300">{inv.issue_date || '—'}</td>
                        <td className="px-4 py-3 font-medium text-white">
                          {inv.number || '—'}
                        </td>
                        <td className="px-4 py-3 text-ink-300">{inv.client_name}</td>
                        <td className="px-4 py-3 capitalize text-ink-300">{inv.status}</td>
                        <td className="px-4 py-3 text-right text-ink-200">
                          {formatPula(inv.total)}
                        </td>
                        <td className="px-4 py-3 text-right text-ink-300">
                          {formatPula(inv.amount_paid)}
                        </td>
                        <td className="px-4 py-3 text-right text-ink-100">
                          {formatPula(inv.balance)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>

      <section className="max-w-xl space-y-3 rounded-2xl border border-white/10 bg-ink-900/40 p-4 sm:p-5 print:hidden">
        <h2 className="text-sm font-semibold text-white">Income report</h2>
        <p className="text-xs text-ink-400">Totals for recorded payments in a date range only.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <YearMonthDaySelect
            label="From"
            value={incomeFrom}
            onChange={setIncomeFrom}
            showHint={false}
          />
          <YearMonthDaySelect
            label="To"
            value={incomeTo}
            onChange={setIncomeTo}
            showHint={false}
          />
        </div>
        <button
          type="button"
          disabled={incomeLoading}
          onClick={runIncome}
          className={adminBtnPrimary}
        >
          {incomeLoading ? 'Loading…' : 'Run report'}
        </button>
        {income ? (
          <div className="rounded-xl border border-white/10 bg-ink-950/50 p-3 text-sm">
            <p className="text-ink-400">
              {income.from} → {income.to} · {income.paymentCount} payment(s)
            </p>
            <p className="mt-2 text-lg font-semibold text-white">Total: {formatPula(income.total)}</p>
            {income.byMethod.length ? (
              <ul className="mt-2 space-y-1 text-ink-300">
                {income.byMethod.map((row) => (
                  <li key={row.method} className="flex justify-between gap-4">
                    <span>{paymentMethodLabel(row.method)}</span>
                    <span>{formatPula(row.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="max-w-xl rounded-2xl border border-white/10 bg-ink-900/40 p-4 sm:p-5 print:hidden">
          <h2 className="text-sm font-semibold text-white">Client statement</h2>
          <p className="mt-1 text-xs text-ink-400">
            Invoices and payments for one client; opening balance is activity before the start date.
          </p>
          <div className="mt-3 space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">Client</span>
              <select
                className={adminFieldClass}
                value={stmtClient}
                onChange={(e) => setStmtClient(e.target.value)}
              >
                <option value="">Select client…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
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
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={stmtLoading}
                onClick={runStatement}
                className={adminBtnPrimary}
              >
                {stmtLoading ? 'Loading…' : 'Generate statement'}
              </button>
              {statement ? (
                <button
                  type="button"
                  disabled={stmtPrinting}
                  onClick={printStatement}
                  className={adminBtnSecondary}
                >
                  {stmtPrinting ? 'Opening…' : 'Print / Save PDF'}
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {statement ? (
          <div className="max-w-3xl rounded-2xl border border-ink-200 bg-white p-6 text-black shadow-sm">
            <h3 className="text-lg font-bold text-black">Account statement</h3>
            <p className="mt-1 text-sm font-bold text-black">{statement.client?.name}</p>
            <p className="text-sm font-bold text-black">
              Period: {statement.from || '—'} to {statement.to || '—'}
            </p>
            <p className="mt-3 text-sm font-bold text-black">
              Opening balance: {formatPula(statement.openingBalance)}
            </p>
            <table className="mt-4 w-full border-collapse text-sm text-black">
              <thead>
                <tr className="border-b border-black/20 text-left text-xs uppercase text-black">
                  <th className="py-2 pr-2 font-bold">Date</th>
                  <th className="py-2 pr-2 font-bold">Description</th>
                  <th className="py-2 pr-2 text-right font-bold">Debit</th>
                  <th className="py-2 pr-2 text-right font-bold">Credit</th>
                  <th className="py-2 text-right font-bold">Balance</th>
                </tr>
              </thead>
              <tbody>
                {statement.lines.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-4 text-black/50">
                      No activity in this period.
                    </td>
                  </tr>
                ) : (
                  statement.lines.map((line, i) => (
                    <tr key={i} className="border-b border-black/10">
                      <td className="py-2 pr-2">{line.sortDate}</td>
                      <td className="py-2 pr-2">
                        {line.type === 'invoice' ? `Invoice ${line.label}` : `Payment ${line.label}`}
                        {line.method ? ` (${paymentMethodLabel(line.method)})` : ''}
                      </td>
                      <td className="py-2 pr-2 text-right">
                        {line.debit ? formatPula(line.debit) : '—'}
                      </td>
                      <td className="py-2 pr-2 text-right">
                        {line.credit ? formatPula(line.credit) : '—'}
                      </td>
                      <td className="py-2 text-right">{formatPula(line.balance)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-black">
                  <td className="py-3 pr-2 font-bold" colSpan={2}>
                    Period totals
                  </td>
                  <td className="py-3 pr-2 text-right font-bold">
                    {formatPula(statement.periodCharges)}
                  </td>
                  <td className="py-3 pr-2 text-right font-bold">
                    {formatPula(statement.periodCredits)}
                  </td>
                  <td className="py-3 text-right font-bold">
                    {formatPula(statement.closingBalance)}
                  </td>
                </tr>
              </tfoot>
            </table>
            <p className="mt-4 text-base font-bold text-black">
              Closing balance: {formatPula(statement.closingBalance)}
            </p>
          </div>
        ) : null}
      </section>
    </div>
  )
}
