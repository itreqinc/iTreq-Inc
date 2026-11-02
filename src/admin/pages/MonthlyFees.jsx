import {
  useMemo,
  useState } from 'react'
import { Link } from 'react-router-dom'
import { opsApi } from '../../lib/opsApi'
import { DetailsCollapse } from '../../components/DetailsCollapse'
import { useOpsAlert } from '../OpsAlertContext'
import { adminBtnPrimary,
  adminBtnSecondary,
  adminFieldClass,
  formatPula,
  adminTableShellClass,
  adminTableClass,
  adminColSecondary,
} from '../ui'
import { formatBillingPeriodLabel } from '../../lib/invoiceDates'

function monthStartIso(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function formatPeriodLabel(isoDate) {
  return formatBillingPeriodLabel(isoDate) || '—'
}

function actionLabel(action) {
  switch (action) {
    case 'create':
      return 'Will create'
    case 'skip_already_billed':
      return 'Already billed'
    case 'skip_no_source':
      return 'No previous fee invoice'
    default:
      return action
  }
}

export default function MonthlyFeesPage() {
  const { showError, showSuccess, confirm, beginProgress, endProgress } = useOpsAlert()
  const [billingPeriod, setBillingPeriod] = useState(monthStartIso())
  const [preview, setPreview] = useState(null)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [skippedIds, setSkippedIds] = useState(() => new Set())

  const readyRows = useMemo(
    () => (preview?.rows || []).filter((r) => r.action === 'create'),
    [preview],
  )
  const createRows = useMemo(
    () => readyRows.filter((r) => !skippedIds.has(r.client_id)),
    [readyRows, skippedIds],
  )
  const markedSkipRows = useMemo(
    () => readyRows.filter((r) => skippedIds.has(r.client_id)),
    [readyRows, skippedIds],
  )
  const skipRows = useMemo(
    () => (preview?.rows || []).filter((r) => r.action !== 'create'),
    [preview],
  )

  async function runPreview() {
    setLoading(true)
    setResult(null)
    const { data, error } = await opsApi.previewMonthlyFeeRun({
      billing_period: billingPeriod,
    })
    setLoading(false)
    if (error) {
      showError(error.message)
      return
    }
    setPreview(data)
  }

  async function runGenerate() {
    const ok = await confirm({
      title: `Generate fee drafts for ${formatPeriodLabel(billingPeriod)}?`,
      message:
        createRows.length > 0
          ? `This will create ${createRows.length} draft invoice(s) by copying monthly fee lines from the previous month (product unchanged; description copied with the new month in brackets).${
              markedSkipRows.length
                ? ` ${markedSkipRows.length} marked Skip will be left out this month.`
                : ''
            } Review them on Invoices, then issue when ready.`
          : markedSkipRows.length
            ? `${markedSkipRows.length} client(s) are marked Skip. No drafts will be created.`
            : 'Run generate for this month? Clients already billed or without a previous fee invoice will be skipped.',
      confirmLabel: 'Create drafts',
    })
    if (!ok) return

    setGenerating(true)
    setResult(null)
    const names = createRows.map((r) => r.client_name).filter(Boolean)
    beginProgress({
      title: 'Creating fee drafts…',
      message: formatPeriodLabel(billingPeriod),
      total: 0,
      current: 0,
      label:
        names.length === 0
          ? 'Working…'
          : names.length <= 2
            ? names.join(', ')
            : `${names.slice(0, 2).join(', ')} +${names.length - 2} more`,
    })
    try {
      const { data, error } = await opsApi.generateMonthlyFeeInvoices({
        billing_period: billingPeriod,
        skip_client_ids: markedSkipRows.map((row) => row.client_id),
      })
      if (error) {
        showError(error.message)
        return
      }
      setResult(data)
      showSuccess(
        data.created_count
          ? `Created ${data.created_count} draft monthly fee invoice(s).`
          : 'No new invoices were created.',
      )
      await runPreview()
    } finally {
      endProgress()
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Monthly fees</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-300">
          Create draft invoices for the selected month by copying monthly fee lines only: the product
          stays as it is on the products table, and the description is copied as-is except for the month
          in brackets. Review drafts on Invoices before issuing. Usage and hardware are not copied —
          add those manually when they occur. Tick Skip to leave a client out of this month.
          Clients without a previous fee invoice are skipped.
        </p>
      </div>

      <div className="max-w-xl space-y-4 rounded-2xl border border-white/10 bg-ink-900/90 p-4 sm:p-5">
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
            Billing month
          </span>
          <input
            type="month"
            className={adminFieldClass}
            value={String(billingPeriod).slice(0, 7)}
            onChange={(e) => {
              const ym = e.target.value
              setBillingPeriod(ym ? `${ym}-01` : monthStartIso())
              setPreview(null)
              setResult(null)
              setSkippedIds(new Set())
            }}
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={loading || generating}
            onClick={runPreview}
            className={adminBtnSecondary}
          >
            {loading ? 'Loading…' : 'Preview'}
          </button>
          <button
            type="button"
            disabled={loading || generating || !preview}
            onClick={runGenerate}
            className={adminBtnPrimary}
            title={!preview ? 'Run Preview first' : undefined}
          >
            {generating ? 'Generating…' : 'Create drafts'}
          </button>
        </div>
      </div>

      {preview ? (
        <section className="space-y-3">
          <div className="flex flex-wrap gap-4 text-sm text-ink-300">
            <p>
              Period: <span className="text-white">{formatPeriodLabel(preview.billing_period)}</span>
            </p>
            <p>
              Source month:{' '}
              <span className="text-white">{formatPeriodLabel(preview.previous_period)}</span>
            </p>
            <p>
              Will create:{' '}
              <span className="font-semibold text-brand-300">{createRows.length}</span>
            </p>
            {markedSkipRows.length ? (
              <p>
                Marked to skip:{' '}
                <span className="text-white">{markedSkipRows.length}</span>
              </p>
            ) : null}
            <p>
              Already billed: <span className="text-white">{preview.skip_already_billed}</span>
            </p>
            <p>
              No source: <span className="text-white">{preview.skip_no_source}</span>
            </p>
          </div>

          {readyRows.length ? (
            <div className={adminTableShellClass}>
              <table className={adminTableClass}>
                <thead className="bg-ink-900/80 text-xs uppercase tracking-wider text-ink-400">
                  <tr>
                    <th className="px-4 py-3">Client</th>
                    <th className={`px-4 py-3 ${adminColSecondary}`}>Source invoice</th>
                    <th className={`px-4 py-3 ${adminColSecondary}`}>Fee lines</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3 text-right">Skip</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {readyRows.map((row) => {
                    const skipped = skippedIds.has(row.client_id)
                    return (
                      <tr
                        key={row.client_id}
                        className={skipped ? 'bg-ink-950/40' : 'bg-emerald-500/10'}
                      >
                        <td
                          className={`min-w-0 break-words px-4 py-3 ${skipped ? 'text-ink-400' : 'text-white'}`}
                        >
                          {row.client_name}
                        </td>
                        <td className={`px-4 py-3 text-ink-300 ${adminColSecondary}`}>
                          {row.source_number || '—'}
                        </td>
                        <td className={`px-4 py-3 text-ink-300 ${adminColSecondary}`}>
                          {row.fee_line_count}
                        </td>
                        <td className="px-4 py-3 text-ink-200">
                          {skipped ? 'Will skip' : actionLabel(row.action)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-white/30 bg-ink-950 text-brand-500 focus:ring-brand-500/40"
                            checked={skipped}
                            aria-label={`Skip ${row.client_name} this month`}
                            onChange={(e) => {
                              const on = e.target.checked
                              setSkippedIds((current) => {
                                const next = new Set(current)
                                if (on) next.add(row.client_id)
                                else next.delete(row.client_id)
                                return next
                              })
                            }}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-ink-400">No clients ready to bill for this month.</p>
          )}

          {skipRows.length ? (
            <DetailsCollapse className="rounded-2xl border border-white/10 bg-ink-900/30 p-3 text-sm [&>summary]:cursor-pointer">
              <summary className="font-medium text-ink-200">
                Skipped ({skipRows.length})
              </summary>
              <ul className="mt-3 space-y-1 text-ink-400">
                {skipRows.map((row) => (
                  <li key={`${row.client_id}-${row.action}`}>
                    {row.client_name} — {actionLabel(row.action)}
                  </li>
                ))}
              </ul>
            </DetailsCollapse>
          ) : null}
        </section>
      ) : null}

      {result?.created?.length ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-white">Created this run</h2>
          <ul className="divide-y divide-white/10 rounded-2xl border border-white/10">
            {result.created.map((row) => (
              <li
                key={row.invoice_id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-medium text-white">
                    {row.number || 'Draft'} · {row.client_name}
                  </p>
                  <p className="text-xs text-ink-400">{formatPula(row.total)}</p>
                </div>
                <Link
                  to={`/admin/invoices?open=${row.invoice_id}`}
                  className="text-xs font-semibold text-brand-400 hover:text-brand-300"
                >
                  Open →
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
