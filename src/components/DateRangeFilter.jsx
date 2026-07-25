import { YearMonthDaySelect } from './YearMonthDaySelect'
import { adminBtnSecondary, adminTableShellClass } from '../admin/ui'
import { dateRangeIsBackwards, todayIso } from '../lib/dateRange'

/**
 * From/To toolbar + list table in one bordered shell.
 * Pass the `<table>` (or table wrapper contents) as `children`.
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
}) {
  const active = Boolean(from || to)
  const backwards = dateRangeIsBackwards(from, to)

  function clear() {
    onFromChange('')
    onToChange('')
  }

  return (
    <div className={`${adminTableShellClass} bg-ink-900/40 ${className}`.trim()}>
      <div className="flex flex-wrap items-end gap-3 border-b border-white/10 p-4">
        <YearMonthDaySelect
          label="From"
          value={from}
          onChange={onFromChange}
          maxYmd={todayIso()}
        />
        <YearMonthDaySelect label="To" value={to} onChange={onToChange} maxYmd={todayIso()} />
        <button type="button" onClick={clear} disabled={!active} className={adminBtnSecondary}>
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
