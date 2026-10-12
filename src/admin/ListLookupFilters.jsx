import { ClientSelect } from './ClientSelect'
import { adminBtnSecondary, adminFieldClass } from './ui'

/**
 * Client, a status/method select, and a free-text search for admin lists.
 */
export function ListLookupFilters({
  query,
  onQueryChange,
  queryPlaceholder,
  clients,
  clientId,
  onClientChange,
  selectLabel,
  selectValue,
  onSelectChange,
  selectOptions,
  selectPlaceholder,
}) {
  const active = Boolean(String(query || '').trim() || clientId || selectValue)

  function clear() {
    onQueryChange('')
    onClientChange('')
    onSelectChange('')
  }

  return (
    <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-2 2xl:grid-cols-[minmax(16rem,1.4fr)_minmax(14rem,1.1fr)_minmax(14rem,0.9fr)_auto]">
      <label className="block min-w-0">
        <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">Search</span>
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={queryPlaceholder}
          className={adminFieldClass}
          autoComplete="off"
        />
      </label>
      <div className="block min-w-0">
        <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">Client</span>
        <ClientSelect
          clients={clients}
          value={clientId}
          onChange={onClientChange}
          placeholder="All clients"
        />
      </div>
      <label className="block min-w-0">
        <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
          {selectLabel}
        </span>
        <select
          className={adminFieldClass}
          value={selectValue}
          onChange={(e) => onSelectChange(e.target.value)}
        >
          <option value="">{selectPlaceholder}</option>
          {selectOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={clear}
        disabled={!active}
        className={`${adminBtnSecondary} w-full md:w-auto`}
      >
        Clear search
      </button>
    </div>
  )
}
