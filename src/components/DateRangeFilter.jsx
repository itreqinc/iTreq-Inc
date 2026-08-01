import { YearMonthDaySelect } from './YearMonthDaySelect'
import { adminBtnSecondary, adminTableShellClass } from '../admin/ui'
import { dateRangeIsBackwards, endOfNextMonthIso, todayIso } from '../lib/dateRange'

/**
 * From/To toolbar + list table in one bordered shell.
 * Pass the `<table>` (or table wrapper contents) as `children`.
 * Optional `leading` renders before the date controls (e.g. view toggles).
 */
export function DateRangeFilter({
  from,
  to,
  onFromChange,
  onToChange,
  dateLabel,
  shown,
  total,
  children,
  className = '',
  leading = null,
  size = 'default',
  dateClassName = '',
}) {
  const active = Boolean(from || to)
  const backwards = dateRangeIsBackwards(from, to)
  const toMax = endOfNextMonthIso()
  const compact = size === 'compact'

  function clear() {
    onFromChange('')
    onToChange('')
  }

  return (
    <div className={`${adminTableShellClass} bg-ink-900/40 ${className}`.trim()}>
      <div className="flex flex-wrap items-end gap-3 border-b border-white/10 p-4">
        {leading}
        <YearMonthDaySelect
          size={size}
          label="From"
          value={from}
          onChange={onFromChange}
          maxYmd={todayIso()}
          className={dateClassName || undefined}
        />
        <YearMonthDaySelect
          size={size}
          label="To"
          value={to}
          onChange={onToChange}
          maxYmd={toMax}
          className={dateClassName || undefined}
        />
        <button
          type="button"
          onClick={clear}
          disabled={!active}
          className={compact ? `${adminBtnSecondary} px-3 py-1.5 text-[13px]` : adminBtnSecondary}
        >
          Clear
        </button>
        <p className="ml-auto max-w-xs text-xs text-ink-400">
          {backwards
            ? 'The “From” date is after the “To” date.'
            : active
              ? `Showing ${shown} of ${total} — by ${dateLabel}.`
              : `Pick a range to filter by ${dateLabel}.`}
        </p>
      </div>
      {children}
    </div>
  )
}
