import { useEffect, useState } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import { opsApi } from '../lib/opsApi'
import { paymentMethodLabel } from '../lib/payments'
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

export default function PortalHome() {
  const navigate = useNavigate()
  const { clientId, client } = useOutletContext()
  const { showError } = useOpsAlert()
  const [statement, setStatement] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    opsApi.getClientStatement({ client_id: clientId }).then(({ data, error }) => {
      if (cancelled) return
      setLoading(false)
      if (error) {
        showError(error.message)
        return
      }
      setStatement(data)
    })
    return () => {
      cancelled = true
    }
  }, [clientId, showError])

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
            <span className={`font-semibold ${balanceClass(statement?.closingBalance)}`}>
              {formatPula(statement?.closingBalance)}
            </span>
          )}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link to="/portal/quotes/new" className={adminBtnPrimary}>
          Request quote
        </Link>
        <Link to="/portal/invoices" className={adminBtnSecondary}>
          View invoices
        </Link>
        <Link to="/portal/statement" className={adminBtnSecondary}>
          View statement
        </Link>
      </div>

      <section className={`${adminTableShellClass} bg-ink-900/40`}>
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
                const label =
                  line.type === 'invoice'
                    ? `Invoice ${line.label}`
                    : `Payment ${line.label}${
                        line.method ? ` (${paymentMethodLabel(line.method)})` : ''
                      }`
                return (
                  <tr
                    key={`${line.type}-${line.id}`}
                    role={openable ? 'link' : undefined}
                    tabIndex={openable ? 0 : undefined}
                    className={`group ${openable ? clickableRowClass : ''}`}
                    onClick={openable ? open : undefined}
                    onKeyDown={openable ? (e) => activateRowKey(e, open) : undefined}
                  >
                    <td className="whitespace-nowrap px-3 py-2 text-ink-300 sm:px-4">{line.sortDate}</td>
                    <td className="min-w-0 break-words px-3 py-2 text-ink-200 sm:px-4">
                      {openable ? <span className={clickableDocClass}>{label}</span> : label}
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
