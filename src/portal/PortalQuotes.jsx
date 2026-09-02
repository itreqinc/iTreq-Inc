import {
  useEffect,
  useMemo,
  useState } from 'react'
import { Link,
  useNavigate,
  useOutletContext } from 'react-router-dom'
import { opsApi } from '../lib/opsApi'
import {
  clientCanEditPortalQuote,
  portalQuoteAwaitingApproval,
  quotationDisplayStatus,
  } from '../lib/portalQuote'
import { usePersistedDateRange } from '../hooks/usePersistedDateRange'
import {
  documentFilterDate,
  filterByDateRange,
} from '../lib/dateRange'
import { DateRangeFilter } from '../components/DateRangeFilter'
import { useOpsAlert } from '../admin/OpsAlertContext'
import {
  adminBtnPrimary,
  activateRowKey,
  clickableDocClass,
  clickableRowClass,
  formatPula,
  adminTableClass,
  adminColSecondary,
  adminColAction,
  adminCellPad,
} from '../admin/ui'

function statusClass(status, awaiting) {
  if (awaiting) return 'bg-amber-500/20 text-amber-200'
  switch (status) {
    case 'sent':
      return 'bg-sky-500/20 text-sky-200'
    case 'accepted':
      return 'bg-emerald-500/20 text-emerald-200'
    case 'converted':
      return 'bg-brand-500/20 text-brand-200'
    case 'cancelled':
    case 'declined':
      return 'bg-red-500/20 text-red-300'
    case 'draft':
    default:
      return 'bg-white/10 text-ink-300'
  }
}

export default function PortalQuotes() {
  const navigate = useNavigate()
  const { clientId } = useOutletContext()
  const { showError, showSuccess, confirm } = useOpsAlert()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState(null)
  const [from, setFrom, to, setTo] = usePersistedDateRange(`portal.quotes.${clientId}`)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    opsApi.listQuotations({ client_id: clientId }).then(({ data, error }) => {
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

  async function handleDelete(q) {
    if (!clientCanEditPortalQuote(q)) return
    const ok = await confirm({
      title: 'Delete quotation?',
      message: `Delete quotation ${q.number || ''}? This cannot be undone.`,
      confirmLabel: 'Delete',
    })
    if (!ok) return
    setDeletingId(q.id)
    const { error } = await opsApi.deleteQuotationForClient(q.id, clientId)
    setDeletingId(null)
    if (error) {
      showError(error.message)
      return
    }
    setRows((list) => list.filter((row) => row.id !== q.id))
    showSuccess('Quotation deleted.', 'Deleted')
  }

  const visibleRows = useMemo(
    () => filterByDateRange(rows, from, to, documentFilterDate),
    [rows, from, to],
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">Quotations</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-white">Your quotes</h1>
          <p className="mt-1 text-sm text-ink-300">
            Request a quote by choosing what you want to track — no need to know tracker models.
          </p>
        </div>
        <Link to="/portal/quotes/new" className={adminBtnPrimary}>
          Request quote
        </Link>
      </div>

      <DateRangeFilter
        from={from}
        to={to}
        onFromChange={setFrom}
        onToChange={setTo}
        dateLabel="quote date"
        shown={visibleRows.length}
        total={rows.length}
      >
        <table className={adminTableClass}>
          <thead className="bg-ink-950/50 text-xs uppercase tracking-wider text-ink-400">
            <tr>
              <th className={`${adminCellPad} ${adminColSecondary}`}>Date</th>
              <th className={`${adminCellPad} min-w-0`}>Number</th>
              <th className={`${adminCellPad} ${adminColSecondary}`}>Status</th>
              <th className={`${adminCellPad} w-[4.75rem] text-right sm:w-auto`}>Total</th>
              <th className={`${adminCellPad} ${adminColAction}`} />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-ink-400">
                  Loading…
                </td>
              </tr>
            ) : visibleRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-ink-400">
                  {rows.length === 0 ? (
                    <>
                      No quotations yet.{' '}
                      <Link to="/portal/quotes/new" className="font-semibold text-brand-400">
                        Request one
                      </Link>
                    </>
                  ) : (
                    'No quotations in the selected date range.'
                  )}
                </td>
              </tr>
            ) : (
              visibleRows.map((q) => {
                const canEdit = clientCanEditPortalQuote(q)
                const awaiting = portalQuoteAwaitingApproval(q)
                const open = () => navigate(`/portal/quotes/${q.id}`)
                return (
                  <tr
                    key={q.id}
                    role="link"
                    tabIndex={0}
                    className={`group bg-ink-900/20 ${clickableRowClass}`}
                    onClick={open}
                    onKeyDown={(e) => activateRowKey(e, open)}
                  >
                    <td className={`whitespace-nowrap px-4 py-3 text-ink-300 ${adminColSecondary}`}>
                      {q.issue_date || '—'}
                    </td>
                    <td className={adminCellPad}>
                      <div className="flex min-w-0 flex-col items-start gap-0.5">
                        <span className={`${clickableDocClass} break-words`}>{q.number || '—'}</span>
                        <span
                          className={`sm:hidden inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold capitalize ${statusClass(q.status, awaiting)}`}
                        >
                          {quotationDisplayStatus(q)}
                        </span>
                      </div>
                    </td>
                    <td className={`${adminCellPad} ${adminColSecondary}`}>
                      <span
                        className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold capitalize ${statusClass(q.status, awaiting)}`}
                      >
                        {quotationDisplayStatus(q)}
                      </span>
                    </td>
                    <td className={`${adminCellPad} text-right tabular-nums text-[12px] text-ink-200 sm:text-sm`}>
                      {formatPula(q.total)}
                    </td>
                    <td
                      className={`${adminCellPad} text-right ${adminColAction}`}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <div className="flex flex-wrap items-center justify-end gap-3">
                        {canEdit ? (
                          <>
                            <Link
                              to={`/portal/quotes/${q.id}/edit`}
                              className="text-xs font-semibold text-brand-400 hover:text-brand-300"
                            >
                              Edit
                            </Link>
                            <button
                              type="button"
                              disabled={deletingId === q.id}
                              onClick={() => handleDelete(q)}
                              className="text-xs font-semibold text-red-300 hover:text-red-200 disabled:opacity-50"
                            >
                              {deletingId === q.id ? 'Deleting…' : 'Delete'}
                            </button>
                          </>
                        ) : null}
                        <span className="text-xs font-semibold text-brand-400 group-hover:text-brand-300">
                          View
                        </span>
                      </div>
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
