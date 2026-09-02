import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { opsApi } from '../../lib/opsApi'
import { upsertById, removeById } from '../../lib/listState'
import { PAYMENT_METHODS, paymentMethodLabel } from '../../lib/payments'
import { useOpsAlert } from '../OpsAlertContext'
import { YearMonthDaySelect } from '../../components/YearMonthDaySelect'
import { DateRangeFilter } from '../../components/DateRangeFilter'
import { usePersistedDateRange } from '../../hooks/usePersistedDateRange'
import { filterByDateRange } from '../../lib/dateRange'
import {
  adminBtnDanger,
  adminBtnPrimary,
  adminBtnSecondary,
  adminFieldClass,
  adminTableClass,
  adminColSecondary,
  adminCellPad,
  activateRowKey,
  clickableDocClass,
  clickableRowClass,
  formatPula,
} from '../ui'
import { AdminIconAction } from '../AdminIconAction'

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function emptyExpenseForm() {
  return {
    expense_date: todayIso(),
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

export default function ExpensesPage() {
  const [params, setParams] = useSearchParams()
  const { showError, showSuccess, confirm } = useOpsAlert()
  const [rows, setRows] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [baseline, setBaseline] = useState('')
  const [form, setForm] = useState(emptyExpenseForm)
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

  const visibleRows = useMemo(
    () => filterByDateRange(rows, dateFrom, dateTo, (row) => row.expense_date),
    [rows, dateFrom, dateTo],
  )

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
    closeForm()
    if (saved?.id) setRows((prev) => upsertById(prev, saved))
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
          onSubmit={handleSubmit}
          className="max-w-2xl space-y-4 rounded-2xl border border-white/10 bg-ink-900/90 p-4 sm:p-5"
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
              <select
                required
                className={adminFieldClass}
                value={form.category_id}
                onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
              >
                <option value="">Select…</option>
                {activeCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {!c.active ? ' (inactive)' : ''}
                  </option>
                ))}
              </select>
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
                Vendor / supplier (optional)
              </span>
              <input
                className={adminFieldClass}
                value={form.vendor}
                onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))}
                placeholder="Who was paid"
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
        <table className={adminTableClass}>
          <thead className="bg-ink-900/80 text-xs uppercase tracking-wider text-ink-400">
            <tr>
              <th className={adminCellPad}>Date</th>
              <th className={adminCellPad}>Category</th>
              <th className={`${adminCellPad} ${adminColSecondary}`}>Vendor</th>
              <th className={`${adminCellPad} ${adminColSecondary}`}>Method</th>
              <th className={`${adminCellPad} ${adminColSecondary}`}>Reference</th>
              <th className={`${adminCellPad} text-right`}>Amount</th>
              <th className={adminCellPad} />
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
              visibleRows.map((row) => {
                const open = () => openRow(row)
                return (
                  <tr
                    key={row.id}
                    role="link"
                    tabIndex={0}
                    className={`group bg-ink-900/20 ${clickableRowClass}`}
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
                      className={`${adminCellPad} text-right`}
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
      </DateRangeFilter>
    </div>
  )
}
