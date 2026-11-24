import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { opsApi } from '../../lib/opsApi'
import { upsertById, removeById } from '../../lib/listState'
import { PAYMENT_METHODS, paymentMethodLabel } from '../../lib/payments'
import { useOpsAlert } from '../OpsAlertContext'
import { YearMonthDaySelect } from '../../components/YearMonthDaySelect'
import { DateRangeFilter } from '../../components/DateRangeFilter'
import { ListPagination, useListPagination } from '../ListPagination'
import { useScrollAndHighlight } from '../hooks/useScrollAndHighlight'
import { usePersistedDateRange } from '../../hooks/usePersistedDateRange'
import { todayIso, filterByDateRange } from '../../lib/dateRange'
import {
  readLastExpenseDate,
  rememberLastExpenseDate,
} from '../../lib/expenseFormSession'
import {
  adminBtnDanger,
  adminBtnPrimary,
  adminBtnSecondary,
  adminFieldClass,
  adminTableClass,
  adminColSecondary,
  adminColAction,
  adminCellPad,
  activateRowKey,
  clickableDocClass,
  clickableRowClass,
  formatPula,
} from '../ui'
import { AdminIconAction } from '../AdminIconAction'
import { SearchableSelect } from '../SearchableSelect'

function sortExpenseRows(list, dateSort) {
  const dir = dateSort === 'asc' ? 1 : -1
  return [...(list || [])].sort((a, b) => {
    const byDate = String(a.expense_date || '').localeCompare(String(b.expense_date || ''))
    if (byDate) return byDate * dir
    return String(a.created_at || '').localeCompare(String(b.created_at || '')) * dir
  })
}

function emptyExpenseForm() {
  return {
    expense_date: readLastExpenseDate(),
    amount: '',
    category_id: '',
    vendor: '',
    method: 'cash',
    reference: '',
    notes: '',
  }
}

function snapshotExpenseForm(form) {
  return JSON.stringify({
    expense_date: form.expense_date || '',
    amount: String(form.amount ?? ''),
    category_id: form.category_id || '',
    vendor: String(form.vendor || '').trim(),
    method: form.method || 'cash',
    reference: String(form.reference || '').trim(),
    notes: String(form.notes || '').trim(),
  })
}

function categoryName(row) {
  const c = row.expense_categories
  if (Array.isArray(c)) return c[0]?.name || '—'
  return c?.name || '—'
}

/** Off-page (or out-of-filter) save teaser: click jumps to the right page. */
function SavedExpensePeek({ peek, highlighted, onOpen }) {
  if (!peek?.row) return null
  const row = peek.row
  const pageHint = peek.outsideFilter
    ? 'Outside current date filter — click to open'
    : `On page ${peek.page} — click to go there`
  return (
    <button
      type="button"
      onClick={onOpen}
      data-row-id={peek.id}
      className={`flex w-full flex-wrap items-center gap-x-4 gap-y-1 border-b border-amber-400/30 bg-amber-400/10 px-3 py-2.5 text-left text-sm transition hover:bg-amber-400/15 sm:px-4 ${
        highlighted ? 'ring-2 ring-inset ring-amber-400/60' : ''
      }`}
    >
      <span className="shrink-0 text-xs font-semibold uppercase tracking-wider text-amber-200/90">
        Just saved
      </span>
      <span className="text-ink-300">{row.expense_date || '—'}</span>
      <span className="min-w-0 flex-1 truncate text-ink-100">{categoryName(row)}</span>
      <span className={`text-ink-400 ${adminColSecondary}`}>{row.vendor || '—'}</span>
      <span className="font-medium tabular-nums text-ink-100">{formatPula(row.amount)}</span>
      <span className="w-full text-xs text-amber-200/80 sm:ml-auto sm:w-auto">{pageHint}</span>
    </button>
  )
}

