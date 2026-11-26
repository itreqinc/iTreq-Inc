import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { opsApi } from '../../lib/opsApi'
import { payrollApi } from '../../lib/payrollApi'
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
  clearExpenseEditId,
  expenseEditPath,
  expenseListPath,
  expenseNewPath,
  readExpenseEditId,
  rememberExpenseEditId,
} from '../../lib/expenseEditSession'
import {
  adminBtnDanger,
  adminBtnPrimary,
  adminBtnSecondary,
  adminPageActionFloat,
  adminPageActionFloatBtn,
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
    staff_user_id: '',
    vendor: '',
    method: 'cash',
    reference: '',
    notes: '',
  }
}

function categorySystemKey(categories, categoryId) {
  const cat = (categories || []).find((c) => String(c.id) === String(categoryId))
  return cat?.system_key || null
}

function snapshotExpenseForm(form) {
  return JSON.stringify({
    expense_date: form.expense_date || '',
    amount: String(form.amount ?? ''),
    category_id: form.category_id || '',
    staff_user_id: form.staff_user_id || '',
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
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const editReference = useMemo(() => {
    const match = location.pathname.match(/\/expenses\/edit\/([^/]+)\/?$/)
    return match ? match[1] : ''
  }, [location.pathname])
  const isNewRoute =
    /\/expenses\/new\/?$/.test(location.pathname) || params.get('new') === '1'
  const isEditRoute = Boolean(editReference)
  const { showError, showSuccess, confirm } = useOpsAlert()
  const { formRef, highlightId, scrollToForm, highlightRow, releaseHighlight } =
    useScrollAndHighlight()
  const [rows, setRows] = useState([])
  const [categories, setCategories] = useState([])
  const [staffOptions, setStaffOptions] = useState([])
  const [linkedAdvanceId, setLinkedAdvanceId] = useState(null)
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
    const [e, c, s] = await Promise.all([
      opsApi.listExpenses(),
      opsApi.listExpenseCategories({ activeOnly: false }),
      payrollApi.listStaffHr(),
    ])
    setLoading(false)
    if (e.error) {
      showError(e.error.message)
      return
    }
    if (c.error) showError(c.error.message)
    setRows(e.data || [])
    setCategories(c.data || [])
    if (!s.error && s.data?.success !== false) {
      const people = s.data?.staff || s.data?.users || []
      setStaffOptions(
        (people || [])
          .filter((p) => p.is_active !== false)
          .map((p) => ({
            value: p.id || p.user_id,
            label: p.name || [p.first_name, p.surname].filter(Boolean).join(' ') || 'Staff',
          }))
          .filter((o) => o.value),
      )
    }
  }, [showError])

  useEffect(() => {
    load()
  }, [load])

  const activeCategories = useMemo(
    () =>
      (categories || []).filter((c) => {
        // Payday Salary lines are system-generated — hide from the picker.
        if (c.system_key === 'salary' && c.id !== form.category_id) return false
        return c.active || c.id === form.category_id
      }),
    [categories, form.category_id],
  )

  const selectedSystemKey = useMemo(
    () => categorySystemKey(categories, form.category_id),
    [categories, form.category_id],
  )
  const needsStaffLink =
    selectedSystemKey === 'staff_rem_benefits' || selectedSystemKey === 'salary_advance'

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
    focusId: showForm && editingId ? editingId : null,
  })

  useEffect(() => {
    setSavedPeek(null)
  }, [dateFrom, dateTo, dateSort])

  const isDirty = useMemo(
    () => Boolean(editingId) && snapshotExpenseForm(form) !== baseline,
    [editingId, form, baseline],
  )

  const applyExpenseToForm = useCallback(async (data) => {
    const nextForm = {
      expense_date: data.expense_date || todayIso(),
      amount: String(data.amount ?? ''),
      category_id: data.category_id || '',
      staff_user_id: data.staff_user_id || '',
      vendor: data.vendor || '',
      method: data.method || 'cash',
      reference: data.reference || '',
      notes: data.notes || '',
    }
    setEditingId(data.id)
    setForm(nextForm)
    setBaseline(snapshotExpenseForm(nextForm))
    setShowForm(true)
    setLinkedAdvanceId(null)
    const { data: adv } = await opsApi.getAdvanceForExpense(data.id)
    if (adv?.id) setLinkedAdvanceId(adv.id)
  }, [])

  const openRow = useCallback(
    async (rowOrId, { syncUrl = true } = {}) => {
      const id = typeof rowOrId === 'string' ? rowOrId : rowOrId?.id
      // From the list: stash id + go to /edit/:reference; the edit route loads the form.
      if (syncUrl && rowOrId && typeof rowOrId === 'object') {
        rememberExpenseEditId(id, rowOrId)
        navigate(expenseEditPath(rowOrId), { replace: false })
        return rowOrId
      }
      const { data, error } = await opsApi.getExpense(id)
      if (error) {
        showError(error.message)
        clearExpenseEditId()
        if (isEditRoute) navigate(expenseListPath(), { replace: true })
        return null
      }
      rememberExpenseEditId(data.id, data)
      applyExpenseToForm(data)
      const nextPath = expenseEditPath(data)
      if (syncUrl) {
        navigate(nextPath, { replace: false })
      } else if (location.pathname !== nextPath) {
        navigate(nextPath, { replace: true })
      }
      return data
    },
    [showError, applyExpenseToForm, navigate, isEditRoute, location.pathname],
  )

  const openNewForm = useCallback(() => {
    clearExpenseEditId()
    setEditingId(null)
    setLinkedAdvanceId(null)
    setBaseline('')
    setForm(emptyExpenseForm())
    setShowForm(true)
  }, [])

  // Legacy ?open=<id> / ?new=1 → clean paths
  useEffect(() => {
    const openId = params.get('open')
    if (openId) {
      rememberExpenseEditId(openId, 'record')
      const next = new URLSearchParams(params)
      next.delete('open')
      next.delete('new')
      const qs = next.toString()
      navigate(`${expenseEditPath({ reference: '', expense_date: '' })}${qs ? `?${qs}` : ''}`, {
        replace: true,
      })
      return
    }
    if (params.get('new') === '1' && !/\/expenses\/new\/?$/.test(location.pathname)) {
      const next = new URLSearchParams(params)
      next.delete('new')
      const qs = next.toString()
      navigate(`${expenseNewPath()}${qs ? `?${qs}` : ''}`, { replace: true })
    }
  }, [params, location.pathname, navigate])

  useEffect(() => {
    if (!isEditRoute) return
    const storedId = readExpenseEditId(editReference)
    if (!storedId) {
      if (loading) return
      // Best-effort: match slug against loaded rows when session map is empty.
      const match = (rows || []).find((row) => expenseEditPath(row).endsWith(`/edit/${editReference}`))
      if (match?.id) {
        rememberExpenseEditId(match.id, match)
        void openRow(match.id, { syncUrl: false })
        return
      }
      showError('That expense edit link expired. Open it again from the list.')
      navigate(expenseListPath(), { replace: true })
      return
    }
    if (showForm && String(editingId) === String(storedId)) return
    void openRow(storedId, { syncUrl: false })
  }, [
    isEditRoute,
    editReference,
    showForm,
    editingId,
    openRow,
    navigate,
    showError,
    rows,
    loading,
  ])

  useEffect(() => {
    if (!isNewRoute) return
    if (showForm && !editingId) return
    openNewForm()
    scrollToForm()
  }, [isNewRoute, showForm, editingId, openNewForm, scrollToForm])

  useEffect(() => {
    if (isEditRoute || isNewRoute || !showForm) return
    setShowForm(false)
    setEditingId(null)
    setBaseline('')
    setForm(emptyExpenseForm())
  }, [isEditRoute, isNewRoute, showForm])

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setLinkedAdvanceId(null)
    setBaseline('')
    setForm(emptyExpenseForm())
    clearExpenseEditId()
    navigate(expenseListPath(), { replace: true })
  }

  function startNew() {
    openNewForm()
    navigate(expenseNewPath(), { replace: false })
    scrollToForm()
  }

  function onCategoryChange(categoryId) {
    const key = categorySystemKey(categories, categoryId)
    setForm((f) => ({
      ...f,
      category_id: categoryId,
      vendor: key === 'salary_advance' || key === 'staff_rem_benefits' ? f.vendor : '',
      staff_user_id:
        key === 'salary_advance' || key === 'staff_rem_benefits' ? f.staff_user_id : '',
    }))
  }

  function renderExpenseForm({ variant = 'panel' } = {}) {
    const inline = variant === 'inline'
    return (
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className={
          inline
            ? 'space-y-4'
            : 'space-y-4 rounded-2xl border border-white/10 bg-ink-900/90 p-4 sm:p-5'
        }
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
          {needsStaffLink ? (
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                Linked staff *
              </span>
              <SearchableSelect
                required
                options={staffOptions}
                value={form.staff_user_id}
                onChange={(staff_user_id) => setForm((f) => ({ ...f, staff_user_id }))}
                placeholder="Type to find a staff member…"
                emptyMessage="No matching staff"
                clearAriaLabel="Clear staff"
              />
            </label>
          ) : null}
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
          {selectedSystemKey === 'salary_advance' ? null : (
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
          )}
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
            {saving ? 'Saving…' : editingId ? 'Save changes' : 'Record expense'}
          </button>
          {editingId ? (
            <button
              type="button"
              disabled={saving}
              onClick={() =>
                handleDelete({
                  id: editingId,
                  amount: form.amount,
                  expense_categories: { name: 'expense' },
                })
              }
              className={adminBtnDanger}
            >
              Delete
            </button>
          ) : null}
        </div>
      </form>
    )
  }

  /** Scroll the inline edit into view once it is mounted under the row. */
  useEffect(() => {
    if (!showForm || !editingId) return
    scrollToForm()
  }, [showForm, editingId, scrollToForm])

  function goToSavedPeek() {
    if (!savedPeek?.id) return
    const page = savedPeek.page
    setSavedPeek(null)
    if (page) expensePage.setPage(page)
    highlightRow(savedPeek.id)
  }

  function placeSavedRow(saved, { hold = false } = {}) {
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
      highlightRow(saved.id, { scroll: false, hold })
      return
    }

    const targetPage = Math.floor(index / pageSize) + 1
    if (targetPage === currentPage) {
      setSavedPeek(null)
      highlightRow(saved.id, { hold })
      return
    }

    setSavedPeek({
      id: saved.id,
      page: targetPage,
      placement: targetPage < currentPage ? 'above' : 'below',
      row: saved,
      outsideFilter: false,
    })
    highlightRow(saved.id, { scroll: false, hold })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (needsStaffLink && !form.staff_user_id) {
      showError('Select the linked staff member.')
      return
    }
    const isAdvance = selectedSystemKey === 'salary_advance'
    if (!isAdvance && linkedAdvanceId) {
      showError(
        'This expense is linked to a salary advance. Keep category as Salary advance, or delete the advance first.',
      )
      return
    }
    const ok = await confirm({
      title: editingId ? 'Save expense changes?' : 'Record this expense?',
      message: editingId
        ? 'Your updates to this expense will be saved.'
        : isAdvance
          ? `Record a salary advance of ${formatPula(form.amount)}? This also creates an Advances row.`
          : `Record ${formatPula(form.amount)} as an expense?`,
      confirmLabel: editingId ? 'Save' : 'Record',
    })
    if (!ok) return

    setSaving(true)
    let saved = null
    let error = null

    if (isAdvance) {
      if (editingId && linkedAdvanceId) {
        const res = await payrollApi.updateAdvance({
          advance_id: linkedAdvanceId,
          amount: Number(form.amount),
          advance_date: form.expense_date,
          notes: form.notes || null,
          method: form.method || 'eft',
          reference: form.reference || null,
        })
        error = res.error || (res.data?.success === false ? { message: res.data.message } : null)
        saved = res.data?.expense || null
        if (!saved && !error && editingId) {
          const again = await opsApi.getExpense(editingId)
          saved = again.data
          error = again.error
        }
      } else if (editingId && !linkedAdvanceId) {
        // Legacy advance expense without link: create the synced pair, then remove the orphan.
        const res = await payrollApi.createAdvance({
          user_id: form.staff_user_id,
          amount: Number(form.amount),
          advance_date: form.expense_date,
          notes: form.notes || null,
          method: form.method || 'eft',
          reference: form.reference || null,
        })
        error = res.error || (res.data?.success === false ? { message: res.data.message } : null)
        if (!error) {
          const del = await opsApi.deleteExpense(editingId)
          if (del.error) {
            const newAdvanceId = res.data?.advance?.id
            if (newAdvanceId) await payrollApi.deleteAdvance(newAdvanceId)
            error = {
              message:
                del.error.message ||
                'Could not replace the old expense. The new advance was rolled back.',
            }
          } else {
            saved = res.data?.expense || null
          }
        }
      } else {
        const res = await payrollApi.createAdvance({
          user_id: form.staff_user_id,
          amount: Number(form.amount),
          advance_date: form.expense_date,
          notes: form.notes || null,
          method: form.method || 'eft',
          reference: form.reference || null,
        })
        error = res.error || (res.data?.success === false ? { message: res.data.message } : null)
        saved = res.data?.expense || null
      }
      if (saved && !saved.expense_categories) {
        const again = await opsApi.getExpense(saved.id)
        if (again.data) saved = again.data
      }
    } else {
      const res = await opsApi.saveExpense({
        id: editingId,
        ...form,
        staff_user_id: needsStaffLink ? form.staff_user_id : null,
      })
      saved = res.data
      error = res.error
    }

    setSaving(false)
    if (error) {
      showError(error.message)
      return
    }
    if (!saved) {
      showError('Could not save expense.')
      return
    }
    // Refresh list so advance-linked rows appear with joins.
    await load()
    rememberLastExpenseDate(form.expense_date || saved?.expense_date)
    closeForm()
    placeSavedRow(saved, { hold: true })
    await showSuccess(
      editingId
        ? 'Expense updated.'
        : isAdvance
          ? 'Salary advance recorded (expense + advances).'
          : 'Expense recorded.',
    )
    releaseHighlight()
  }

  async function handleDelete(row) {
    const ok = await confirm({
      title: 'Delete expense?',
      message: `Delete ${formatPula(row.amount)} (${categoryName(row)})? This cannot be undone.`,
      confirmLabel: 'Delete',
    })
    if (!ok) return
    setSaving(true)
    const { data: adv } = await opsApi.getAdvanceForExpense(row.id)
    let error = null
    if (adv?.id) {
      const res = await payrollApi.deleteAdvance(adv.id)
      error = res.error || (res.data?.success === false ? { message: res.data.message } : null)
    } else {
      const res = await opsApi.deleteExpense(row.id)
      error = res.error
    }
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
      </div>

      {!showForm ? (
        <div className={adminPageActionFloat}>
          <button
            type="button"
            onClick={startNew}
            className={`${adminBtnPrimary} ${adminPageActionFloatBtn}`}
          >
            Record expense
          </button>
        </div>
      ) : null}

      {showForm && !editingId ? renderExpenseForm({ variant: 'panel' }) : null}

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
                const expanded = showForm && editingId === row.id
                return (
                  <Fragment key={row.id}>
                    <tr
                      data-row-id={row.id}
                      role="link"
                      tabIndex={0}
                      className={`group ${
                        expanded
                          ? 'accounts-surface text-white'
                          : `bg-ink-900/20 ${clickableRowClass}`
                      }${highlightId === row.id && !expanded ? ' ring-2 ring-amber-400/60' : ''}`}
                      onClick={open}
                      onKeyDown={(e) => activateRowKey(e, open)}
                    >
                      <td className={`${adminCellPad} text-ink-300`}>{row.expense_date}</td>
                      <td className={`${adminCellPad} min-w-0`}>
                        <span className={`${clickableDocClass} break-words`}>
                          {categoryName(row)}
                        </span>
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
                    {expanded ? (
                      <tr className="accounts-surface">
                        <td colSpan={7} className="border-b border-white/10 p-4 sm:p-5">
                          {renderExpenseForm({ variant: 'inline' })}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
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
