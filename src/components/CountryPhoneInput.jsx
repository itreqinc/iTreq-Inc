import { useEffect, useMemo, useRef, useState } from 'react'
import { countries } from '../lib/phoneCountry'
import { adminFieldClass } from '../admin/ui'

const RECENT_KEY = 'itreq_recent_countries'

function highlightMatch(text, query) {
  if (!query) return text
  const regex = new RegExp(`(${query})`, 'ig')
  const parts = text.split(regex)
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <span key={i} className="rounded bg-brand-500/30 px-0.5">
        {part}
      </span>
    ) : (
      part
    ),
  )
}

/**
 * Country + phone input (ported from iRegistry).
 * Stores phone as dialCode + national digits (e.g. +26771234567).
 */
export function CountryPhoneInput({
  country,
  phone,
  onChange,
  errorCountry,
  errorPhone,
  required = false,
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(0)
  const wrapperRef = useRef(null)
  const listRef = useRef(null)

  const selectedCountry = countries.find((c) => c.code === country)

  const recentCountries = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(RECENT_KEY)) || []
    } catch {
      return []
    }
  }, [open])

  function saveRecent(code) {
    const updated = [code, ...recentCountries.filter((c) => c !== code)].slice(0, 5)
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated))
  }

  const filteredCountries = useMemo(() => {
    let list = countries
    if (search) {
      list = list.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    }
    if (!search && recentCountries.length > 0) {
      const recent = countries.filter((c) => recentCountries.includes(c.code))
      const rest = countries.filter((c) => !recentCountries.includes(c.code))
      return [...recent, ...rest]
    }
    return list
  }, [search, recentCountries])

  function selectCountry(c) {
    saveRecent(c.code)
    setSearch('')
    setOpen(false)
    setHighlightIndex(0)
    onChange({ country: c.code, phone: c.dialCode })
  }

  function handleKeyDown(e) {
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex((i) => Math.min(i + 1, filteredCountries.length - 1))
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex((i) => Math.max(i - 1, 0))
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const c = filteredCountries[highlightIndex]
      if (c) selectCountry(c)
    }
    if (e.key === 'Escape') setOpen(false)
  }

  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.children[highlightIndex]
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [highlightIndex])

  function handlePhoneChange(value) {
    if (!selectedCountry) return
    const digits = value.replace(/[^\d]/g, '')
    onChange({
      country,
      phone: selectedCountry.dialCode + digits,
    })
  }

  useEffect(() => {
    function close(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const nationalValue = selectedCountry
    ? String(phone || '').replace(selectedCountry.dialCode, '')
    : ''

  return (
    <div
      ref={wrapperRef}
      onKeyDown={handleKeyDown}
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-start"
    >
      <div className="relative min-w-0">
        <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
          Country{required ? ' *' : ''}
        </span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`${adminFieldClass} flex h-[42px] items-center justify-between text-left ${
            errorCountry ? 'border-red-500/60' : ''
          }`}
        >
          {selectedCountry ? (
            <span className="flex items-center gap-2 truncate">
              <img
                src={selectedCountry.flag}
                alt=""
                className="h-4 w-6 rounded-sm object-cover"
              />
              <span className="truncate">{selectedCountry.name}</span>
            </span>
          ) : (
            <span className="text-ink-500">Select country</span>
          )}
          <span className="text-ink-500">▾</span>
        </button>

        {open ? (
          <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-white/15 bg-ink-900 shadow-xl">
            <div className="border-b border-white/10 p-2">
              <input
                autoFocus
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setHighlightIndex(0)
                }}
                placeholder="Type country name"
                className={adminFieldClass}
              />
            </div>
            <div ref={listRef} className="max-h-60 overflow-y-auto">
              {filteredCountries.length === 0 ? (
                <div className="px-3 py-3 text-sm text-ink-400">No countries found</div>
              ) : (
                filteredCountries.map((c, i) => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => selectCountry(c)}
                    className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm ${
                      i === highlightIndex ? 'bg-brand-500/15' : 'hover:bg-white/5'
                    }`}
                  >
                    <img src={c.flag} alt="" className="h-4 w-6 rounded-sm object-cover" />
                    <span className="text-ink-100">{highlightMatch(c.name, search)}</span>
                    <span className="ml-auto text-xs text-ink-500">{c.dialCode}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : null}

        {errorCountry ? <p className="mt-1 text-xs text-red-300">{errorCountry}</p> : null}
      </div>

      <div className="min-w-0">
        <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
          Phone number{required ? ' *' : ''}
        </span>
        <div
          className={`${adminFieldClass} flex h-[42px] items-center gap-2 ${
            errorPhone ? 'border-red-500/60' : ''
          } ${!selectedCountry ? 'opacity-70' : ''}`}
        >
          {selectedCountry ? (
            <>
              <img
                src={selectedCountry.flag}
                alt=""
                className="h-4 w-6 shrink-0 rounded-sm object-cover"
              />
              <span className="shrink-0 text-sm text-ink-400">{selectedCountry.dialCode}</span>
            </>
          ) : null}
          <input
            disabled={!selectedCountry}
            inputMode="numeric"
            value={nationalValue}
            onChange={(e) => handlePhoneChange(e.target.value)}
            placeholder={selectedCountry ? 'Enter phone number' : 'Select country first'}
            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-ink-500"
          />
        </div>
        {errorPhone ? <p className="mt-1 text-xs text-red-300">{errorPhone}</p> : null}
      </div>
    </div>
  )
}