export default function ExpensesPage() {
  const [params, setParams] = useSearchParams()
  const { showError, showSuccess, confirm } = useOpsAlert()
  const { formRef, highlightId, scrollToForm, highlightRow } = useScrollAndHighlight()
  const [rows, setRows] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [baseline, setBaseline] = useState('')
  const [form, setForm] = useState(emptyExpenseForm)
  /** List date order: newest first by default. */
  const [dateSort, setDateSort] = useState('desc')
  /**
   * Saved row that landed off the current page: show above/below until clicked.
   * { id, page, placement: 'above'|'below', row, outsideFilter?: boolean }
   */
  const [savedPeek, setSavedPeek] = useState(null)
  const [dateFrom, setDateFrom, dateTo, setDateTo] = usePersistedDateRange('admin.expenses')

  const load = useCallback(async () => {
    setLoading(true)
    const [e, c] = await Promise.all([
      opsApi.listExpenses(),
      opsApi.listExpenseCategories({ activeOnly: false }),
    ])
    setLoading(false)
    if (e.error) {
      showError(e.error.message)
      return
    }
    if (c.error) showError(c.error.message)
    setRows(e.data || [])
    setCategories(c.data || [])
  }, [showError])

  useEffect(() => {
    load()
  }, [load])

  const activeCategories = useMemo(
    () => (categories || []).filter((c) => c.active || c.id === form.category_id),
    [categories, form.category_id],
  )

  /** Distinct vendors previously used for the selected category (case-insensitive). */
  const vendorsForCategory = useMemo(() => {
    if (!form.category_id) return []
    const seen = new Map()
    for (const row of rows || []) {
      if (String(row.category_id) !== String(form.category_id)) continue
      const name = String(row.vendor || '').trim()
      if (!name) continue
      const key = name.toLowerCase()
      if (!seen.has(key)) seen.set(key, name)
    }
    return [...seen.values()].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    )
  }, [rows, form.category_id])

  const categoryOptions = useMemo(
    () =>
      activeCategories.map((c) => ({
        value: c.id,
        label: c.active ? c.name : `${c.name} (inactive)`,
      })),
    [activeCategories],
  )

  const vendorOptions = useMemo(
    () => vendorsForCategory.map((name) => ({ value: name, label: name })),
    [vendorsForCategory],
  )

  const visibleRows = useMemo(() => {
    const filtered = filterByDateRange(rows, dateFrom, dateTo, (row) => row.expense_date)
    return sortExpenseRows(filtered, dateSort)
  }, [rows, dateFrom, dateTo, dateSort])

  const expensePage = useListPagination(visibleRows, {
    resetKey: `${dateFrom}|${dateTo}|${dateSort}`,
  })

  useEffect(() => {
    setSavedPeek(null)
  }, [dateFrom, dateTo, dateSort])

  const isDirty = useMemo(
    () => Boolean(editingId) && snapshotExpenseForm(form) !== baseline,
    [editingId, form, baseline],
  )

  const openRow = useCallback(
    async (rowOrId) => {
      const id = typeof rowOrId === 'string' ? rowOrId : rowOrId.id
      const { data, error } = await opsApi.getExpense(id)
      if (error) {
        showError(error.message)
        return
      }
      const nextForm = {
        expense_date: data.expense_date || todayIso(),
        amount: String(data.amount ?? ''),
        category_id: data.category_id || '',
        vendor: data.vendor || '',
        method: data.method || 'cash',
        reference: data.reference || '',
        notes: data.notes || '',
      }
      setEditingId(data.id)
      setForm(nextForm)
      setBaseline(snapshotExpenseForm(nextForm))
      setShowForm(true)
    },
    [showError],
  )

  useEffect(() => {
    const openId = params.get('open')
    if (!openId) return
    openRow(openId).then(() => {
      params.delete('open')
      setParams(params, { replace: true })
    })
  }, [params, setParams, openRow])

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setBaseline('')
    setForm(emptyExpenseForm())
  }

  function startNew() {
    const next = emptyExpenseForm()
    const firstActive = (categories || []).find((c) => c.active)
    if (firstActive) next.category_id = firstActive.id
    setEditingId(null)
    setBaseline('')
    setForm(next)
    setShowForm(true)
    scrollToForm()
  }

  function onCategoryChange(categoryId) {
    setForm((f) => ({
      ...f,
      category_id: categoryId,
      vendor: '',
    }))
  }

  function goToSavedPeek() {
    if (!savedPeek?.id) return
    const page = savedPeek.page
    setSavedPeek(null)
    if (page) expensePage.setPage(page)
    highlightRow(savedPeek.id)
  }

  function placeSavedRow(saved) {
    if (!saved?.id) return
    const nextRows = upsertById(rows, saved)
    setRows(nextRows)

    const filtered = filterByDateRange(
      nextRows,
      dateFrom,
      dateTo,
      (row) => row.expense_date,
    )
    const sorted = sortExpenseRows(filtered, dateSort)
    const index = sorted.findIndex((row) => row.id === saved.id)
    const pageSize = expensePage.pageSize || 20
    const currentPage = expensePage.page || 1

    if (index < 0) {
      setSavedPeek({
        id: saved.id,
        page: null,
        placement: 'above',
        row: saved,
        outsideFilter: true,
      })
      highlightRow(saved.id, { scroll: false })
      return
    }

    const targetPage = Math.floor(index / pageSize) + 1
    if (targetPage === currentPage) {
      setSavedPeek(null)
      highlightRow(saved.id)
      return
    }

    setSavedPeek({
      id: saved.id,
      page: targetPage,
      placement: targetPage < currentPage ? 'above' : 'below',
      row: saved,
      outsideFilter: false,
    })
    highlightRow(saved.id, { scroll: false })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const ok = await confirm({
      title: editingId ? 'Save expense changes?' : 'Record this expense?',
      message: editingId
        ? 'Your updates to this expense will be saved.'
        : `Record ${formatPula(form.amount)} as an expense?`,
      confirmLabel: editingId ? 'Save' : 'Record',
    })
    if (!ok) return

    setSaving(true)
    const { data: saved, error } = await opsApi.saveExpense({
      id: editingId,
      ...form,
    })
    setSaving(false)
    if (error) {
      showError(error.message)
      return
    }
    showSuccess(editingId ? 'Expense updated.' : 'Expense recorded.')
    rememberLastExpenseDate(form.expense_date || saved?.expense_date)
    closeForm()
    placeSavedRow(saved)
  }

  async function handleDelete(row) {
    const ok = await confirm({
      title: 'Delete expense?',
      message: `Delete ${formatPula(row.amount)} (${categoryName(row)})? This cannot be undone.`,
      confirmLabel: 'Delete',
    })
    if (!ok) return
    setSaving(true)
    const { error } = await opsApi.deleteExpense(row.id)
    setSaving(false)
    if (error) {
      showError(error.message)
      return
    }
    showSuccess('Expense deleted.')
    if (editingId === row.id) closeForm()
    setRows((prev) => removeById(prev, row.id))
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Expenses</h1>
          <p className="mt-1 text-sm text-ink-300">
            Day-to-day operating costs (fuel, rent, airtime, etc.). Stock purchases stay on Stock.
          </p>
        </div>
        {!showForm ? (
          <button type="button" onClick={startNew} className={adminBtnPrimary}>
            Record expense
          </button>
        ) : null}
      </div>

      {showForm ? (
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-white/10 bg-ink-900/90 p-4 sm:p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              {editingId ? (
                <>
                  <h2 className="font-display text-lg font-bold text-white">
                    {formatPula(form.amount || 0)}
                  </h2>
                  <p className="mt-0.5 text-sm text-ink-400">
                    {form.expense_date || '—'}
                    {isDirty ? ' · unsaved changes' : ''}
                  </p>
                </>
              ) : (
                <h2 className="text-sm font-semibold text-white">New expense</h2>
              )}
            </div>
            <button type="button" onClick={closeForm} className={adminBtnSecondary}>
              Close
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <YearMonthDaySelect
              label="Date"
              required
              value={form.expense_date}
              onChange={(expense_date) => setForm((f) => ({ ...f, expense_date }))}
            />
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                Amount (P) *
              </span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                required
                className={adminFieldClass}
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                Category *
              </span>
              <SearchableSelect
                required
                options={categoryOptions}
                value={form.category_id}
                onChange={onCategoryChange}
                placeholder="Type to find a category…"
                emptyMessage="No matching categories"
                clearAriaLabel="Clear category"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                Method
              </span>
              <select
                className={adminFieldClass}
                value={form.method}
                onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                Who was paid (optional)
              </span>
              <SearchableSelect
                allowCustom
                disabled={!form.category_id}
                options={vendorOptions}
                value={form.vendor}
                onChange={(vendor) => setForm((f) => ({ ...f, vendor }))}
                placeholder={
                  form.category_id
                    ? vendorsForCategory.length
                      ? 'Type to find or add a supplier…'
                      : 'Type a supplier name…'
                    : 'Select a category first'
                }
                emptyMessage="No matching suppliers — keep typing to add new"
                clearAriaLabel="Clear supplier"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                Reference (optional)
              </span>
              <input
                className={adminFieldClass}
                value={form.reference}
                onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
                placeholder="Receipt #, EFT reference…"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">Notes</span>
              <textarea
                rows={2}
                className={`${adminFieldClass} resize-y`}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={saving} className={adminBtnPrimary}>
              {saving
                ? 'Saving…'
                : editingId
                  ? 'Save changes'
                  : 'Record expense'}
            </button>
            {editingId ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => handleDelete({ id: editingId, amount: form.amount, expense_categories: { name: 'expense' } })}
                className={adminBtnDanger}
              >
                Delete
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      <DateRangeFilter
        from={dateFrom}
        to={dateTo}
        onFromChange={setDateFrom}
        onToChange={setDateTo}
        dateLabel="expense date"
        shown={visibleRows.length}
        total={rows.length}
      >
        {savedPeek?.placement === 'above' ? (
          <SavedExpensePeek
            peek={savedPeek}
            highlighted={highlightId === savedPeek.id}
            onOpen={goToSavedPeek}
          />
        ) : null}
        <table className={adminTableClass}>
          <thead className="bg-ink-900/80 text-xs uppercase tracking-wider text-ink-400">
            <tr>
              <th className={adminCellPad}>
                <button
                  type="button"
                  onClick={() => setDateSort((d) => (d === 'asc' ? 'desc' : 'asc'))}
                  className="inline-flex items-center gap-1 rounded-md text-left uppercase tracking-wider text-ink-400 transition hover:text-ink-200"
                  aria-label={
                    dateSort === 'asc'
                      ? 'Date sorted oldest first. Click for newest first.'
                      : 'Date sorted newest first. Click for oldest first.'
                  }
                  title={dateSort === 'asc' ? 'Oldest first' : 'Newest first'}
                >
                  Date
                  <svg
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className={`h-3.5 w-3.5 shrink-0 transition ${
                      dateSort === 'desc' ? 'rotate-180' : ''
                    }`}
                    aria-hidden
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </th>
              <th className={adminCellPad}>Category</th>
              <th className={`${adminCellPad} ${adminColSecondary}`}>Vendor</th>
              <th className={`${adminCellPad} ${adminColSecondary}`}>Method</th>
              <th className={`${adminCellPad} ${adminColSecondary}`}>Reference</th>
              <th className={`${adminCellPad} text-right`}>Amount</th>
              <th className={`${adminCellPad} ${adminColAction}`} />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              <tr>
                <td colSpan={7} className={`${adminCellPad} text-ink-400`}>
                  Loading…
                </td>
              </tr>
            ) : visibleRows.length === 0 ? (
              <tr>
                <td colSpan={7} className={`${adminCellPad} text-ink-400`}>
                  {rows.length === 0
                    ? 'No expenses recorded yet.'
                    : 'No expenses in the selected date range.'}
                </td>
              </tr>
            ) : (
              expensePage.rows.map((row) => {
                const open = () => openRow(row)
                return (
                  <tr
                    key={row.id}
                    data-row-id={row.id}
                    role="link"
                    tabIndex={0}
                    className={`group bg-ink-900/20 ${clickableRowClass}${
                      highlightId === row.id ? ' ring-2 ring-amber-400/60' : ''
                    }`}
                    onClick={open}
                    onKeyDown={(e) => activateRowKey(e, open)}
                  >
                    <td className={`${adminCellPad} text-ink-300`}>{row.expense_date}</td>
                    <td className={`${adminCellPad} min-w-0`}>
                      <span className={`${clickableDocClass} break-words`}>{categoryName(row)}</span>
                    </td>
                    <td className={`${adminCellPad} ${adminColSecondary} text-ink-300`}>
                      {row.vendor || '—'}
                    </td>
                    <td className={`${adminCellPad} ${adminColSecondary} text-ink-300`}>
                      {paymentMethodLabel(row.method)}
                    </td>
                    <td className={`${adminCellPad} ${adminColSecondary} text-ink-300`}>
                      {row.reference || '—'}
                    </td>
                    <td className={`${adminCellPad} text-right font-medium text-ink-100`}>
                      {formatPula(row.amount)}
                    </td>
                    <td
                      className={`${adminCellPad} text-right ${adminColAction}`}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <div className="inline-flex items-center justify-end gap-0.5">
                        <AdminIconAction
                          label="Edit"
                          icon="pencil"
                          disabled={saving}
                          onClick={open}
                        />
                        <AdminIconAction
                          label="Delete"
                          icon="trash"
                          tone="danger"
                          disabled={saving}
                          onClick={() => handleDelete(row)}
                        />
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
        {savedPeek?.placement === 'below' ? (
          <SavedExpensePeek
            peek={savedPeek}
            highlighted={highlightId === savedPeek.id}
            onOpen={goToSavedPeek}
          />
        ) : null}
        <ListPagination list={expensePage} />
      </DateRangeFilter>
    </div>
  )
}
