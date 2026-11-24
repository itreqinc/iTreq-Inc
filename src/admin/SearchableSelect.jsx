import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  adminComboboxOptionActiveClass,
  adminComboboxOptionClass,
  adminComboboxOptionMetaClass,
  adminComboboxPanelClass,
  adminFieldClass,
} from './ui'

/**
 * Type-to-filter combobox. Options: `{ value, label, sublabel? }`.
 * With `allowCustom`, typed text can be committed as the value (e.g. new vendor).
 */
export function SearchableSelect({
  options = [],
  value = '',
  onChange,
  disabled = false,
  required = false,
  placeholder = 'Type to search…',
  emptyMessage = 'No matches',
  allowCustom = false,
  clearAriaLabel = 'Clear',
  id,
}) {
  const listId = useId()
  const rootRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)

  const selected = useMemo(() => {
    const match = options.find((o) => String(o.value) === String(value))
    if (match) return match
    if (allowCustom && value) return { value, label: String(value) }
    return null
  }, [options, value, allowCustom])

  useEffect(() => {
    if (!open) setQuery(selected?.label || '')
  }, [selected, open, value])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => {
      const label = String(o.label || '').toLowerCase()
      const sub = String(o.sublabel || '').toLowerCase()
      return label.includes(q) || sub.includes(q)
    })
  }, [options, query])

  const queryTrim = query.trim()
  const exactMatch = useMemo(() => {
    if (!queryTrim) return null
    const q = queryTrim.toLowerCase()
    return (
      options.find((o) => String(o.label || '').toLowerCase() === q) ||
      options.find((o) => String(o.value) === String(queryTrim)) ||
      null
    )
  }, [options, queryTrim])

  const showCustomRow =
    allowCustom && queryTrim && !exactMatch && !filtered.some((o) => String(o.label).toLowerCase() === queryTrim.toLowerCase())

  const listItems = useMemo(() => {
    if (!showCustomRow) return filtered
    return [...filtered, { value: queryTrim, label: queryTrim, __custom: true }]
  }, [filtered, showCustomRow, queryTrim])

  useEffect(() => {
    setHighlight(0)
  }, [query, open])

  useEffect(() => {
    function onDocPointerDown(e) {
      if (!rootRef.current?.contains(e.target)) {
        if (open && allowCustom) {
          const next = query.trim()
          if (next !== String(value || '').trim()) onChange?.(next)
        }
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onDocPointerDown)
    return () => document.removeEventListener('pointerdown', onDocPointerDown)
  }, [open, allowCustom, query, value, onChange])

  function pick(option) {
    const next = option?.value ?? ''
    onChange?.(next)
    setQuery(option?.label || '')
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
      setHighlight((h) => Math.min(h + 1, Math.max(listItems.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setOpen(true)
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      if (open && listItems[highlight]) {
        e.preventDefault()
        pick(listItems[highlight])
      } else if (allowCustom && queryTrim) {
        e.preventDefault()
        pick(exactMatch || { value: queryTrim, label: queryTrim })
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
      setQuery(selected?.label || '')
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
        <option value="">Select…</option>
        {options.map((o) => (
          <option key={String(o.value)} value={o.value}>
            {o.label}
          </option>
        ))}
        {allowCustom && value && !options.some((o) => String(o.value) === String(value)) ? (
          <option value={value}>{value}</option>
        ) : null}
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
          className={`${adminFieldClass}${value && !disabled ? ' pr-14' : ''}`}
          placeholder={placeholder}
          value={open ? query : selected?.label || query}
          onChange={(e) => {
            const next = e.target.value
            setQuery(next)
            setOpen(true)
            if (allowCustom) {
              onChange?.(next)
            } else if (value) {
              onChange?.('')
            }
          }}
          onFocus={() => {
            setOpen(true)
            setQuery(selected?.label || '')
          }}
          onKeyDown={onKeyDown}
        />
        {value && !disabled ? (
          <button
            type="button"
            aria-label={clearAriaLabel}
            onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-1.5 text-xs text-ink-400 hover:text-ink-200"
          >
            Clear
          </button>
        ) : null}
      </div>

      {open && !disabled ? (
        <ul id={listId} role="listbox" className={adminComboboxPanelClass}>
          {listItems.length === 0 ? (
            <li className="px-3 py-2 text-sm text-ink-500">{emptyMessage}</li>
          ) : (
            listItems.map((o, i) => (
              <li key={o.__custom ? `__custom:${o.value}` : String(o.value)} role="option" aria-selected={String(o.value) === String(value)}>
                <button
                  type="button"
                  className={`${adminComboboxOptionClass} ${
                    i === highlight || String(o.value) === String(value)
                      ? adminComboboxOptionActiveClass
                      : ''
                  }`}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => pick(o)}
                >
                  {o.__custom ? (
                    <span>
                      Use “{o.label}”
                      <span className={`ml-1 ${adminComboboxOptionMetaClass}`}>new</span>
                    </span>
                  ) : (
                    <>
                      <span className="font-medium">{o.label}</span>
                      {o.sublabel ? (
                        <span className={adminComboboxOptionMetaClass}>{o.sublabel}</span>
                      ) : null}
                    </>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}
