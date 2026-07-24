import {
  useEffect,
  useState } from 'react'
import { Link,
  useNavigate,
  useOutletContext } from 'react-router-dom'
import { opsApi } from '../lib/opsApi'
import { invoiceBalanceDue,
  invoiceDisplayStatus } from '../lib/payments'
import { clientInvoiceBillingDisplay } from '../lib/invoiceDates'
import { useOpsAlert } from '../admin/OpsAlertContext'
import {
  activateRowKey,
  clickableDocClass,
  clickableRowClass,
  formatPula,
  adminTableShellClass,
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
    case 'issued':
    default:
      return 'bg-white/10 text-ink-300'
  }
}

export default function PortalInvoices() {
  const navigate = useNavigate()
  const { clientId } = useOutletContext()
  const { showError } = useOpsAlert()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    opsApi.listInvoices({ client_id: clientId, forPortal: true }).then(({ data, error }) => {
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

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">Invoices</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-white">Your invoices</h1>
        <p className="mt-1 text-sm text-ink-300">Issued, partially paid, and paid invoices only.</p>
      </div>

      <div className={`${adminTableShellClass} bg-ink-900/40`}>
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
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-ink-400">
                  No invoices yet.
                </td>
              </tr>
            ) : (
              rows.map((inv) => {
                const billing = clientInvoiceBillingDisplay(inv)
                const displayStatus = invoiceDisplayStatus(inv)
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
      </div>
    </div>
  )
}
