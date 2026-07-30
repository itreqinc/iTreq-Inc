import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { buildRecipientKey } from '../lib/quoteRecipient'
import { adminFieldClass } from './ui'

/**
 * Searchable picker for clients and open leads (quotation recipients).
 * Value is `client:<uuid>` or `lead:<uuid>`.
 */
export function QuoteRecipientSelect({
  clients = [],
  leads = [],
  value = '',
  onChange,
  disabled = false,
  required = false,
  placeholder = 'Type to find a client or lead…',
  id,
}) {
  const listId = useId()
  const rootRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)

  const options = useMemo(() => {
    const clientOpts = clients.map((c) => ({
      key: buildRecipientKey('client', c.id),
      kind: 'client',
      name: c.name,
      email: c.email,
      badge: null,
    }))
    const leadOpts = leads.map((l) => ({
      key: buildRecipientKey('lead', l.id),
      kind: 'lead',
      name: l.name,
      email: l.email,
      badge: 'Lead',
    }))
    return [...clientOpts, ...leadOpts]
  }, [clients, leads])

  const selected = useMemo(
    () => options.find((o) => o.key === value) || null,
    [options, value],
  )

  useEffect(() => {
    if (!open) setQuery(selected?.name || '')
  }, [selected, open, value])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => {
      const name = String(o.name || '').toLowerCase()
      const email = String(o.email || '').toLowerCase()
      return name.includes(q) || email.includes(q)
    })
  }, [options, query])

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

  function pick(option) {
    onChange?.(option?.key || '')
    setQuery(option?.name || '')
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
      <select
        tabIndex={-1}
        aria-hidden="true"
        required={required}
        value={value}
        onChange={() => {}}
        className="pointer-events-none absolute h-0 w-0 opacity-0"
      >
        <option value="">Select recipient…</option>
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.name}
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
            aria-label="Clear recipient"
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
            <li className="px-3 py-2 text-sm text-ink-500">No matching clients or leads</li>
          ) : (
            filtered.map((o, i) => (
              <li key={o.key} role="option" aria-selected={o.key === value}>
                <button
                  type="button"
                  className={`flex w-full flex-col items-start px-3 py-2 text-left text-sm ${
                    i === highlight || o.key === value
                      ? 'bg-brand-500/15 text-white'
                      : 'text-ink-200 hover:bg-white/5'
                  }`}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => pick(o)}
                >
                  <span className="font-medium">
                    {o.name}
                    {o.badge ? (
                      <span className="ml-2 rounded-md bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                        {o.badge}
                      </span>
                    ) : null}
                  </span>
                  {o.email ? (
                    <span className="text-xs text-ink-500">{o.email}</span>
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
