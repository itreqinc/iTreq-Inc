import {
  useEffect,
  useMemo,
  useState } from 'react'
import {
  useNavigate,
  useOutletContext } from 'react-router-dom'
import { opsApi } from '../lib/opsApi'
import { invoiceBalanceDue,
  invoiceDisplayStatus } from '../lib/payments'
import { clientInvoiceBillingDisplay } from '../lib/invoiceDates'
import {
  currentMonthStartIso,
  documentFilterDate,
  filterByDateRange,
  todayIso,
} from '../lib/dateRange'
import { withUnreadRows } from '../lib/invoiceDisputes'
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

function statusClass(status) {
  switch (status) {
    case 'partial':
      return 'bg-amber-500/20 text-amber-200'
    case 'overdue':
      return 'bg-red-500/20 text-red-300'
    case 'paid':
      return 'bg-emerald-500/20 text-emerald-200'
    case 'due':
      return 'bg-sky-500/20 text-sky-200'
    default:
      return 'bg-white/10 text-ink-300'
  }
}

/** Match the Billing column clients actually see, not the internal issue date. */
function invoiceFilterDate(inv) {
  return inv?.billing_period || documentFilterDate(inv)
}

export default function PortalInvoices() {
  const navigate = useNavigate()
  const { clientId } = useOutletContext()
  const { showError } = useOpsAlert()
  const [rows, setRows] = useState([])
  const [unreadByInvoice, setUnreadByInvoice] = useState({})
  const [loading, setLoading] = useState(true)
  const [from, setFrom] = useState(currentMonthStartIso)
  const [to, setTo] = useState(todayIso)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      opsApi.listInvoices({ client_id: clientId, forPortal: true }),
      opsApi.listInvoiceUnreadCounts({ role: 'client', client_id: clientId }),
    ]).then(([invRes, unreadRes]) => {
      if (cancelled) return
      setLoading(false)
      if (invRes.error) {
        showError(invRes.error.message)
        return
      }
      if (unreadRes.error) showError(unreadRes.error.message)
      setRows(invRes.data || [])
      setUnreadByInvoice(unreadRes.data || {})
    })
    return () => {
      cancelled = true
    }
  }, [clientId, showError])

  const visibleRows = useMemo(() => {
    const filtered = filterByDateRange(rows, from, to, invoiceFilterDate)
    return withUnreadRows(filtered, rows, unreadByInvoice)
  }, [rows, from, to, unreadByInvoice])

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">Invoices</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-white">Your invoices</h1>
        <p className="mt-1 text-sm text-ink-300">Issued, partially paid, and paid invoices only.</p>
      </div>

      <DateRangeFilter
        from={from}
        to={to}
        onFromChange={setFrom}
        onToChange={setTo}
        dateLabel="billing date"
        shown={visibleRows.length}
        total={rows.length}
      >
        <table className={adminTableClass}>
          <thead className="bg-ink-950/50 text-xs uppercase tracking-wider text-ink-400">
            <tr>
              <th className={`px-4 py-3 ${adminColSecondary}`}>Billing</th>
              <th className={`px-4 py-3 ${adminColSecondary}`}>Due</th>
              <th className="px-4 py-3">Number</th>
              <th className="px-4 py-3">Status</th>
              <th className={`px-4 py-3 text-right ${adminColSecondary}`}>Total</th>
              <th className="px-4 py-3 text-right">Balance due</th>
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
                    ? 'No invoices yet.'
                    : 'No invoices in the selected date range.'}
                </td>
              </tr>
            ) : (
              visibleRows.map((inv) => {
                const billing = clientInvoiceBillingDisplay(inv)
                const displayStatus = invoiceDisplayStatus(inv)
                const unread = unreadByInvoice[inv.id] || 0
                const open = () => navigate(`/portal/invoices/${inv.id}`)
                return (
                  <tr
                    key={inv.id}
                    role="link"
                    tabIndex={0}
                    className={`group bg-ink-900/20 ${clickableRowClass}`}
                    onClick={open}
                    onKeyDown={(e) => activateRowKey(e, open)}
                  >
                    <td className={`whitespace-nowrap px-4 py-3 text-ink-300 ${adminColSecondary}`}>
                      {inv.billing_period ? billing.value : '—'}
                    </td>
                    <td className={`whitespace-nowrap px-4 py-3 text-ink-300 ${adminColSecondary}`}>
                      {inv.due_date || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={clickableDocClass}>{inv.number || '—'}</span>
                      {unread > 0 ? (
                        <span className="ml-2 inline-flex rounded-md bg-amber-500/25 px-2 py-0.5 text-xs font-semibold text-amber-100">
                          {unread === 1 ? '1 new' : `${unread} new`}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold capitalize ${statusClass(displayStatus)}`}
                      >
                        {displayStatus}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums text-ink-200 ${adminColSecondary}`}>
                      {formatPula(inv.total)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink-200">
                      {formatPula(invoiceBalanceDue(inv))}
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
    </div>
  )
}
