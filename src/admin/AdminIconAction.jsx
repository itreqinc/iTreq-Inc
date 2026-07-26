import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

function ActionIcon({ d }) {
  const paths = Array.isArray(d) ? d : [d]
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
      {paths.map((path) => (
        <path key={path} d={path} />
      ))}
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
  eye: [
    'M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z',
    'M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  ],
  ban: 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636',
  checkCircle: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  mail: 'M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75',
  invoice:
    'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
  payment:
    'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z',
  x: 'M6 18L18 6M6 6l12 12',
  check: 'M4.5 12.75l6 6 9-13.5',
  plus: 'M12 4.5v15m7.5-7.5h-15',
  key: 'M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z',
}

/** Icon button with hover/focus callout (ported so table overflow does not clip it). */
export function AdminIconAction({
  label,
  onClick,
  disabled,
  tone = 'default',
  children,
  icon,
}) {
  const [showTip, setShowTip] = useState(false)
  const [coords, setCoords] = useState(null)
  const btnRef = useRef(null)
  const tipRef = useRef(null)

  const toneClass =
    tone === 'danger'
      ? 'text-red-400 hover:bg-red-500/10 hover:text-red-300'
      : tone === 'muted'
        ? 'text-ink-400 hover:bg-white/5 hover:text-ink-200'
        : 'text-brand-400 hover:bg-brand-500/10 hover:text-brand-300'

  useLayoutEffect(() => {
    if (!showTip || !btnRef.current) {
      setCoords(null)
      return
    }

    function place() {
      const btn = btnRef.current
      const tip = tipRef.current
      if (!btn) return
      const rect = btn.getBoundingClientRect()
      const tipW = tip?.offsetWidth || 72
      const tipH = tip?.offsetHeight || 28
      const gap = 6
      const pad = 8

      let top = rect.bottom + gap
      if (top + tipH > window.innerHeight - pad) {
        top = Math.max(pad, rect.top - gap - tipH)
      }

      let left = rect.right - tipW
      left = Math.min(Math.max(pad, left), window.innerWidth - tipW - pad)

      setCoords({ top, left })
    }

    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [showTip, label])

  return (
    <button
      ref={btnRef}
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setShowTip(true)}
      onMouseLeave={() => setShowTip(false)}
      onFocus={() => setShowTip(true)}
      onBlur={() => setShowTip(false)}
      className={`inline-flex rounded-md p-1.5 transition disabled:cursor-not-allowed disabled:opacity-40 ${toneClass}`}
    >
      {icon ? <ActionIcon d={ADMIN_ACTION_ICONS[icon] || icon} /> : children}
      {showTip && typeof document !== 'undefined'
        ? createPortal(
            <span
              ref={tipRef}
              role="tooltip"
              style={
                coords
                  ? { position: 'fixed', top: coords.top, left: coords.left }
                  : { position: 'fixed', top: 0, left: 0, visibility: 'hidden' }
              }
              className="pointer-events-none z-[110] whitespace-nowrap rounded-md border border-white/10 bg-ink-900 px-2 py-1 text-[11px] font-medium text-ink-100 shadow-lg"
            >
              {label}
            </span>,
            document.body,
          )
        : null}
    </button>
  )
}
