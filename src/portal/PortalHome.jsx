import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import { opsApi } from '../lib/opsApi'
import { statementLineLabel, statementLineMethodSuffix, summarizeReceivables } from '../lib/payments'
import { useOpsAlert } from '../admin/OpsAlertContext'
import {
  activateRowKey,
  adminBtnPrimary,
  adminBtnSecondary,
  adminTableShellClass,
  adminTableClass,
  adminColSecondary,
  clickableDocClass,
  clickableRowClass,
  formatPula,
} from '../admin/ui'

function balanceClass(balance) {
  const n = Number(balance) || 0
  if (n > 0.001) return 'text-amber-200'
  if (n < -0.001) return 'text-emerald-300'
  return 'text-ink-300'
}

/** Plain-language reading of the closing balance. */
function balanceCaption(balance) {
  const n = Number(balance) || 0
  if (n > 0.001) return 'Amount you owe'
  if (n < -0.001) return 'In your favour'
  return 'Your account is settled'
}

export default function PortalHome() {
  const navigate = useNavigate()
  const { clientId, client } = useOutletContext()
  const { showError } = useOpsAlert()
  const [statement, setStatement] = useState(null)
  const [invoices, setInvoices] = useState([])
  const [unreadByInvoice, setUnreadByInvoice] = useState({})
  const [receivables, setReceivables] = useState(null)
  const [credit, setCredit] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      opsApi.getClientStatement({ client_id: clientId }),
      opsApi.listInvoices({ client_id: clientId, forPortal: true }),
      opsApi.getClientCreditBalance(clientId),
      opsApi.listInvoiceUnreadCounts({ role: 'client', client_id: clientId }),
    ]).then(([stmtRes, invRes, creditRes, unreadRes]) => {
      if (cancelled) return
      setLoading(false)
      if (stmtRes.error) {
        showError(stmtRes.error.message)
      } else {
        setStatement(stmtRes.data)
      }
      if (invRes.error) {
        showError(invRes.error.message)
      } else {
        const list = invRes.data || []
        setInvoices(list)
        setReceivables(summarizeReceivables(list))
      }
      if (!creditRes.error) {
        setCredit(creditRes.data?.balance || 0)
      }
      if (unreadRes.error) {
        showError(unreadRes.error.message)
      } else {
        setUnreadByInvoice(unreadRes.data || {})
      }
    })
    return () => {
      cancelled = true
    }
  }, [clientId, showError])

  const unreadInvoices = useMemo(() => {
    return invoices
      .filter((inv) => (unreadByInvoice[inv.id] || 0) > 0)
      .map((inv) => ({
        ...inv,
        unread: unreadByInvoice[inv.id] || 0,
      }))
  }, [invoices, unreadByInvoice])

  const recent = (statement?.lines || [])
    .filter((l) => !l.inactive)
    .slice(-8)
    .reverse()

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">Overview</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-white">
          {client?.name || statement?.client?.name || 'Account'}
        </h1>
        <p className="mt-2 text-sm text-ink-300">
          Closing balance:{' '}
          {loading ? (
            <span className="text-ink-400">Loading…</span>
          ) : (
            <>
              <span className={`font-semibold ${balanceClass(statement?.closingBalance)}`}>
                {formatPula(statement?.closingBalance)}
              </span>
              <span className="text-ink-400"> · {balanceCaption(statement?.closingBalance)}</span>
            </>
          )}
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-red-400/25 bg-red-500/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-red-300">Overdue</p>
          <p className="mt-2 text-xl font-bold tabular-nums text-white">
            {loading ? '—' : formatPula(receivables?.overdue)}
          </p>
          <p className="mt-1 text-xs text-ink-400">
            {loading
              ? 'Checking…'
              : receivables?.overdueCount
                ? `${receivables.overdueCount} invoice${receivables.overdueCount === 1 ? '' : 's'} past the due date`
                : 'Nothing past due. Thank you.'}
          </p>
        </div>

        <div className="rounded-2xl border border-sky-400/25 bg-sky-500/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-300">Due</p>
          <p className="mt-2 text-xl font-bold tabular-nums text-white">
            {loading ? '—' : formatPula(receivables?.due)}
          </p>
          <p className="mt-1 text-xs text-ink-400">
            {loading
              ? 'Checking…'
              : receivables?.nextDueDate
                ? `Next payment due ${receivables.nextDueDate}`
                : 'Nothing due right now'}
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
            Account credit
          </p>
          <p className="mt-2 text-xl font-bold tabular-nums text-white">
            {loading ? '—' : formatPula(credit)}
          </p>
          <p className="mt-1 text-xs text-ink-400">
            {credit > 0.001
              ? 'Paid in advance. We apply this to your next invoice.'
              : 'No unapplied payments on your account'}
          </p>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <Link to="/portal/payments/notify" className={adminBtnPrimary}>
          I&rsquo;ve paid
        </Link>
        <Link to="/portal/quotes/new" className={adminBtnSecondary}>
          Request quote
        </Link>
        <Link to="/portal/invoices" className={adminBtnSecondary}>
          View invoices
        </Link>
        <Link to="/portal/statement" className={adminBtnSecondary}>
          View statement
        </Link>
      </div>

      {!loading && unreadInvoices.length > 0 ? (
        <section className={`${adminTableShellClass} bg-ink-900/90`}>
          <div className="border-b border-white/10 px-4 py-3">
            <h2 className="text-sm font-semibold text-white">
              New replies{' '}
              <span className="font-semibold tabular-nums text-ink-300">
                ({unreadInvoices.length})
              </span>
            </h2>
            <p className="mt-0.5 text-xs text-ink-400">
              Open an invoice to read the message from iTreq Inc.
            </p>
          </div>
          <ul className="divide-y divide-white/5">
            {unreadInvoices.map((inv) => (
              <li key={inv.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/portal/invoices/${inv.id}`)}
                  className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/[0.03]"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">
                      <span className={clickableDocClass}>{inv.number || 'Invoice'}</span>
                      <span className="ml-2 inline-flex rounded-md bg-amber-500/25 px-2 py-0.5 text-xs font-semibold text-amber-100">
                        {inv.unread === 1 ? '1 new' : `${inv.unread} new`}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-ink-400">
                      Balance due {formatPula(inv.total - (inv.amount_paid || 0))}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-brand-400">View</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className={`${adminTableShellClass} bg-ink-900/90`}>
        <div className="border-b border-white/10 px-4 py-3">
          <h2 className="text-sm font-semibold text-white">Recent activity</h2>
        </div>
        {loading ? (
          <p className="px-4 py-6 text-sm text-ink-400">Loading…</p>
        ) : recent.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-400">No invoices or payments yet.</p>
        ) : (
          <table className={adminTableClass}>
            <thead className="bg-ink-950/50 text-xs uppercase tracking-wider text-ink-400">
              <tr>
                <th className="px-3 py-2 sm:px-4">Date</th>
                <th className="px-3 py-2 sm:px-4">Description</th>
                <th className={`${adminColSecondary} px-3 py-2 text-right sm:px-4`}>Amount</th>
                <th className="px-3 py-2 text-right sm:px-4">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {recent.map((line) => {
                const openable = Boolean(line.id) && (line.type === 'invoice' || line.type === 'payment')
                const open = () =>
                  navigate(
                    line.type === 'payment'
                      ? `/portal/payments/${line.id}`
                      : `/portal/invoices/${line.id}`,
                  )
                const unread =
                  line.type === 'invoice' ? unreadByInvoice[line.id] || 0 : 0
                const label = `${statementLineLabel(line)}${statementLineMethodSuffix(line)}`
                return (
                  <tr
                    key={`${line.type}-${line.id}`}
                    role={openable ? 'link' : undefined}
                    tabIndex={openable ? 0 : undefined}
                    className={`group ${openable ? clickableRowClass : ''}`}
                    onClick={openable ? open : undefined}
                    onKeyDown={openable ? (e) => activateRowKey(e, open) : undefined}
                  >
                    <td className="break-words px-3 py-2 text-ink-300 sm:px-4">{line.sortDate}</td>
                    <td className="min-w-0 break-words px-3 py-2 text-ink-200 sm:px-4">
                      {openable ? <span className={clickableDocClass}>{label}</span> : label}
                      {unread > 0 ? (
                        <span className="ml-2 inline-flex rounded-md bg-amber-500/25 px-2 py-0.5 text-xs font-semibold text-amber-100">
                          {unread === 1 ? '1 new' : `${unread} new`}
                        </span>
                      ) : null}
                      <span className="mt-0.5 block tabular-nums text-xs text-ink-400 sm:hidden">
                        {line.debit
                          ? formatPula(line.debit)
                          : line.credit
                            ? `−${formatPula(line.credit)}`
                            : null}
                      </span>
                    </td>
                    <td className={`${adminColSecondary} px-3 py-2 text-right tabular-nums text-ink-300 sm:px-4`}>
                      {line.debit
                        ? formatPula(line.debit)
                        : line.credit
                          ? `−${formatPula(line.credit)}`
                          : '—'}
                    </td>
                    <td
                      className={`whitespace-nowrap px-3 py-2 text-right tabular-nums font-medium sm:px-4 ${balanceClass(line.balance)}`}
                    >
                      {formatPula(line.balance)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
