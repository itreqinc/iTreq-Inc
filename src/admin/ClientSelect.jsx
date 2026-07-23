import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { adminFieldClass } from './ui'

/**
 * Searchable client picker — type to filter, click or Enter to select.
 */
export function ClientSelect({
  clients = [],
  value = '',
  onChange,
  disabled = false,
  required = false,
  placeholder = 'Type to find a client…',
  id,
}) {
  const listId = useId()
  const rootRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)

  const selected = useMemo(
    () => clients.find((c) => c.id === value) || null,
    [clients, value],
  )

  useEffect(() => {
    if (!open) setQuery(selected?.name || '')
  }, [selected, open, value])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return clients
    return clients.filter((c) => {
      const name = String(c.name || '').toLowerCase()
      const email = String(c.email || '').toLowerCase()
      const phone = String(c.phone || '').toLowerCase()
      return name.includes(q) || email.includes(q) || phone.includes(q)
    })
  }, [clients, query])

  useEffect(() => {
    setHighlight(0)
  }, [query, open])

  useEffect(() => {
    function onDocPointerDown(e) {
      if (!rootRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDocPointerDown)
    return () => document.removeEventListener('pointerdown', onDocPointerDown)
  }, [])

  function pick(client) {
    onChange?.(client?.id || '')
    setQuery(client?.name || '')
    setOpen(false)
  }

  function clear() {
    onChange?.('')
    setQuery('')
    setOpen(true)
  }

  function onKeyDown(e) {
    if (disabled) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setHighlight((h) => Math.min(h + 1, Math.max(filtered.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setOpen(true)
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      if (open && filtered[highlight]) {
        e.preventDefault()
        pick(filtered[highlight])
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
      setQuery(selected?.name || '')
    }
  }

  return (
    <div ref={rootRef} className="relative">
      {/* Native select keeps HTML5 required validation without showing the control */}
      <select
        tabIndex={-1}
        aria-hidden="true"
        required={required}
        value={value}
        onChange={() => {}}
        className="pointer-events-none absolute h-0 w-0 opacity-0"
      >
        <option value="">Select client…</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <div className="relative">
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          disabled={disabled}
          autoComplete="off"
          className={adminFieldClass}
          placeholder={placeholder}
          value={open ? query : selected?.name || query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            if (value) onChange?.('')
          }}
          onFocus={() => {
            setOpen(true)
            setQuery(selected?.name || '')
          }}
          onKeyDown={onKeyDown}
        />
        {value && !disabled ? (
          <button
            type="button"
            aria-label="Clear client"
            onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-1.5 text-xs text-ink-400 hover:text-ink-200"
          >
            Clear
          </button>
        ) : null}
      </div>

      {open && !disabled ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-white/10 bg-ink-950 py-1 shadow-lg"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-ink-500">No matching clients</li>
          ) : (
            filtered.map((c, i) => (
              <li key={c.id} role="option" aria-selected={c.id === value}>
                <button
                  type="button"
                  className={`flex w-full flex-col items-start px-3 py-2 text-left text-sm ${
                    i === highlight || c.id === value
                      ? 'bg-brand-500/15 text-white'
                      : 'text-ink-200 hover:bg-white/5'
                  }`}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => pick(c)}
                >
                  <span className="font-medium">{c.name}</span>
                  {c.email ? (
                    <span className="text-xs text-ink-500">{c.email}</span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}
