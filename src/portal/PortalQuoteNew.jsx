import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { opsApi } from '../lib/opsApi'
import {
  clientCanEditPortalQuote,
  qtyByTrackableFromQuoteLines,
} from '../lib/portalQuote'
import { useOpsAlert } from '../admin/OpsAlertContext'
import { adminBtnPrimary, adminBtnSecondary, adminFieldClass } from '../admin/ui'

export default function PortalQuoteNew() {
  const { id: editId } = useParams()
  const isEdit = Boolean(editId)
  const { clientId } = useOutletContext()
  const navigate = useNavigate()
  const { showError, showSuccess } = useOpsAlert()
  const [catalog, setCatalog] = useState([])
  const [qtyById, setQtyById] = useState({})
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    async function load() {
      const catalogRes = await opsApi.listTrackableItems({
        activeOnly: true,
        withComponents: true,
      })
      if (cancelled) return
      if (catalogRes.error) {
        setLoading(false)
        showError(catalogRes.error.message)
        return
      }

      const items = (catalogRes.data || []).filter((i) => (i.components || []).length > 0)
      setCatalog(items)

      if (!isEdit) {
        const next = {}
        for (const item of items) next[item.id] = ''
        setQtyById(next)
        setNotes('')
        setLoading(false)
        return
      }

      const quoteRes = await opsApi.getQuotationForClient(editId, clientId)
      if (cancelled) return
      setLoading(false)
      if (quoteRes.error) {
        showError(quoteRes.error.message)
        navigate('/portal/quotes', { replace: true })
        return
      }
      if (!clientCanEditPortalQuote(quoteRes.data)) {
        showError('This quotation can no longer be edited.')
        navigate(`/portal/quotes/${editId}`, { replace: true })
        return
      }

      setQtyById(qtyByTrackableFromQuoteLines(quoteRes.data.lines || [], items))
      setNotes(quoteRes.data.notes || '')
    }

    load()
    return () => {
      cancelled = true
    }
  }, [isEdit, editId, clientId, showError, navigate])

  const selections = useMemo(
    () =>
      catalog
        .map((item) => ({
          trackable_item_id: item.id,
          quantity: Number(qtyById[item.id]) || 0,
        }))
        .filter((s) => s.quantity > 0),
    [catalog, qtyById],
  )

  async function handleSubmit(e) {
    e.preventDefault()
    if (!selections.length) {
      showError('Choose at least one item and set a quantity.')
      return
    }
    setSubmitting(true)
    const { data, error } = isEdit
      ? await opsApi.updatePortalQuotationFromCatalog({
          id: editId,
          client_id: clientId,
          selections,
          notes,
        })
      : await opsApi.createPortalQuotationFromCatalog({
          client_id: clientId,
          selections,
          notes,
        })
    setSubmitting(false)
    if (error) {
      showError(error.message)
      return
    }
    showSuccess(
      isEdit
        ? `Quotation ${data.number || ''} updated. It remains awaiting approval.`.trim()
        : `Request received as draft quotation ${data.number || ''}. Our team will review and send it to you.`.trim(),
      isEdit ? 'Quote updated' : 'Quote requested',
    )
    navigate(`/portal/quotes/${data.id}`)
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={isEdit ? `/portal/quotes/${editId}` : '/portal/quotes'}
          className="text-xs font-semibold text-ink-400 hover:text-ink-200"
        >
          ← {isEdit ? 'Quotation' : 'Quotations'}
        </Link>
        <h1 className="mt-2 font-display text-2xl font-bold text-white">
          {isEdit ? 'Edit quote request' : 'Request a quote'}
        </h1>
        <p className="mt-1 text-sm text-ink-300">
          {isEdit
            ? 'Update what you want to track. Changes stay awaiting staff approval.'
            : 'Pick what you want to track and how many. We’ll prepare the quotation for you.'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-ink-900/40">
          {loading ? (
            <p className="px-4 py-6 text-sm text-ink-400">Loading…</p>
          ) : catalog.length === 0 ? (
            <p className="px-4 py-6 text-sm text-ink-400">
              The tracking catalog is not ready yet. Please contact iTreq Inc.
            </p>
          ) : (
            <table className="min-w-full text-left text-sm">
              <thead className="bg-ink-950/50 text-xs uppercase tracking-wider text-ink-400">
                <tr>
                  <th className="px-4 py-3">What to track</th>
                  <th className="px-4 py-3 w-28 text-right">Quantity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {catalog.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-white">{item.name}</p>
                      {item.blurb ? (
                        <p className="mt-0.5 text-xs text-ink-400">{item.blurb}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        className={`${adminFieldClass} text-right`}
                        value={qtyById[item.id] ?? ''}
                        onChange={(e) =>
                          setQtyById((q) => ({ ...q, [item.id]: e.target.value }))
                        }
                        placeholder="0"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
            Notes (optional)
          </span>
          <textarea
            rows={3}
            className={adminFieldClass}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything we should know (locations, vehicle types, etc.)"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={submitting || loading || !catalog.length}
            className={adminBtnPrimary}
          >
            {submitting
              ? isEdit
                ? 'Saving…'
                : 'Submitting…'
              : isEdit
                ? 'Save changes'
                : 'Submit request'}
          </button>
          <Link
            to={isEdit ? `/portal/quotes/${editId}` : '/portal/quotes'}
            className={adminBtnSecondary}
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
