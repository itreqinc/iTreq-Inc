import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { opsApi } from '../lib/opsApi'
import { paymentMethodLabel } from '../lib/payments'
import { currentMonthStartIso, filterByDateRange, todayIso } from '../lib/dateRange'
import { DateRangeFilter } from '../components/DateRangeFilter'
import { useOpsAlert } from '../admin/OpsAlertContext'
import {
  activateRowKey,
  clickableDocClass,
  clickableRowClass,
  formatPula,
  adminTableClass,
  adminColSecondary,
} from '../admin/ui'

export default function PortalPayments() {
  const navigate = useNavigate()
  const { clientId } = useOutletContext()
  const { showError } = useOpsAlert()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [from, setFrom] = useState(currentMonthStartIso)
  const [to, setTo] = useState(todayIso)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    opsApi.listPaymentsForClient(clientId).then(({ data, error }) => {
      if (cancelled) return
      setLoading(false)
      if (error) {
        showError(error.message)
        return
      }
      setRows(data || [])
    })
    return () => {
      cancelled = true
    }
  }, [clientId, showError])

  const visibleRows = useMemo(
    () => filterByDateRange(rows, from, to, (pay) => pay.payment_date),
    [rows, from, to],
  )

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">Payments</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-white">Your payments</h1>
        <p className="mt-1 text-sm text-ink-300">
          Every payment we have received and recorded on your account.
        </p>
      </div>

      <DateRangeFilter
        from={from}
        to={to}
        onFromChange={setFrom}
        onToChange={setTo}
        dateLabel="payment date"
        shown={visibleRows.length}
        total={rows.length}
      >
        <table className={adminTableClass}>
          <thead className="bg-ink-950/50 text-xs uppercase tracking-wider text-ink-400">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Receipt</th>
              <th className={`px-4 py-3 ${adminColSecondary}`}>Method</th>
              <th className={`px-4 py-3 ${adminColSecondary}`}>Reference</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className={`px-4 py-3 text-right ${adminColSecondary}`}>On account</th>
              <th className={`px-4 py-3 ${adminColSecondary}`} />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-ink-400">
                  Loading…
                </td>
              </tr>
            ) : visibleRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-ink-400">
                  {rows.length === 0
                    ? 'No payments recorded yet.'
                    : 'No payments in the selected date range.'}
                </td>
              </tr>
            ) : (
              visibleRows.map((pay) => {
                const open = () => navigate(`/portal/payments/${pay.id}`)
                const credit = Number(pay.unallocated_amount) || 0
                return (
                  <tr
                    key={pay.id}
                    role="link"
                    tabIndex={0}
                    className={`group bg-ink-900/20 ${clickableRowClass}`}
                    onClick={open}
                    onKeyDown={(e) => activateRowKey(e, open)}
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-ink-300">
                      {pay.payment_date || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={clickableDocClass}>Receipt</span>
                      <span className="mt-0.5 block text-xs text-ink-400 sm:hidden">
                        {paymentMethodLabel(pay.method)}
                      </span>
                    </td>
                    <td className={`whitespace-nowrap px-4 py-3 text-ink-300 ${adminColSecondary}`}>
                      {paymentMethodLabel(pay.method)}
                    </td>
                    <td className={`min-w-0 break-words px-4 py-3 text-ink-300 ${adminColSecondary}`}>
                      {pay.reference || '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink-200">
                      {formatPula(pay.amount)}
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums ${adminColSecondary}`}>
                      {credit > 0.001 ? (
                        <span className="text-emerald-300">{formatPula(credit)}</span>
                      ) : (
                        <span className="text-ink-400">—</span>
                      )}
                    </td>
                    <td className={`px-4 py-3 text-right ${adminColSecondary}`}>
                      <span className="text-xs font-semibold text-brand-400 group-hover:text-brand-300">
                        View
                      </span>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </DateRangeFilter>

      <p className="text-xs text-ink-400">
        &ldquo;On account&rdquo; is the part of a payment not yet applied to an invoice. It stays as
        credit and is used against your next invoice.
      </p>
    </div>
  )
}
