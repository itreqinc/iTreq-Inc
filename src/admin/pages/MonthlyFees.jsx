import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { opsApi } from '../../lib/opsApi'
import { useOpsAlert } from '../OpsAlertContext'
import { adminBtnPrimary, adminBtnSecondary, adminFieldClass, formatPula } from '../ui'
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
  const { showError, showSuccess, confirm } = useOpsAlert()
  const [billingPeriod, setBillingPeriod] = useState(monthStartIso())
  const [preview, setPreview] = useState(null)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)

  const createRows = useMemo(
    () => (preview?.rows || []).filter((r) => r.action === 'create'),
    [preview],
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
      title: `Generate fees for ${formatPeriodLabel(billingPeriod)}?`,
      message:
        createRows.length > 0
          ? `This will create and issue ${createRows.length} invoice(s) by copying monthly fee lines from the previous month. This cannot be undone (void individually if needed).`
          : 'Run generate for this month? Clients already billed or without a previous fee invoice will be skipped.',
      confirmLabel: 'Generate invoices',
    })
    if (!ok) return

    setGenerating(true)
    setResult(null)
    const { data, error } = await opsApi.generateMonthlyFeeInvoices({
      billing_period: billingPeriod,
    })
    setGenerating(false)
    if (error) {
      showError(error.message)
      return
    }
    setResult(data)
    showSuccess(
      data.created_count
        ? `Created ${data.created_count} monthly fee invoice(s).`
        : 'No new invoices were created.',
    )
    await runPreview()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Monthly fees</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-300">
          Generate issued invoices for the selected month by copying monthly fee lines (non-stock
          products) from each client&apos;s previous-month invoice. Clients without a previous fee
          invoice are skipped — bill those manually under Invoices.
        </p>
      </div>

      <div className="max-w-xl space-y-4 rounded-2xl border border-white/10 bg-ink-900/40 p-4 sm:p-5">
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
            {generating ? 'Generating…' : 'Generate invoices'}
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
              <span className="font-semibold text-brand-300">{preview.would_create}</span>
            </p>
            <p>
              Already billed: <span className="text-white">{preview.skip_already_billed}</span>
            </p>
            <p>
              No source: <span className="text-white">{preview.skip_no_source}</span>
            </p>
          </div>

          {createRows.length ? (
            <div className="overflow-x-auto rounded-2xl border border-white/10">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-ink-900/80 text-xs uppercase tracking-wider text-ink-400">
                  <tr>
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3">Source invoice</th>
                    <th className="px-4 py-3">Fee lines</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {createRows.map((row) => (
                    <tr key={row.client_id} className="bg-emerald-500/10">
                      <td className="px-4 py-3 text-white">{row.client_name}</td>
                      <td className="px-4 py-3 text-ink-300">{row.source_number || '—'}</td>
                      <td className="px-4 py-3 text-ink-300">{row.fee_line_count}</td>
                      <td className="px-4 py-3 text-ink-200">{actionLabel(row.action)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-ink-400">No clients ready to bill for this month.</p>
          )}

          {skipRows.length ? (
            <details className="rounded-2xl border border-white/10 bg-ink-900/30 p-3 text-sm">
              <summary className="cursor-pointer font-medium text-ink-200">
                Skipped ({skipRows.length})
              </summary>
              <ul className="mt-3 space-y-1 text-ink-400">
                {skipRows.map((row) => (
                  <li key={`${row.client_id}-${row.action}`}>
                    {row.client_name} — {actionLabel(row.action)}
                  </li>
                ))}
              </ul>
            </details>
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
                    {row.number} · {row.client_name}
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
