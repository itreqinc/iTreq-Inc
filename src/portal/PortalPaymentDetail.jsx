import {
  useCallback,
  useEffect,
  useMemo,
  useState } from 'react'
import { Link,
  useNavigate,
  useOutletContext,
  useParams } from 'react-router-dom'
import { opsApi } from '../lib/opsApi'
import { paymentMethodLabel } from '../lib/payments'
import {
  openPaymentDocumentPrintWindow,
  fillPaymentDocumentPrintWindow,
  closePaymentDocumentPrintWindow,
  } from '../lib/paymentDocument'
import { useOpsAlert } from '../admin/OpsAlertContext'
import { adminBtnPrimary,
  adminBtnSecondary,
  formatPula,
  adminTableShellClass,
  adminTableClass
} from '../admin/ui'

export default function PortalPaymentDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { clientId } = useOutletContext()
  const { showError } = useOpsAlert()
  const [payment, setPayment] = useState(null)
  const [loading, setLoading] = useState(true)
  const [printing, setPrinting] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    opsApi.getPaymentForClient(id, clientId).then(({ data, error }) => {
      if (cancelled) return
      setLoading(false)
      if (error) {
        showError(error.message)
        navigate('/portal/statement', { replace: true })
        return
      }
      setPayment(data)
    })
    return () => {
      cancelled = true
    }
  }, [id, clientId, showError, navigate])

  const allocations = useMemo(
    () =>
      (payment?.allocations || [])
        .filter((a) => Number(a.amount) > 0)
        .map((a) => {
          const inv = Array.isArray(a.invoices) ? a.invoices[0] : a.invoices
          return {
            invoiceId: inv?.id || a.invoice_id,
            invoiceNumber: inv?.number || 'Invoice',
            amount: Number(a.amount) || 0,
          }
        }),
    [payment],
  )

  const allocatedTotal = useMemo(
    () => Math.round(allocations.reduce((sum, a) => sum + a.amount, 0) * 100) / 100,
    [allocations],
  )

  const unallocated = useMemo(() => {
    const amount = Number(payment?.amount) || 0
    const left = Math.round((amount - allocatedTotal) * 100) / 100
    return left > 0.001 ? left : 0
  }, [payment, allocatedTotal])

  const printReceipt = useCallback(async () => {
    if (!id || !clientId) return
    const opened = openPaymentDocumentPrintWindow()
    if (!opened.ok) {
      showError(opened.message)
      return
    }
    const { win } = opened
    setPrinting(true)
    const { data, error } = await opsApi.getPaymentDocumentBundleForClient(id, clientId)
    setPrinting(false)
    if (error) {
      closePaymentDocumentPrintWindow(win)
      showError(error.message)
      return
    }
    const result = fillPaymentDocumentPrintWindow(win, data.model)
    if (!result.ok) showError(result.message)
  }, [id, clientId, showError])

  if (loading) {
    return <p className="text-sm text-ink-400">Loading payment…</p>
  }
  if (!payment) return null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to="/portal/statement"
            className="text-xs font-semibold text-ink-400 hover:text-ink-200"
          >
            ← Statement
          </Link>
          <h1 className="mt-2 font-display text-2xl font-bold text-white">Payment received</h1>
          <p className="mt-1 text-sm text-ink-300">
            {payment.payment_date || '—'} · {paymentMethodLabel(payment.method)}
            {payment.reference ? ` · Ref ${payment.reference}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={printReceipt}
            disabled={printing}
            className={adminBtnPrimary}
          >
            {printing ? 'Loading…' : 'Print / Save PDF'}
          </button>
          <Link to="/portal/statement" className={adminBtnSecondary}>
            Back
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-ink-900/90 px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
          Amount received
        </p>
        <p className="mt-1 font-display text-3xl font-bold text-white">
          {formatPula(payment.amount)}
        </p>
      </div>

      <div className={`${adminTableShellClass} bg-ink-900/90`}>
        <table className={adminTableClass}>
          <thead className="bg-ink-950/50 text-xs uppercase tracking-wider text-ink-400">
            <tr>
              <th className="px-4 py-3">Applied to</th>
              <th className="px-4 py-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {allocations.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-4 py-4 text-ink-400">
                  No invoices allocated — full amount credited to your account.
                </td>
              </tr>
            ) : (
              allocations.map((a) => (
                <tr key={`${a.invoiceId}-${a.amount}`}>
                  <td className="px-4 py-3">
                    {a.invoiceId ? (
                      <Link
                        to={`/portal/invoices/${a.invoiceId}`}
                        className="font-medium text-brand-400 hover:text-brand-300"
                      >
                        Invoice {a.invoiceNumber}
                      </Link>
                    ) : (
                      <span className="text-ink-200">Invoice {a.invoiceNumber}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-200">
                    {formatPula(a.amount)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="ml-auto max-w-xs space-y-1 text-sm">
        <div className="flex justify-between gap-4 text-ink-300">
          <span>Allocated</span>
          <span className="tabular-nums">{formatPula(allocatedTotal)}</span>
        </div>
        {unallocated > 0 ? (
          <div className="flex justify-between gap-4 text-ink-300">
            <span>Account credit</span>
            <span className="tabular-nums">{formatPula(unallocated)}</span>
          </div>
        ) : null}
        <div className="flex justify-between gap-4 border-t border-white/10 pt-2 font-semibold text-white">
          <span>Total received</span>
          <span className="tabular-nums">{formatPula(payment.amount)}</span>
        </div>
      </div>

      {payment.notes ? (
        <p className="rounded-xl border border-white/10 bg-ink-900/90 px-4 py-3 text-sm text-ink-300">
          {payment.notes}
        </p>
      ) : null}
    </div>
  )
}
