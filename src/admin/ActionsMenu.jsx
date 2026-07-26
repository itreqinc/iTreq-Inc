import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ADMIN_ACTION_ICONS } from './AdminIconAction'

function MenuIcon({ icon, tone }) {
  const d = ADMIN_ACTION_ICONS[icon]
  if (!d) return null
  const paths = Array.isArray(d) ? d : [d]
  const toneClass =
    tone === 'danger'
      ? 'text-red-400'
      : tone === 'muted'
        ? 'text-ink-400'
        : 'text-brand-400'
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-4 w-4 shrink-0 ${toneClass}`}
      aria-hidden="true"
    >
      {paths.map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  )
}

/**
 * Compact ⋮ menu. Portals the panel so table overflow does not clip it.
 * Items: { label, onClick, icon?, tone?, disabled? }
 */
export function ActionsMenu({ items = [], align = 'right', label = 'Actions' }) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState(null)
  const rootRef = useRef(null)
  const menuRef = useRef(null)
  const menuId = useId()

  const visible = items.filter(Boolean)

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null)
      return
    }

    function place() {
      const btn = rootRef.current?.querySelector('button[aria-haspopup="menu"]')
      const menu = menuRef.current
      if (!btn || !menu) return
      const rect = btn.getBoundingClientRect()
      const menuWidth = menu.offsetWidth || 184
      const menuHeight = menu.offsetHeight || 160
      const gap = 4
      const pad = 8

      let top = rect.bottom + gap
      if (top + menuHeight > window.innerHeight - pad) {
        top = Math.max(pad, rect.top - gap - menuHeight)
      }

      let left = align === 'left' ? rect.left : rect.right - menuWidth
      left = Math.min(Math.max(pad, left), window.innerWidth - menuWidth - pad)

      setCoords({ top, left })
    }

    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, align, visible.length])

  useEffect(() => {
    if (!open) return
    function onDoc(e) {
      const t = e.target
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!visible.length) return null

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 transition hover:bg-white/10 hover:text-white"
      >
        <span className="flex flex-col items-center justify-center gap-[3px]" aria-hidden>
          <span className="block h-[3px] w-[3px] rounded-full bg-current" />
          <span className="block h-[3px] w-[3px] rounded-full bg-current" />
          <span className="block h-[3px] w-[3px] rounded-full bg-current" />
        </span>
      </button>
      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              style={
                coords
                  ? { position: 'fixed', top: coords.top, left: coords.left }
                  : { position: 'fixed', top: 0, left: 0, visibility: 'hidden' }
              }
              className="z-[100] min-w-[11.5rem] rounded-xl border border-white/15 bg-ink-900 py-1 shadow-xl"
            >
              {visible.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={(e) => {
                    e.stopPropagation()
                    setOpen(false)
                    item.onClick?.()
                  }}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs font-semibold transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40 ${
                    item.tone === 'danger'
                      ? 'text-red-300 hover:text-red-200'
                      : 'text-ink-200 hover:text-white'
                  }`}
                >
                  {item.icon ? <MenuIcon icon={item.icon} tone={item.tone} /> : null}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
