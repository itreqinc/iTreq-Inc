import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { opsApi } from '../../lib/opsApi'
import {
  invoiceBalanceDue,
  invoiceEffectiveDueDate,
  paymentMethodLabel,
} from '../../lib/payments'
import { useOpsAlert } from '../OpsAlertContext'
import { adminBtnPrimary, adminBtnSecondary, formatPula } from '../ui'

function Kpi({ label, value, hint, tone = 'default' }) {
  const toneClass =
    tone === 'danger'
      ? 'border-red-400/25 bg-red-500/5'
      : tone === 'good'
        ? 'border-emerald-400/25 bg-emerald-500/5'
        : tone === 'attention'
          ? 'border-azure-400/25 bg-azure-500/5'
          : 'border-white/10 bg-ink-900/50'
  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <p className="text-xs uppercase tracking-wider text-ink-400">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums text-white">{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink-400">{hint}</p> : null}
    </div>
  )
}

function ActionCard({ title, count, description, children, emptyText, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className="rounded-2xl border border-white/10 bg-ink-900/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left transition hover:bg-white/[0.03] ${
          open ? 'border-b border-white/10' : ''
        }`}
      >
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-white">
            {title}{' '}
            <span className="font-semibold tabular-nums text-ink-300">({count})</span>
          </h2>
          <p className="mt-0.5 text-xs text-ink-400">{description}</p>
        </div>
        <span
          className={`shrink-0 text-ink-400 transition ${open ? 'rotate-180' : ''}`}
          aria-hidden
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </span>
      </button>
      {open ? (
        count === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-400">{emptyText}</p>
        ) : (
          <ul className="divide-y divide-white/5">{children}</ul>
        )
      ) : null}
    </section>
  )
}

export default function AdminDashboard() {
  const navigate = useNavigate()
  const { showError, showSuccess, confirm } = useOpsAlert()
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await opsApi.getOpsDashboardSummary()
    setLoading(false)
    if (error) {
      showError(error.message)
      return
    }
    setSummary(data)
  }, [showError])

  useEffect(() => {
    load()
  }, [load])

  async function viewProof(path) {
    const { data, error } = await opsApi.getProofSignedUrl(path)
    if (error) {
      showError(error.message)
      return
    }
    window.open(data, '_blank', 'noopener')
  }

  async function dismissNotification(row) {
    const ok = await confirm({
      title: 'Dismiss this report?',
      message: `Dismiss ${row.clients?.name || 'this client'}'s report of ${formatPula(row.amount)}? Use this when the payment never arrived or is a duplicate.`,
      confirmLabel: 'Dismiss report',
    })
    if (!ok) return

    setBusyId(row.id)
    const { error } = await opsApi.resolvePaymentNotification(row.id, { status: 'dismissed' })
    setBusyId(null)
    if (error) {
      showError(error.message)
      return
    }
    showSuccess('Report dismissed.')
    setSummary((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        paymentNotifications: (prev.paymentNotifications || []).filter((n) => n.id !== row.id),
      }
    })
  }

  const notifications = summary?.paymentNotifications || []
  const disputes = summary?.disputes || []
  const quoteRequests = summary?.quoteRequests || []
  const overdueInvoices = summary?.overdueInvoices || []
  const receivables = summary?.receivables
  const actionCount =
    notifications.length + disputes.length + quoteRequests.length + overdueInvoices.length

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">Operations</p>
          <h1 className="mt-1 font-display text-3xl font-bold text-white">Dashboard</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-300">
            {loading
              ? 'Checking what needs attention…'
              : actionCount === 0
                ? 'Nothing needs your attention right now.'
                : `${actionCount} item${actionCount === 1 ? '' : 's'} need your attention.`}
          </p>
        </div>
        <button type="button" onClick={load} disabled={loading} className={adminBtnSecondary}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi
          label="Outstanding"
          value={loading ? '—' : formatPula(receivables?.total)}
          hint="Unpaid invoices across all clients"
        />
        <Kpi
          label="Overdue"
          value={loading ? '—' : formatPula(receivables?.overdue)}
          hint={
            loading
              ? ''
              : `${receivables?.overdueCount || 0} invoice${receivables?.overdueCount === 1 ? '' : 's'} past due`
          }
          tone="attention"
        />
        <Kpi
          label="Collected this month"
          value={loading ? '—' : formatPula(summary?.collectedThisMonth)}
          hint="Payments recorded since the 1st"
          tone="good"
        />
      </div>

      <ActionCard
        title="Clients reporting payments"
        description="Verify against the bank, then record the payment."
        count={notifications.length}
        emptyText="No unconfirmed payment reports."
      >
        {notifications.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">
                {row.clients?.name || 'Client'} · {formatPula(row.amount)}
              </p>
              <p className="mt-0.5 text-xs text-ink-400">
                Paid {row.payment_date} via {paymentMethodLabel(row.method)}
                {row.reference ? ` · ref ${row.reference}` : ''}
                {row.invoices?.number ? ` · for ${row.invoices.number}` : ''}
              </p>
              {row.note ? (
                <p className="mt-0.5 text-xs text-ink-400">&ldquo;{row.note}&rdquo;</p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {row.proof_path ? (
                <button
                  type="button"
                  onClick={() => viewProof(row.proof_path)}
                  className="text-xs font-semibold text-brand-400 hover:text-brand-300"
                >
                  View proof
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => navigate(`/admin/payments?notification=${row.id}`)}
                className={adminBtnPrimary}
              >
                Record payment
              </button>
              <button
                type="button"
                disabled={busyId === row.id}
                onClick={() => dismissNotification(row)}
                className={adminBtnSecondary}
              >
                {busyId === row.id ? 'Working…' : 'Dismiss'}
              </button>
            </div>
          </li>
        ))}
      </ActionCard>

      <ActionCard
        title="Invoice queries"
        description="Clients waiting on an answer about a charge."
        count={disputes.length}
        emptyText="No open queries."
      >
        {disputes.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">
                {row.clients?.name || 'Client'} · {row.invoices?.number || 'Invoice'}
              </p>
              <p className="mt-0.5 text-xs text-ink-400">
                Opened {String(row.created_at || '').slice(0, 10)}
              </p>
            </div>
            <Link to={`/admin/invoices?open=${row.invoice_id}`} className={adminBtnPrimary}>
              Open invoice
            </Link>
          </li>
        ))}
      </ActionCard>

      <ActionCard
        title="Quote requests from the portal"
        description="Client requests waiting for pricing and approval."
        count={quoteRequests.length}
        emptyText="No quote requests waiting."
      >
        {quoteRequests.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">
                {row.clients?.name || 'Client'} · {row.number || 'Draft'}
              </p>
              <p className="mt-0.5 text-xs text-ink-400">
                Requested {String(row.created_at || '').slice(0, 10)}
              </p>
            </div>
            <Link to={`/admin/quotations?open=${row.id}`} className={adminBtnPrimary}>
              Review
            </Link>
          </li>
        ))}
      </ActionCard>

      <ActionCard
        title="Overdue invoices"
        description="Past the due date and still unpaid. Oldest first."
        count={overdueInvoices.length}
        emptyText="Nothing overdue. Collections are up to date."
      >
        {overdueInvoices.slice(0, 8).map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">
                {row.clients?.name || 'Client'} · {row.number || 'Invoice'}
              </p>
              <p className="mt-0.5 text-xs text-ink-400">
                Due {invoiceEffectiveDueDate(row)} · {formatPula(invoiceBalanceDue(row))} outstanding
              </p>
            </div>
            <Link to={`/admin/invoices?open=${row.id}`} className={adminBtnSecondary}>
              Open
            </Link>
          </li>
        ))}
      </ActionCard>
    </div>
  )
}
