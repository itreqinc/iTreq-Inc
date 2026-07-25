import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import { opsApi } from '../lib/opsApi'
import {
  invoiceBalanceDue,
  localTodayIso,
  PAYMENT_METHODS,
  paymentMethodLabel,
} from '../lib/payments'
import { YearMonthDaySelect } from '../components/YearMonthDaySelect'
import { useOpsAlert } from '../admin/OpsAlertContext'
import {
  adminBtnPrimary,
  adminBtnSecondary,
  adminFieldClass,
  formatPula,
} from '../admin/ui'

function statusPill(status) {
  switch (status) {
    case 'accepted':
      return 'bg-emerald-500/20 text-emerald-200'
    case 'dismissed':
      return 'bg-white/10 text-ink-400'
    default:
      return 'bg-amber-500/20 text-amber-200'
  }
}

function statusText(status) {
  switch (status) {
    case 'accepted':
      return 'Confirmed'
    case 'dismissed':
      return 'Not matched'
    default:
      return 'Being checked'
  }
}

export default function PortalPayNotify() {
  const navigate = useNavigate()
  const { clientId } = useOutletContext()
  const { showError, showSuccess } = useOpsAlert()
  const [searchParams] = useSearchParams()
  const presetInvoiceId = searchParams.get('invoice') || ''

  const [invoices, setInvoices] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const [invoiceId, setInvoiceId] = useState(presetInvoiceId)
  const [amount, setAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(() => localTodayIso())
  const [method, setMethod] = useState('eft')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [file, setFile] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [invRes, notifRes] = await Promise.all([
      opsApi.listInvoices({ client_id: clientId, forPortal: true }),
      opsApi.listPaymentNotificationsForClient(clientId),
    ])
    setLoading(false)
    if (invRes.error) {
      showError(invRes.error.message)
    } else {
      setInvoices((invRes.data || []).filter((inv) => invoiceBalanceDue(inv) > 0.001))
    }
    if (notifRes.error) {
      showError(notifRes.error.message)
    } else {
      setHistory(notifRes.data || [])
    }
  }, [clientId, showError])

  useEffect(() => {
    load()
  }, [load])

  // Paying off a specific invoice usually means paying exactly what is owed, but
  // only suggest it once per invoice so the client can still type their own figure.
  const prefilledFor = useRef('')
  useEffect(() => {
    if (!invoiceId || prefilledFor.current === invoiceId) return
    const inv = invoices.find((i) => i.id === invoiceId)
    if (!inv) return
    prefilledFor.current = invoiceId
    setAmount(String(invoiceBalanceDue(inv)))
  }, [invoiceId, invoices])

  async function handleSubmit(e) {
    e.preventDefault()
    if (submitting) return

    setSubmitting(true)

    let proofPath = null
    if (file) {
      const upload = await opsApi.uploadClientProof(file, { clientId })
      if (upload.error) {
        setSubmitting(false)
        showError(upload.error.message)
        return
      }
      proofPath = upload.data.path
    }

    const { error } = await opsApi.createPaymentNotification({
      client_id: clientId,
      invoice_id: invoiceId || null,
      amount,
      payment_date: paymentDate,
      method,
      reference,
      note,
      proof_path: proofPath,
    })
    setSubmitting(false)

    if (error) {
      showError(error.message)
      return
    }

    showSuccess(
      'Thank you. Our team will confirm the payment and update your account.',
      'Payment reported',
    )
    navigate('/portal/payments')
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">Payments</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-white">Tell us you&rsquo;ve paid</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-300">
          Already made a transfer or deposit? Send us the details and a copy of the slip. We will
          confirm it and update your account. This does not change your balance until our team
          verifies the payment.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-2xl border border-white/10 bg-ink-900/40 p-4 sm:p-6"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
              Amount paid (BWP)
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              required
              className={adminFieldClass}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </label>

          <YearMonthDaySelect
            label="Date paid"
            required
            value={paymentDate}
            onChange={setPaymentDate}
            maxYmd={localTodayIso()}
          />

          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
              How you paid
            </span>
            <select
              className={adminFieldClass}
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
              Reference (optional)
            </span>
            <input
              type="text"
              className={adminFieldClass}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Bank reference or deposit slip number"
            />
          </label>

          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
              For a specific invoice? (optional)
            </span>
            <select
              className={adminFieldClass}
              value={invoiceId}
              onChange={(e) => setInvoiceId(e.target.value)}
              disabled={loading}
            >
              <option value="">Put it against my account</option>
              {invoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.number || 'Invoice'} · {formatPula(invoiceBalanceDue(inv))} outstanding
                </option>
              ))}
            </select>
          </label>

          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
              Proof of payment (optional)
            </span>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full rounded-xl border border-white/10 bg-ink-950/80 px-3 py-2 text-sm text-ink-200 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-white/15"
            />
            <span className="mt-1 block text-xs text-ink-400">
              A photo or PDF of the bank slip helps us match it faster. Max 10 MB.
            </span>
          </label>

          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
              Anything else? (optional)
            </span>
            <textarea
              rows={3}
              className={adminFieldClass}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="For example: paid from a different account name"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={submitting} className={adminBtnPrimary}>
            {submitting ? 'Sending…' : 'Send payment details'}
          </button>
          <Link to="/portal/payments" className={adminBtnSecondary}>
            Cancel
          </Link>
        </div>
      </form>

      <section className="rounded-2xl border border-white/10 bg-ink-900/40">
        <div className="border-b border-white/10 px-4 py-3">
          <h2 className="text-sm font-semibold text-white">Payments you&rsquo;ve reported</h2>
        </div>
        {loading ? (
          <p className="px-4 py-6 text-sm text-ink-400">Loading…</p>
        ) : history.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-400">
            You have not reported any payments yet.
          </p>
        ) : (
          <ul className="divide-y divide-white/5">
            {history.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">
                    {formatPula(row.amount)} · {paymentMethodLabel(row.method)}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-400">
                    Paid {row.payment_date}
                    {row.invoices?.number ? ` · for ${row.invoices.number}` : ''}
                    {row.reference ? ` · ref ${row.reference}` : ''}
                  </p>
                </div>
                <span
                  className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ${statusPill(row.status)}`}
                >
                  {statusText(row.status)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
