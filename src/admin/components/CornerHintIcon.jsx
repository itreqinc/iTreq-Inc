import { ADMIN_ACTION_ICONS } from '../AdminIconAction'

/** Small icon badge for table cells (top-right corner of a pill or amount). */
export function CornerHintIcon({ icon, title, className = '' }) {
  const d = ADMIN_ACTION_ICONS[icon]
  if (!d || !title) return null
  const paths = Array.isArray(d) ? d : [d]
  return (
    <span
      className={`absolute -right-1.5 -top-1.5 z-[1] flex h-3.5 w-3.5 items-center justify-center rounded-full bg-ink-950 text-brand-300 ring-1 ring-white/25 ${className}`}
      title={title}
      aria-label={title}
      role="img"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-2.5 w-2.5"
        aria-hidden="true"
      >
        {paths.map((path) => (
          <path key={path} d={path} />
        ))}
      </svg>
    </span>
  )
}
