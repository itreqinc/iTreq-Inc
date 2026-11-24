/**
 * Same caret used on native <select> (dates, method, etc.) and searchable fields.
 */
export function AdminSelectChevron({ className = '' }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
      className={`pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-300 ${className}`}
    >
      <path d="M4.22 6.03a.75.75 0 011.06 0L8 8.75l2.72-2.72a.75.75 0 111.06 1.06l-3.25 3.25a.75.75 0 01-1.06 0L4.22 7.09a.75.75 0 010-1.06z" />
    </svg>
  )
}
