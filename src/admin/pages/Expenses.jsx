import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { opsApi } from '../../lib/opsApi'
import { PAYMENT_METHODS, paymentMethodLabel } from '../../lib/payments'
import { useOpsAlert } from '../OpsAlertContext'
import { YearMonthDaySelect } from '../../components/YearMonthDaySelect'
import {
  adminBtnDanger,
  adminBtnPrimary,
  adminBtnSecondary,
  adminFieldClass,
  activateRowKey,
  clickableDocClass,
  clickableRowClass,
  formatPula,
} from '../ui'

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
    const { error } = await opsApi.saveExpense({
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
    await load()
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
    await load()
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
          className="max-w-2xl space-y-4 rounded-2xl border border-white/10 bg-ink-900/40 p-4 sm:p-5"
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

      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-ink-900/80 text-xs uppercase tracking-wider text-ink-400">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Vendor</th>
              <th className="px-4 py-3">Method</th>
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-ink-400">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-ink-400">
                  No expenses recorded yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
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
                    <td className="px-4 py-3 text-ink-300">{row.expense_date}</td>
                    <td className="px-4 py-3">
                      <span className={clickableDocClass}>{categoryName(row)}</span>
                    </td>
                    <td className="px-4 py-3 text-ink-300">{row.vendor || '—'}</td>
                    <td className="px-4 py-3 text-ink-300">
                      {paymentMethodLabel(row.method)}
                    </td>
                    <td className="px-4 py-3 text-ink-300">{row.reference || '—'}</td>
                    <td className="px-4 py-3 text-right font-medium text-ink-100">
                      {formatPula(row.amount)}
                    </td>
                    <td
                      className="px-4 py-3 text-right"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        disabled={saving}
                        aria-label="Delete"
                        onClick={() => handleDelete(row)}
                        className="group/iconTip relative inline-flex rounded-md p-1.5 text-red-400 transition hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.75}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-4 w-4"
                          aria-hidden="true"
                        >
                          <path d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                        <span
                          role="tooltip"
                          className="pointer-events-none absolute right-0 top-full z-20 mt-1.5 whitespace-nowrap rounded-md border border-white/10 bg-ink-900 px-2 py-1 text-[11px] font-medium text-ink-100 opacity-0 shadow-lg transition-opacity duration-150 group-hover/iconTip:opacity-100 group-focus-visible/iconTip:opacity-100"
                        >
                          Delete
                        </span>
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
