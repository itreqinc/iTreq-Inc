/**
 * On-screen footer matching printable quote/invoice bottom content
 * (banking, paid note, quotation terms) — driven by the same billing model.
 */
export function BillingDocumentScreenFooter({ model }) {
  if (!model) return null

  const bankingLines = model.company?.bankingLines || []
  const terms = model.type === 'quote' ? model.quoteTerms || [] : []
  const paidNote = model.paidNote || ''

  if (!bankingLines.length && !terms.length && !paidNote) return null

  return (
    <div className="space-y-4 border-t border-white/10 pt-4">
      {paidNote ? (
        <p className="text-sm font-medium text-emerald-300">{paidNote}</p>
      ) : null}

      {bankingLines.length ? (
        <div className="rounded-xl border border-white/10 bg-ink-900/40 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
            Banking details
          </p>
          <div className="mt-2 space-y-0.5 text-sm text-ink-200">
            {bankingLines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </div>
      ) : null}

      {terms.length ? (
        <div className="rounded-xl border border-white/10 bg-ink-900/40 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">Terms</p>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-ink-300">
            {terms.map((term) => (
              <li key={term}>{term}</li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  )
}
