import {
  useCallback,
  useEffect,
  useState } from 'react'
import { Link,
  useNavigate,
  useOutletContext,
  useParams } from 'react-router-dom'
import { opsApi } from '../lib/opsApi'
import {
  clientCanEditPortalQuote,
  portalQuoteAwaitingApproval,
  } from '../lib/portalQuote'
import {
  openBillingDocumentPrintWindow,
  fillBillingDocumentPrintWindow,
  closeBillingDocumentPrintWindow,
  } from '../lib/billingDocument'
import { useOpsAlert } from '../admin/OpsAlertContext'
import { adminBtnPrimary,
  adminBtnSecondary,
  adminBtnDanger,
  formatPula,
  adminTableShellClass,
  adminTableClass,
  adminColSecondary,
} from '../admin/ui'
import { BillingDocumentScreenFooter } from './BillingDocumentScreenFooter'

export default function PortalQuoteDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { clientId } = useOutletContext()
  const { showError, showSuccess, confirm } = useOpsAlert()
  const [quote, setQuote] = useState(null)
  const [printModel, setPrintModel] = useState(null)
  const [loading, setLoading] = useState(true)
  const [printing, setPrinting] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setPrintModel(null)

    async function load() {
      const quoteRes = await opsApi.getQuotationForClient(id, clientId)
      if (cancelled) return
      if (quoteRes.error) {
        setLoading(false)
        showError(quoteRes.error.message)
        navigate('/portal/quotes', { replace: true })
        return
      }
      setQuote(quoteRes.data)

      const bundleRes = await opsApi.getBillingDocumentBundleForClient(
        'quote',
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

  const printQuote = useCallback(async () => {
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
      'quote',
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

  async function handleDelete() {
    if (!quote || !clientCanEditPortalQuote(quote)) return
    const ok = await confirm({
      title: 'Delete quotation?',
      message: `Delete quotation ${quote.number || ''}? This cannot be undone.`,
      confirmLabel: 'Delete',
    })
    if (!ok) return
    setDeleting(true)
    const { error } = await opsApi.deleteQuotationForClient(id, clientId)
    setDeleting(false)
    if (error) {
      showError(error.message)
      return
    }
    showSuccess('Quotation deleted.', 'Deleted')
    navigate('/portal/quotes', { replace: true })
  }

  if (loading) {
    return <p className="text-sm text-ink-400">Loading quotation…</p>
  }
  if (!quote) return null

  const lines = quote.lines || []
  const canPrint = !['cancelled', 'declined'].includes(quote.status)
  const canEdit = clientCanEditPortalQuote(quote)
  const awaiting = portalQuoteAwaitingApproval(quote)
  const statusText =
    quote.status === 'accepted' ? 'approved' : quote.status

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to="/portal/quotes"
            className="text-xs font-semibold text-ink-400 hover:text-ink-200"
          >
            ← Quotations
          </Link>
          <h1 className="mt-2 font-display text-2xl font-bold text-white">
            Quotation {quote.number || '—'}
          </h1>
          <p className="mt-1 text-sm text-ink-300">
            {quote.issue_date || '—'} ·{' '}
            {awaiting ? (
              <span className="font-medium text-amber-200">Awaiting approval</span>
            ) : (
              <span className="capitalize">{statusText}</span>
            )}
          </p>
          {quote.status === 'declined' ? (
            <p className="mt-3 max-w-xl rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              <span className="font-semibold">We could not take this on.</span>{' '}
              {quote.decline_reason || 'Please contact us and we will explain.'}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit ? (
            <>
              <Link to={`/portal/quotes/${id}/edit`} className={adminBtnPrimary}>
                Edit
              </Link>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className={adminBtnDanger}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </>
          ) : null}
          {canPrint ? (
            <button
              type="button"
              onClick={printQuote}
              disabled={printing}
              className={adminBtnPrimary}
            >
              {printing ? 'Loading…' : 'Print / Save PDF'}
            </button>
          ) : null}
          <Link to="/portal/quotes" className={adminBtnSecondary}>
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
          <span className="tabular-nums">{formatPula(quote.subtotal)}</span>
        </div>
        {Number(quote.discount_amount) > 0 ? (
          <div className="flex justify-between gap-4 text-ink-300">
            <span>Discount</span>
            <span className="tabular-nums">−{formatPula(quote.discount_amount)}</span>
          </div>
        ) : null}
        {Number(quote.tax_amount) > 0 ? (
          <div className="flex justify-between gap-4 text-ink-300">
            <span>VAT</span>
            <span className="tabular-nums">{formatPula(quote.tax_amount)}</span>
          </div>
        ) : null}
        <div className="flex justify-between gap-4 border-t border-white/10 pt-2 font-semibold text-white">
          <span>Total</span>
          <span className="tabular-nums">{formatPula(quote.total)}</span>
        </div>
      </div>

      {quote.notes ? (
        <p className="rounded-xl border border-white/10 bg-ink-900/40 px-4 py-3 text-sm text-ink-300">
          {quote.notes}
        </p>
      ) : null}

      <BillingDocumentScreenFooter model={printModel} />
    </div>
  )
}
