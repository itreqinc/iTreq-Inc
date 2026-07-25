import {
  useCallback,
  useEffect,
  useId,
  useState,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { opsApi } from '../../lib/opsApi'
import { paymentMethodLabel } from '../../lib/payments'
import {
  openStatementDocumentPrintWindow,
  closeStatementDocumentPrintWindow,
  fillStatementDocumentPrintWindow,
  prepareStatementDocument,
} from '../../lib/statementDocument'
import {
  openExpenseCategoryReportPrintWindow,
  closeExpenseCategoryReportPrintWindow,
  fillExpenseCategoryReportPrintWindow,
  prepareExpenseCategoryReportDocument,
} from '../../lib/expenseCategoryReportDocument'
import {
  openIncomeMethodReportPrintWindow,
  closeIncomeMethodReportPrintWindow,
  fillIncomeMethodReportPrintWindow,
  prepareIncomeMethodReportDocument,
} from '../../lib/incomeMethodReportDocument'
import {
  openProfitAndLossReportPrintWindow,
  closeProfitAndLossReportPrintWindow,
  fillProfitAndLossReportPrintWindow,
  prepareProfitAndLossReportDocument,
} from '../../lib/profitAndLossReportDocument'
import { useOpsAlert } from '../OpsAlertContext'
import { YearMonthDaySelect } from '../../components/YearMonthDaySelect'
import {
  adminBtnPrimary,
  adminBtnSecondary,
  adminFieldClass,
  activateRowKey,
  clickableDocClass,
  clickableRowClass,
  formatPula,
  adminTableShellClass,
  adminTableClass,
  adminColSecondary,
  adminCellPad,
} from '../ui'

function monthStartIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function ChevronIcon({ open }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      className={`mt-0.5 h-4 w-4 shrink-0 text-ink-400 transition-transform duration-300 ease-in-out ${
        open ? 'rotate-90' : 'rotate-0'
      }`}
    >
      <path
        fillRule="evenodd"
        d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function CollapsibleSection({ open, onToggle, title, description, className, children }) {
  const panelId = useId()

  return (
    <section className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="flex w-full items-start gap-2 text-left print:hidden"
      >
        <ChevronIcon open={open} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-white">{title}</span>
          {description ? (
            <span className="mt-1 block text-xs text-ink-400">{description}</span>
          ) : null}
        </span>
      </button>
      <div
        id={panelId}
        aria-hidden={!open}
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out print:!grid-rows-[1fr] print:!opacity-100 ${
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="min-w-0 overflow-hidden">
          <div className={`space-y-3 pt-3 ${open ? '' : 'pointer-events-none print:pointer-events-auto'}`}>
            {children}
          </div>
        </div>
      </div>
    </section>
  )
}

const reportSectionClass =
  'w-full min-w-0 max-w-3xl rounded-2xl border border-white/10 bg-ink-900/40 p-4 sm:p-5'

function DateRangeFields({ from, to, onFromChange, onToChange }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <YearMonthDaySelect label="From" value={from} onChange={onFromChange} />
      <YearMonthDaySelect label="To" value={to} onChange={onToChange} />
    </div>
  )
}

export default function ReportsPage() {
  const navigate = useNavigate()
  const { showError } = useOpsAlert()
  const [clients, setClients] = useState([])

  const [plFrom, setPlFrom] = useState(monthStartIso())
  const [plTo, setPlTo] = useState(todayIso())
  const [pl, setPl] = useState(null)
  const [plLoading, setPlLoading] = useState(false)
  const [plPrinting, setPlPrinting] = useState(false)

  const [compareFrom, setCompareFrom] = useState(monthStartIso())
  const [compareTo, setCompareTo] = useState(todayIso())
  const [compare, setCompare] = useState(null)
  const [compareLoading, setCompareLoading] = useState(false)

  const [incomeFrom, setIncomeFrom] = useState(monthStartIso())
  const [incomeTo, setIncomeTo] = useState(todayIso())
  const [income, setIncome] = useState(null)
  const [incomeLoading, setIncomeLoading] = useState(false)
  const [incomeIncludeZeroMethods, setIncomeIncludeZeroMethods] = useState(false)
  const [incomePrinting, setIncomePrinting] = useState(false)

  const [expenseFrom, setExpenseFrom] = useState(monthStartIso())
  const [expenseTo, setExpenseTo] = useState(todayIso())
  const [expensesReport, setExpensesReport] = useState(null)
  const [expenseLoading, setExpenseLoading] = useState(false)
  const [expenseIncludeZeroCategories, setExpenseIncludeZeroCategories] = useState(false)
  const [expensePrinting, setExpensePrinting] = useState(false)

  const [stmtClient, setStmtClient] = useState('')
  const [stmtFrom, setStmtFrom] = useState(monthStartIso())
  const [stmtTo, setStmtTo] = useState(todayIso())
  const [statement, setStatement] = useState(null)
  const [stmtLoading, setStmtLoading] = useState(false)
  const [stmtPrinting, setStmtPrinting] = useState(false)
  const [openSection, setOpenSection] = useState(null)

  function toggleSection(id) {
    setOpenSection((current) => (current === id ? null : id))
  }

  useEffect(() => {
    opsApi.listClients().then(({ data, error }) => {
      if (error) showError(error.message)
      else setClients(data || [])
    })
  }, [showError])

  const runProfitAndLoss = useCallback(async () => {
    setPlLoading(true)
    const { data, error } = await opsApi.getProfitAndLossReport({
      from: plFrom,
      to: plTo,
    })
    setPlLoading(false)
    if (error) {
      showError(error.message)
      return
    }
    setPl(data)
  }, [plFrom, plTo, showError])

  async function printProfitAndLoss() {
    if (!pl) return

    const opened = openProfitAndLossReportPrintWindow()
    if (!opened.ok) {
      showError(opened.message)
      return
    }
    const { win } = opened

    setPlPrinting(true)
    const settingsRes = await opsApi.getSettings()
    setPlPrinting(false)
    if (settingsRes.error) {
      closeProfitAndLossReportPrintWindow(win)
      showError(settingsRes.error.message)
      return
    }

    const { model } = prepareProfitAndLossReportDocument({
      report: pl,
      settings: settingsRes.data,
    })
    const result = fillProfitAndLossReportPrintWindow(win, model)
    if (!result.ok) showError(result.message)
  }

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

  async function printIncomeByMethod() {
    if (!income) return

    const opened = openIncomeMethodReportPrintWindow()
    if (!opened.ok) {
      showError(opened.message)
      return
    }
    const { win } = opened

    setIncomePrinting(true)
    const settingsRes = await opsApi.getSettings()
    setIncomePrinting(false)
    if (settingsRes.error) {
      closeIncomeMethodReportPrintWindow(win)
      showError(settingsRes.error.message)
      return
    }

    const { model } = prepareIncomeMethodReportDocument({
      report: income,
      settings: settingsRes.data,
      includeZeroMethods: incomeIncludeZeroMethods,
    })
    const result = fillIncomeMethodReportPrintWindow(win, model)
    if (!result.ok) showError(result.message)
  }

  const runExpenses = useCallback(async () => {
    setExpenseLoading(true)
    const { data, error } = await opsApi.getExpensesReport({
      from: expenseFrom,
      to: expenseTo,
    })
    setExpenseLoading(false)
    if (error) {
      showError(error.message)
      return
    }
    setExpensesReport(data)
  }, [expenseFrom, expenseTo, showError])

  async function printExpensesByCategory() {
    if (!expensesReport) return

    const opened = openExpenseCategoryReportPrintWindow()
    if (!opened.ok) {
      showError(opened.message)
      return
    }
    const { win } = opened

    setExpensePrinting(true)
    const settingsRes = await opsApi.getSettings()
    setExpensePrinting(false)
    if (settingsRes.error) {
      closeExpenseCategoryReportPrintWindow(win)
      showError(settingsRes.error.message)
      return
    }

    const { model } = prepareExpenseCategoryReportDocument({
      report: expensesReport,
      settings: settingsRes.data,
      includeZeroCategories: expenseIncludeZeroCategories,
    })
    const result = fillExpenseCategoryReportPrintWindow(win, model)
    if (!result.ok) showError(result.message)
  }

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
    <div className="space-y-6 print:space-y-4">
      <div className="print:hidden">
        <h1 className="font-display text-2xl font-bold text-white">Reports</h1>
        <p className="mt-1 text-sm text-ink-300">
          Compare invoices issued with payments collected, income and expense totals, profit &amp;
          loss, and client statements.
        </p>
      </div>

      <CollapsibleSection
        open={openSection === 'compare'}
        onToggle={() => toggleSection('compare')}
        className={`${reportSectionClass} print:hidden`}
        title="Expected vs collected"
        description={
          <>
            <strong className="text-ink-300">Expected</strong> = totals of invoices issued in the
            range. <strong className="text-ink-300">Collected</strong> = payments recorded in the
            same range (may include payments on older invoices).
          </>
        }
      >
        <DateRangeFields
          from={compareFrom}
          to={compareTo}
          onFromChange={setCompareFrom}
          onToChange={setCompareTo}
        />
        <button
          type="button"
          disabled={compareLoading}
          onClick={runCompare}
          className={adminBtnPrimary}
        >
          {compareLoading ? 'Loading…' : 'Run comparison'}
        </button>

        {compare ? (
          <div className="space-y-4">
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
              <div className="hidden rounded-xl border border-white/10 bg-ink-950/50 p-3 text-sm sm:block">
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

            <div className={adminTableShellClass}>
              <table className={adminTableClass}>
                <thead className="bg-ink-900/80 text-xs uppercase tracking-wider text-ink-400">
                  <tr>
                    <th className={`${adminCellPad} ${adminColSecondary}`}>Issued</th>
                    <th className={adminCellPad}>Invoice</th>
                    <th className={`${adminCellPad} ${adminColSecondary}`}>Client</th>
                    <th className={`${adminCellPad} ${adminColSecondary}`}>Status</th>
                    <th className={`${adminCellPad} text-right`}>Expected</th>
                    <th className={`${adminCellPad} ${adminColSecondary} text-right`}>Paid</th>
                    <th className={`${adminCellPad} text-right`}>Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {compare.invoices.length === 0 ? (
                    <tr>
                      <td colSpan={7} className={`${adminCellPad} text-ink-400`}>
                        No issued invoices in this date range.
                      </td>
                    </tr>
                  ) : (
                    compare.invoices.map((inv) => {
                      const open = () => navigate(`/admin/invoices?open=${inv.id}`)
                      return (
                        <tr
                          key={inv.id}
                          role="link"
                          tabIndex={0}
                          className={`group bg-ink-900/20 ${clickableRowClass}`}
                          onClick={open}
                          onKeyDown={(e) => activateRowKey(e, open)}
                        >
                          <td className={`${adminCellPad} ${adminColSecondary} text-ink-300`}>
                            {inv.issue_date || '—'}
                          </td>
                          <td className={adminCellPad}>
                            <span className={clickableDocClass}>{inv.number || '—'}</span>
                          </td>
                          <td className={`${adminCellPad} ${adminColSecondary} min-w-0 break-words text-ink-300`}>
                            {inv.client_name}
                          </td>
                          <td className={`${adminCellPad} ${adminColSecondary} capitalize text-ink-300`}>
                            {inv.status}
                          </td>
                          <td className={`${adminCellPad} text-right text-ink-200`}>
                            {formatPula(inv.total)}
                          </td>
                          <td className={`${adminCellPad} ${adminColSecondary} text-right text-ink-300`}>
                            {formatPula(inv.amount_paid)}
                          </td>
                          <td className={`${adminCellPad} text-right text-ink-100`}>
                            {formatPula(inv.balance)}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </CollapsibleSection>

      <CollapsibleSection
        open={openSection === 'income'}
        onToggle={() => toggleSection('income')}
        className={`${reportSectionClass} print:hidden`}
        title="Income report"
        description="All payments recorded in a date range, with totals by payment method."
      >
        <DateRangeFields
          from={incomeFrom}
          to={incomeTo}
          onFromChange={setIncomeFrom}
          onToChange={setIncomeTo}
        />
        <button
          type="button"
          disabled={incomeLoading}
          onClick={runIncome}
          className={adminBtnPrimary}
        >
          {incomeLoading ? 'Loading…' : 'Run report'}
        </button>
        {income ? (
          <div className="space-y-4">
            <div className="grid items-start gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-ink-950/50 p-3 text-sm">
                <p className="text-xs uppercase tracking-wider text-ink-400">By method</p>
                {income.byMethod.length ? (
                  <ul className="mt-2 space-y-1 text-ink-300">
                    {income.byMethod.map((row) => (
                      <li key={row.method} className="flex justify-between gap-4">
                        <span>{paymentMethodLabel(row.method)}</span>
                        <span>{formatPula(row.amount)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-ink-500">No payments in this range.</p>
                )}
              </div>
              <div className="rounded-xl border border-white/10 bg-ink-950/50 p-3 text-sm">
                <p className="text-xs uppercase tracking-wider text-ink-400">Total collected</p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {formatPula(income.total)}
                </p>
                <p className="text-xs text-ink-500">
                  {income.from} → {income.to} · {income.paymentCount} payment(s)
                </p>
              </div>
            </div>

            <div className={adminTableShellClass}>
              <table className={adminTableClass}>
                <thead className="bg-ink-900/80 text-xs uppercase tracking-wider text-ink-400">
                  <tr>
                    <th className={adminCellPad}>Date</th>
                    <th className={adminCellPad}>Client</th>
                    <th className={`${adminCellPad} ${adminColSecondary}`}>Method</th>
                    <th className={`${adminCellPad} ${adminColSecondary}`}>Reference</th>
                    <th className={`${adminCellPad} text-right`}>Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {income.payments.length === 0 ? (
                    <tr>
                      <td colSpan={5} className={`${adminCellPad} text-ink-400`}>
                        No payments in this date range.
                      </td>
                    </tr>
                  ) : (
                    income.payments.map((row) => {
                      const open = () => navigate(`/admin/payments?open=${row.id}`)
                      return (
                        <tr
                          key={row.id}
                          role="link"
                          tabIndex={0}
                          className={`group bg-ink-900/20 ${clickableRowClass}`}
                          onClick={open}
                          onKeyDown={(e) => activateRowKey(e, open)}
                        >
                          <td className={`${adminCellPad} text-ink-300`}>{row.payment_date}</td>
                          <td className={`${adminCellPad} min-w-0 break-words text-ink-200`}>
                            {row.client_name}
                          </td>
                          <td className={`${adminCellPad} ${adminColSecondary} text-ink-300`}>
                            {paymentMethodLabel(row.method)}
                          </td>
                          <td className={`${adminCellPad} ${adminColSecondary}`}>
                            <span className={clickableDocClass}>{row.reference || '—'}</span>
                          </td>
                          <td className={`${adminCellPad} text-right font-medium text-ink-100`}>
                            {formatPula(row.amount)}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-ink-950/50 p-3">
              <label className="flex min-w-0 cursor-pointer items-start gap-2 text-sm text-ink-300">
                <input
                  type="checkbox"
                  className="mt-0.5 shrink-0 rounded border-white/20 bg-ink-950 text-brand-500 focus:ring-brand-500/40"
                  checked={incomeIncludeZeroMethods}
                  onChange={(e) => setIncomeIncludeZeroMethods(e.target.checked)}
                />
                <span className="min-w-0">
                  When printing, include all methods (also those with P0)
                </span>
              </label>
              <button
                type="button"
                disabled={incomePrinting}
                onClick={printIncomeByMethod}
                className={`${adminBtnSecondary} shrink-0`}
              >
                {incomePrinting ? 'Opening…' : 'Print / Save PDF'}
              </button>
            </div>
          </div>
        ) : null}
      </CollapsibleSection>

      <CollapsibleSection
        open={openSection === 'expenses'}
        onToggle={() => toggleSection('expenses')}
        className={`${reportSectionClass} print:hidden`}
        title="Expenses report"
        description="All operating expenses recorded in a date range, with totals by category and payment method."
      >
        <DateRangeFields
          from={expenseFrom}
          to={expenseTo}
          onFromChange={setExpenseFrom}
          onToChange={setExpenseTo}
        />
        <button
          type="button"
          disabled={expenseLoading}
          onClick={runExpenses}
          className={adminBtnPrimary}
        >
          {expenseLoading ? 'Loading…' : 'Run report'}
        </button>
        {expensesReport ? (
          <div className="space-y-4">
            <div className="grid items-start gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-ink-950/50 p-3 text-sm">
                <p className="text-xs uppercase tracking-wider text-ink-400">By category</p>
                {expensesReport.byCategory.length ? (
                  <ul className="mt-2 space-y-1 text-ink-300">
                    {expensesReport.byCategory.map((row) => (
                      <li key={row.category} className="flex justify-between gap-4">
                        <span>{row.category}</span>
                        <span>{formatPula(row.amount)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-ink-500">No expenses in this range.</p>
                )}
              </div>
              <div className="rounded-xl border border-white/10 bg-ink-950/50 p-3 text-sm">
                <p className="text-xs uppercase tracking-wider text-ink-400">Total spent</p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {formatPula(expensesReport.total)}
                </p>
                <p className="text-xs text-ink-500">
                  {expensesReport.from} → {expensesReport.to} · {expensesReport.expenseCount}{' '}
                  expense(s)
                </p>
              </div>
            </div>

            {expensesReport.byMethod.length ? (
              <div className="hidden rounded-xl border border-white/10 bg-ink-950/50 p-3 text-sm sm:block">
                <p className="text-xs uppercase tracking-wider text-ink-400">By method</p>
                <ul className="mt-2 space-y-1 text-ink-300">
                  {expensesReport.byMethod.map((row) => (
                    <li key={row.method} className="flex justify-between gap-4">
                      <span>{paymentMethodLabel(row.method)}</span>
                      <span>{formatPula(row.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className={adminTableShellClass}>
              <table className={adminTableClass}>
                <thead className="bg-ink-900/80 text-xs uppercase tracking-wider text-ink-400">
                  <tr>
                    <th className={adminCellPad}>Date</th>
                    <th className={adminCellPad}>Category</th>
                    <th className={`${adminCellPad} ${adminColSecondary}`}>Vendor</th>
                    <th className={`${adminCellPad} ${adminColSecondary}`}>Method</th>
                    <th className={`${adminCellPad} ${adminColSecondary}`}>Reference</th>
                    <th className={`${adminCellPad} text-right`}>Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {expensesReport.expenses.length === 0 ? (
                    <tr>
                      <td colSpan={6} className={`${adminCellPad} text-ink-400`}>
                        No expenses in this date range.
                      </td>
                    </tr>
                  ) : (
                    expensesReport.expenses.map((row) => {
                      const open = () => navigate(`/admin/expenses?open=${row.id}`)
                      return (
                        <tr
                          key={row.id}
                          role="link"
                          tabIndex={0}
                          className={`group bg-ink-900/20 ${clickableRowClass}`}
                          onClick={open}
                          onKeyDown={(e) => activateRowKey(e, open)}
                        >
                          <td className={`${adminCellPad} text-ink-300`}>{row.expense_date}</td>
                          <td className={`${adminCellPad} min-w-0 break-words text-ink-200`}>
                            {row.category_name}
                          </td>
                          <td className={`${adminCellPad} ${adminColSecondary} text-ink-300`}>
                            {row.vendor || '—'}
                          </td>
                          <td className={`${adminCellPad} ${adminColSecondary} text-ink-300`}>
                            {paymentMethodLabel(row.method)}
                          </td>
                          <td className={`${adminCellPad} ${adminColSecondary}`}>
                            <span className={clickableDocClass}>{row.reference || '—'}</span>
                          </td>
                          <td className={`${adminCellPad} text-right font-medium text-ink-100`}>
                            {formatPula(row.amount)}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-ink-950/50 p-3">
              <label className="flex min-w-0 cursor-pointer items-start gap-2 text-sm text-ink-300">
                <input
                  type="checkbox"
                  className="mt-0.5 shrink-0 rounded border-white/20 bg-ink-950 text-brand-500 focus:ring-brand-500/40"
                  checked={expenseIncludeZeroCategories}
                  onChange={(e) => setExpenseIncludeZeroCategories(e.target.checked)}
                />
                <span className="min-w-0">
                  When printing, include all categories (also those with P0)
                </span>
              </label>
              <button
                type="button"
                disabled={expensePrinting}
                onClick={printExpensesByCategory}
                className={`${adminBtnSecondary} shrink-0`}
              >
                {expensePrinting ? 'Opening…' : 'Print / Save PDF'}
              </button>
            </div>
          </div>
        ) : null}
      </CollapsibleSection>

      <CollapsibleSection
        open={openSection === 'pl'}
        onToggle={() => toggleSection('pl')}
        className={`${reportSectionClass} print:hidden`}
        title="Profit & loss"
        description={
          <>
            Cash basis. <strong className="text-ink-300">Revenue</strong> = payments received in the
            range. <strong className="text-ink-300">Costs</strong> = stock purchases (purchase
            orders) plus operating expenses dated in the range.
          </>
        }
      >
        <DateRangeFields
          from={plFrom}
          to={plTo}
          onFromChange={setPlFrom}
          onToChange={setPlTo}
        />
        <button
          type="button"
          disabled={plLoading}
          onClick={runProfitAndLoss}
          className={adminBtnPrimary}
        >
          {plLoading ? 'Loading…' : 'Run report'}
        </button>

        {pl ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-white/10 bg-ink-950/50 p-3">
                <p className="text-xs uppercase tracking-wider text-ink-400">Revenue</p>
                <p className="mt-1 text-lg font-semibold text-brand-300">
                  {formatPula(pl.revenue)}
                </p>
                <p className="text-xs text-ink-500">{pl.paymentCount} payment(s)</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-ink-950/50 p-3">
                <p className="text-xs uppercase tracking-wider text-ink-400">Stock purchases</p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {formatPula(pl.stockPurchases)}
                </p>
                <p className="text-xs text-ink-500">{pl.purchaseOrderCount} purchase order(s)</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-ink-950/50 p-3">
                <p className="text-xs uppercase tracking-wider text-ink-400">Operating expenses</p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {formatPula(pl.operatingExpenses)}
                </p>
                <p className="text-xs text-ink-500">{pl.expenseCount} expense(s)</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-ink-950/50 p-3">
                <p className="text-xs uppercase tracking-wider text-ink-400">Net profit</p>
                <p
                  className={`mt-1 text-lg font-semibold ${
                    pl.netProfit > 0.001
                      ? 'text-brand-300'
                      : pl.netProfit < -0.001
                        ? 'text-amber-200'
                        : 'text-white'
                  }`}
                >
                  {formatPula(pl.netProfit)}
                </p>
                <p className="text-xs text-ink-500">
                  {pl.margin != null ? `${pl.margin}% of revenue` : 'No revenue in range'}
                </p>
              </div>
            </div>

            <div className={adminTableShellClass}>
              <table className={adminTableClass}>
                <tbody className="divide-y divide-white/5">
                  <tr className="bg-ink-900/20">
                    <td className={`${adminCellPad} text-ink-200`}>Revenue (payments received)</td>
                    <td className={`${adminCellPad} text-right font-medium text-brand-300`}>
                      {formatPula(pl.revenue)}
                    </td>
                  </tr>
                  <tr className="bg-ink-900/20">
                    <td className={`${adminCellPad} text-ink-300`}>Less: stock purchases</td>
                    <td className={`${adminCellPad} text-right text-ink-200`}>
                      −{formatPula(pl.stockPurchases)}
                    </td>
                  </tr>
                  <tr className="bg-ink-900/40">
                    <td className={`${adminCellPad} font-semibold text-ink-100`}>Gross profit</td>
                    <td className={`${adminCellPad} text-right font-semibold text-ink-100`}>
                      {formatPula(pl.grossProfit)}
                    </td>
                  </tr>
                  <tr className="bg-ink-900/20">
                    <td className={`${adminCellPad} text-ink-300`}>Less: operating expenses</td>
                    <td className={`${adminCellPad} text-right text-ink-200`}>
                      −{formatPula(pl.operatingExpenses)}
                    </td>
                  </tr>
                  <tr className="border-t-2 border-white/20 bg-ink-900/60">
                    <td className={`${adminCellPad} font-bold text-white`}>Net profit</td>
                    <td
                      className={`${adminCellPad} text-right font-bold ${
                        pl.netProfit >= 0 ? 'text-brand-300' : 'text-amber-200'
                      }`}
                    >
                      {formatPula(pl.netProfit)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {pl.expensesByCategory?.length ? (
              <div className="rounded-xl border border-white/10 bg-ink-950/50 p-3 text-sm">
                <p className="text-xs uppercase tracking-wider text-ink-400">
                  Operating expenses by category
                </p>
                <ul className="mt-2 space-y-1 text-ink-300">
                  {pl.expensesByCategory.map((row) => (
                    <li key={row.category} className="flex justify-between gap-4">
                      <span className="min-w-0 break-words">{row.category}</span>
                      <span className="shrink-0">{formatPula(row.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-ink-950/50 p-3">
              <p className="min-w-0 text-xs text-ink-500">
                {pl.from || '—'} → {pl.to || '—'}. Stock purchases are counted when paid (purchase
                order date), not when sold.
              </p>
              <button
                type="button"
                disabled={plPrinting}
                onClick={printProfitAndLoss}
                className={`${adminBtnSecondary} shrink-0`}
              >
                {plPrinting ? 'Opening…' : 'Print / Save PDF'}
              </button>
            </div>
          </div>
        ) : null}
      </CollapsibleSection>

      <CollapsibleSection
        open={openSection === 'statement'}
        onToggle={() => toggleSection('statement')}
        className={reportSectionClass}
        title="Client statement"
        description="Invoices and payments for one client; opening balance is activity before the start date."
      >
        <div className="space-y-3 print:hidden">
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
          <DateRangeFields
            from={stmtFrom}
            to={stmtTo}
            onFromChange={setStmtFrom}
            onToChange={setStmtTo}
          />
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

        {statement ? (
          <div className="min-w-0 rounded-2xl border border-ink-200 bg-white p-4 text-black shadow-sm sm:p-6">
            <h3 className="text-lg font-bold text-black">Account statement</h3>
            <p className="mt-1 break-words text-sm font-bold text-black">{statement.client?.name}</p>
            <p className="text-sm font-bold text-black">
              Period: {statement.from || '—'} to {statement.to || '—'}
            </p>
            <p className="mt-3 text-sm font-bold text-black">
              Opening balance: {formatPula(statement.openingBalance)}
            </p>
            <div className="mt-4 max-w-full overflow-x-auto">
              <table className="w-full border-collapse text-sm text-black">
                <thead>
                  <tr className="border-b border-black/20 text-left text-xs uppercase text-black">
                    <th className="py-2 pr-2 font-bold">Date</th>
                    <th className="py-2 pr-2 font-bold">Description</th>
                    <th className={`${adminColSecondary} py-2 pr-2 text-right font-bold`}>Debit</th>
                    <th className={`${adminColSecondary} py-2 pr-2 text-right font-bold`}>Credit</th>
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
                        <td className="whitespace-nowrap py-2 pr-2">{line.sortDate}</td>
                        <td className="min-w-0 break-words py-2 pr-2">
                          {line.type === 'invoice' ? `Invoice ${line.label}` : `Payment ${line.label}`}
                          {line.method ? ` (${paymentMethodLabel(line.method)})` : ''}
                          <span className="mt-0.5 block text-xs text-black/55 sm:hidden">
                            {line.debit
                              ? `Debit ${formatPula(line.debit)}`
                              : line.credit
                                ? `Credit ${formatPula(line.credit)}`
                                : null}
                          </span>
                        </td>
                        <td className={`${adminColSecondary} py-2 pr-2 text-right`}>
                          {line.debit ? formatPula(line.debit) : '—'}
                        </td>
                        <td className={`${adminColSecondary} py-2 pr-2 text-right`}>
                          {line.credit ? formatPula(line.credit) : '—'}
                        </td>
                        <td className="whitespace-nowrap py-2 text-right">
                          {formatPula(line.balance)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-black">
                    <td className="py-3 pr-2 font-bold" colSpan={2}>
                      Period totals
                    </td>
                    <td className={`${adminColSecondary} py-3 pr-2 text-right font-bold`}>
                      {formatPula(statement.periodCharges)}
                    </td>
                    <td className={`${adminColSecondary} py-3 pr-2 text-right font-bold`}>
                      {formatPula(statement.periodCredits)}
                    </td>
                    <td className="py-3 text-right font-bold">
                      {formatPula(statement.closingBalance)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="mt-4 text-base font-bold text-black">
              Closing balance: {formatPula(statement.closingBalance)}
            </p>
          </div>
        ) : null}
      </CollapsibleSection>
    </div>
  )
}
