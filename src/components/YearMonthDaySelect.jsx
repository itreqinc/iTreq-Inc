import { useEffect, useMemo, useState } from 'react'
import {
  buildYmd,
  clampYmdParts,
  dayOptions,
  monthOptions,
  parseYmd,
  yearOptions,
} from '../lib/yearMonthDay'
import { adminFieldClass } from '../admin/ui'
import { FieldBox } from './FieldBox'

const COMPACT_SELECT_CLASS =
  'w-full rounded-lg border border-white/10 bg-ink-950/80 px-2 py-1.5 text-[13px] leading-snug text-white outline-none transition focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/20'

/**
 * Date picker: year → month → day, combined as YYYY-MM-DD (same pattern as iRegistry).
 * When `label` is set, wraps in the shared FieldBox (Reports-style bordered legend).
 * Pass size="compact" for tighter toolbar layouts (short month names, smaller type).
 */
export function YearMonthDaySelect({
  label,
  value = '',
  onChange,
  required = false,
  disabled = false,
  minYear,
  maxYear,
  minYmd,
  maxYmd,
  size = 'default',
  selectClassName,
  className = '',
}) {
  const compact = size === 'compact'
  const fieldClass = selectClassName || (compact ? COMPACT_SELECT_CLASS : adminFieldClass)

  const now = new Date().getFullYear()
  // min/maxYmd narrow the dropdown options themselves, not just clamp the result.
  const minParts = useMemo(() => parseYmd(minYmd || ''), [minYmd])
  const maxParts = useMemo(() => parseYmd(maxYmd || ''), [maxYmd])

  let yMin = minYear ?? now - 5
  if (minParts.year) yMin = Math.max(yMin, Number(minParts.year))
  let yMax = maxYear ?? now + 2
  if (maxParts.year) yMax = Math.min(yMax, Number(maxParts.year))

  const parsed = useMemo(() => parseYmd(value), [value])
  const [year, setYear] = useState(parsed.year)
  const [month, setMonth] = useState(parsed.month)
  const [day, setDay] = useState(parsed.day)

  useEffect(() => {
    setYear(parsed.year)
    setMonth(parsed.month)
    setDay(parsed.day)
  }, [parsed.year, parsed.month, parsed.day])

  const years = useMemo(() => yearOptions(yMin, yMax), [yMin, yMax])
  const months = useMemo(() => {
    let list = monthOptions({ short: compact })
    if (year && maxParts.year && Number(year) === Number(maxParts.year)) {
      list = list.filter((m) => m.value <= Number(maxParts.month))
    }
    if (year && minParts.year && Number(year) === Number(minParts.year)) {
      list = list.filter((m) => m.value >= Number(minParts.month))
    }
    return list
  }, [year, minParts, maxParts, compact])
  const days = useMemo(() => {
    let list = dayOptions(year, month)
    const atMax =
      year &&
      month &&
      maxParts.year &&
      Number(year) === Number(maxParts.year) &&
      Number(month) === Number(maxParts.month)
    if (atMax) list = list.filter((d) => d <= Number(maxParts.day))
    const atMin =
      year &&
      month &&
      minParts.year &&
      Number(year) === Number(minParts.year) &&
      Number(month) === Number(minParts.month)
    if (atMin) list = list.filter((d) => d >= Number(minParts.day))
    return list
  }, [year, month, minParts, maxParts])

  function emit(y, m, d) {
    const clamped = clampYmdParts(y, m, d, minYmd, maxYmd)
    const next = buildYmd(clamped.year, clamped.month, clamped.day)
    onChange?.(next)
  }

  function onYearChange(e) {
    const y = e.target.value
    let m = month
    let d = day
    if (y && m && d) {
      const maxD = dayOptions(y, m).length
      if (Number(d) > maxD) d = String(maxD)
    }
    setYear(y)
    if (!y) {
      setMonth('')
      setDay('')
      onChange?.('')
      return
    }
    setDay(d)
    emit(y, m, d)
  }

  function onMonthChange(e) {
    const m = e.target.value
    let d = day
    if (year && m && d) {
      const maxD = dayOptions(year, m).length
      if (Number(d) > maxD) d = String(maxD)
    }
    setMonth(m)
    if (!m) {
      setDay('')
      emit(year, '', '')
      return
    }
    setDay(d)
    emit(year, m, d)
  }

  function onDayChange(e) {
    const d = e.target.value
    setDay(d)
    emit(year, month, d)
  }

  const selects = (
    <div className={`grid grid-cols-3 ${compact ? 'gap-1.5' : 'gap-2'}`}>
      <div className="min-w-0">
        <span className="sr-only">Year</span>
        <select
          value={year}
          onChange={onYearChange}
          disabled={disabled}
          aria-label={label ? `${label} year` : 'Year'}
          className={fieldClass}
        >
          <option value="">{compact ? 'Yr' : 'Year'}</option>
          {years.map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </select>
      </div>
      <div className="min-w-0">
        <span className="sr-only">Month</span>
        <select
          value={month}
          onChange={onMonthChange}
          disabled={disabled || !year}
          aria-label={label ? `${label} month` : 'Month'}
          className={fieldClass}
        >
          <option value="">{compact ? 'Mo' : 'Month'}</option>
          {months.map((m) => (
            <option key={m.value} value={String(m.value)}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <div className="min-w-0">
        <span className="sr-only">Day</span>
        <select
          value={day}
          onChange={onDayChange}
          disabled={disabled || !year || !month}
          aria-label={label ? `${label} day` : 'Day'}
          className={fieldClass}
        >
          <option value="">{compact ? 'Dy' : 'Day'}</option>
          {days.map((d) => (
            <option key={d} value={String(d)}>
              {d}
            </option>
          ))}
        </select>
      </div>
    </div>
  )

  if (label) {
    return (
      <FieldBox
        label={label}
        align="center"
        required={required}
        size={size}
        className={className}
      >
        {selects}
      </FieldBox>
    )
  }

  return <div className={`min-w-0 ${className}`.trim()}>{selects}</div>
}
