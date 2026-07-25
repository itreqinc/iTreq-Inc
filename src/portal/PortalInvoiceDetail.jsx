import {
  useCallback,
  useEffect,
  useState } from 'react'
import { Link,
  useNavigate,
  useOutletContext,
  useParams } from 'react-router-dom'
import { opsApi } from '../lib/opsApi'
import { invoiceBalanceDue,
  invoiceDisplayStatus } from '../lib/payments'
import { clientInvoiceBillingDisplay, nextBillingSummary } from '../lib/invoiceDates'
import {
  openBillingDocumentPrintWindow,
  fillBillingDocumentPrintWindow,
  closeBillingDocumentPrintWindow,
  } from '../lib/billingDocument'
import { useOpsAlert } from '../admin/OpsAlertContext'
import { adminBtnPrimary,
  adminBtnSecondary,
  formatPula,
  adminTableShellClass,
  adminTableClass,
  adminColSecondary,
} from '../admin/ui'
import { BillingDocumentScreenFooter } from './BillingDocumentScreenFooter'
import { InvoiceQueryThread } from '../components/InvoiceQueryThread'

export default function PortalInvoiceDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { clientId } = useOutletContext()
  const { showError } = useOpsAlert()
  const [invoice, setInvoice] = useState(null)
  const [printModel, setPrintModel] = useState(null)
  const [loading, setLoading] = useState(true)
  const [printing, setPrinting] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setPrintModel(null)

    async function load() {
      const invRes = await opsApi.getInvoiceForClient(id, clientId)
      if (cancelled) return
      if (invRes.error) {
        setLoading(false)
        showError(invRes.error.message)
        navigate('/portal/invoices', { replace: true })
        return
      }
      setInvoice(invRes.data)

      const bundleRes = await opsApi.getBillingDocumentBundleForClient(
        'invoice',
        id,
        clientId,
      )
      if (cancelled) return
      setLoading(false)
      if (bundleRes.error) {
        showError(bundleRes.error.message)
        return
      }
      setPrintModel(bundleRes.data.model)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [id, clientId, showError, navigate])

  const printInvoice = useCallback(async () => {
    if (!id || !clientId) return
    const opened = openBillingDocumentPrintWindow()
    if (!opened.ok) {
      showError(opened.message)
      return
    }
    const { win } = opened
    setPrinting(true)
    // Same bundle builder staff uses (getBillingDocumentBundle), with client ownership check.
    const { data, error } = await opsApi.getBillingDocumentBundleForClient(
      'invoice',
      id,
      clientId,
    )
    setPrinting(false)
    if (error) {
      closeBillingDocumentPrintWindow(win)
      showError(error.message)
      return
    }
    setPrintModel(data.model)
    const result = fillBillingDocumentPrintWindow(win, data.model)
    if (!result.ok) showError(result.message)
  }, [id, clientId, showError])

  if (loading) {
    return <p className="text-sm text-ink-400">Loading invoice…</p>
  }
  if (!invoice) return null

  const lines = invoice.lines || []
  const billing = clientInvoiceBillingDisplay(invoice)
  const displayStatus = invoiceDisplayStatus(invoice)
  const balanceDue = invoiceBalanceDue(invoice)
  const nextBilling = nextBillingSummary(invoice)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to="/portal/invoices"
            className="text-xs font-semibold text-ink-400 hover:text-ink-200"
          >
            ← Invoices
          </Link>
          <h1 className="mt-2 font-display text-2xl font-bold text-white">
            Invoice {invoice.number || '—'}
          </h1>
          <p className="mt-1 text-sm text-ink-300">
            {invoice.billing_period ? (
              <>
                Billing {billing.value}
                {' · '}
              </>
            ) : null}
            Due {invoice.due_date || '—'} ·{' '}
            <span className="capitalize">{displayStatus}</span>
            {' · '}
            Balance due{' '}
            <span className="font-semibold text-white">{formatPula(balanceDue)}</span>
          </p>
          {nextBilling ? (
            <p className="mt-1 text-xs text-ink-400">
              This is a recurring monthly fee. Your next invoice covers {nextBilling.periodLabel} and
              falls due {nextBilling.dueDate}.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {balanceDue > 0.001 ? (
            <Link to={`/portal/payments/notify?invoice=${invoice.id}`} className={adminBtnPrimary}>
              I&rsquo;ve paid this
            </Link>
          ) : null}
          <button
            type="button"
            onClick={printInvoice}
            disabled={printing}
            className={balanceDue > 0.001 ? adminBtnSecondary : adminBtnPrimary}
          >
            {printing ? 'Loading…' : 'Print / Save PDF'}
          </button>
          <Link to="/portal/invoices" className={adminBtnSecondary}>
            Back
          </Link>
        </div>
      </div>

      <div className={`${adminTableShellClass} bg-ink-900/40`}>
        <table className={adminTableClass}>
          <thead className="bg-ink-950/50 text-xs uppercase tracking-wider text-ink-400">
            <tr>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3 text-right">Qty</th>
              <th className={`px-4 py-3 text-right ${adminColSecondary}`}>Unit price</th>
              <th className="px-4 py-3 text-right">Line total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {lines.map((line) => (
              <tr key={line.id || `${line.sort_order}-${line.description}`}>
                <td className="min-w-0 break-words px-4 py-3 text-ink-200">{line.description}</td>
                <td className="px-4 py-3 text-right tabular-nums text-ink-300">
                  {line.quantity}
                </td>
                <td className={`px-4 py-3 text-right tabular-nums text-ink-300 ${adminColSecondary}`}>
                  {formatPula(line.unit_price)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-ink-200">
                  {formatPula(line.line_total ?? Number(line.quantity) * Number(line.unit_price))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ml-auto max-w-xs space-y-1 text-sm">
        <div className="flex justify-between gap-4 text-ink-300">
          <span>Subtotal</span>
          <span className="tabular-nums">{formatPula(invoice.subtotal)}</span>
        </div>
        {Number(invoice.discount_amount) > 0 ? (
          <div className="flex justify-between gap-4 text-ink-300">
            <span>Discount</span>
            <span className="tabular-nums">−{formatPula(invoice.discount_amount)}</span>
          </div>
        ) : null}
        {Number(invoice.tax_amount) > 0 ? (
          <div className="flex justify-between gap-4 text-ink-300">
            <span>VAT</span>
            <span className="tabular-nums">{formatPula(invoice.tax_amount)}</span>
          </div>
        ) : null}
        <div className="flex justify-between gap-4 border-t border-white/10 pt-2 font-semibold text-white">
          <span>Total</span>
          <span className="tabular-nums">{formatPula(invoice.total)}</span>
        </div>
        <div className="flex justify-between gap-4 text-ink-300">
          <span>Paid</span>
          <span className="tabular-nums">{formatPula(invoice.amount_paid)}</span>
        </div>
        <div className="flex justify-between gap-4 font-semibold text-white">
          <span>Balance due</span>
          <span className="tabular-nums">{formatPula(invoiceBalanceDue(invoice))}</span>
        </div>
      </div>

      {invoice.notes ? (
        <p className="rounded-xl border border-white/10 bg-ink-900/40 px-4 py-3 text-sm text-ink-300">
          {invoice.notes}
        </p>
      ) : null}

      <InvoiceQueryThread invoiceId={invoice.id} clientId={clientId} authorRole="client" />

      <BillingDocumentScreenFooter model={printModel} />
    </div>
  )
}
