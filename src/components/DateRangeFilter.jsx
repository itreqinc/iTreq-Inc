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
    <div className={`${adminTableShellClass} ${className}`.trim()}>
      <div className="grid grid-cols-1 gap-3 border-b border-white/10 p-3 sm:flex sm:flex-wrap sm:items-end sm:gap-3 sm:p-4">
        {leading ? <div className="min-w-0 w-full sm:w-auto">{leading}</div> : null}
        <YearMonthDaySelect
          size={size}
          label="From"
          value={from}
          onChange={onFromChange}
          maxYmd={todayIso()}
          className={`w-full min-w-0 sm:w-[14.5rem] ${dateClassName}`.trim()}
        />
        <YearMonthDaySelect
          size={size}
          label="To"
          value={to}
          onChange={onToChange}
          maxYmd={toMax}
          className={`w-full min-w-0 sm:w-[14.5rem] ${dateClassName}`.trim()}
        />
        <button
          type="button"
          onClick={clear}
          disabled={!active}
          className={compact ? `${adminBtnSecondary} px-3 py-1.5 text-[13px]` : adminBtnSecondary}
        >
          Clear
        </button>
        <p className="w-full text-xs text-ink-400 sm:ml-auto sm:max-w-xs">
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
