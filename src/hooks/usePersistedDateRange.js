import { useCallback, useEffect, useState } from 'react'
import { currentMonthStartIso, todayIso } from '../lib/dateRange'
import { readPersistedDateRange, writePersistedDateRange } from '../lib/persistedDateRange'

/**
 * Date-range state synced to localStorage under `key`.
 * Returns [from, setFrom, to, setTo] like useState pairs.
 */
export function usePersistedDateRange(key, defaults = {}) {
  const resolveDefault = (value, fallback) => {
    if (typeof value === 'function') return value()
    if (value != null) return value
    return fallback()
  }

  const [from, setFromState] = useState(() => {
    const stored = readPersistedDateRange(key)
    if (stored) return stored.from
    return resolveDefault(defaults.defaultFrom, currentMonthStartIso)
  })
  const [to, setToState] = useState(() => {
    const stored = readPersistedDateRange(key)
    if (stored) return stored.to
    return resolveDefault(defaults.defaultTo, todayIso)
  })

  useEffect(() => {
    const stored = readPersistedDateRange(key)
    if (stored) {
      setFromState(stored.from)
      setToState(stored.to)
      return
    }
    setFromState(resolveDefault(defaults.defaultFrom, currentMonthStartIso))
    setToState(resolveDefault(defaults.defaultTo, todayIso))
  }, [key, defaults.defaultFrom, defaults.defaultTo])

  useEffect(() => {
    writePersistedDateRange(key, { from, to })
  }, [key, from, to])

  const setFrom = useCallback((value) => setFromState(value), [])
  const setTo = useCallback((value) => setToState(value), [])

  return [from, setFrom, to, setTo]
}
