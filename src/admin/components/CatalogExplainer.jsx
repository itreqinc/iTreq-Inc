/** Short context panel for catalog-related admin pages. */
export function CatalogExplainer({ children }) {
  return (
    <div className="rounded-xl border border-brand-500/20 bg-brand-500/5 px-4 py-3 text-sm text-ink-300">
      {children}
    </div>
  )
}
