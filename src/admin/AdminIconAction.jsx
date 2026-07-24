import { useState } from 'react'

function ActionIcon({ d }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  )
}

export const ADMIN_ACTION_ICONS = {
  pencil:
    'M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10',
  trash:
    'M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0',
  print:
    'M6.72 13.829V21m0 0h10.56m-10.56 0H4.5A2.25 2.25 0 012.25 18.75V9.75A2.25 2.25 0 014.5 7.5h15a2.25 2.25 0 012.25 2.25v9A2.25 2.25 0 0119.5 21h-2.22m-10.56 0H15M6.72 13.829V7.5A2.25 2.25 0 019 5.25h6a2.25 2.25 0 012.25 2.25v6.329',
  invoice:
    'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
  payment:
    'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z',
  x: 'M6 18L18 6M6 6l12 12',
  check: 'M4.5 12.75l6 6 9-13.5',
  plus: 'M12 4.5v15m7.5-7.5h-15',
}

/** Icon button with hover/focus callout (mounted only while shown — avoids table scrollbars). */
export function AdminIconAction({
  label,
  onClick,
  disabled,
  tone = 'default',
  children,
  icon,
}) {
  const [showTip, setShowTip] = useState(false)
  const toneClass =
    tone === 'danger'
      ? 'text-red-400 hover:bg-red-500/10 hover:text-red-300'
      : tone === 'muted'
        ? 'text-ink-400 hover:bg-white/5 hover:text-ink-200'
        : 'text-brand-400 hover:bg-brand-500/10 hover:text-brand-300'

  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
      onFocus={() => setShowTip(true)}
      onBlur={() => setShowTip(false)}
      className={`relative inline-flex rounded-md p-1.5 transition disabled:cursor-not-allowed disabled:opacity-40 ${toneClass}`}
    >
      {icon ? <ActionIcon d={ADMIN_ACTION_ICONS[icon] || icon} /> : children}
      {showTip ? (
        <span
          role="tooltip"
          className="pointer-events-none absolute right-0 top-full z-20 mt-1.5 whitespace-nowrap rounded-md border border-white/10 bg-ink-900 px-2 py-1 text-[11px] font-medium text-ink-100 shadow-lg"
        >
          {label}
        </span>
      ) : null}
    </button>
  )
}
