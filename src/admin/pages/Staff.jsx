import { Navigate } from 'react-router-dom'
import { useCallback, useEffect, useState } from 'react'
import { payrollApi } from '../../lib/payrollApi'
import { openPayslipPrintWindow } from '../../lib/payslipDocument'
import { useAuth } from '../../contexts/AuthContext'
import { isAdmin } from '../../lib/authConfig'
import { useOpsAlert } from '../OpsAlertContext'
import {
  adminBtnDanger,
  adminBtnPrimary,
  adminBtnSecondary,
  adminFieldClass,
  adminTableShellClass,
  formatPula,
} from '../ui'
import { YearMonthDaySelect } from '../../components/YearMonthDaySelect'

const emptyForm = () => ({
  user_id: '',
  name: '',
  email: '',
  phone: '',
  job_title: 'Staff',
  base_salary: '0',
  start_date: new Date().toISOString().slice(0, 10),
})

export default function StaffPage() {
  const { user } = useAuth()
  const { showError, showSuccess, confirm } = useOpsAlert()

  if (!isAdmin(user?.role)) {
    return <Navigate to="/admin" replace />
  }
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [benefitTypes, setBenefitTypes] = useState([])
  const [assignments, setAssignments] = useState([])
  const [advances, setAdvances] = useState([])
  const [benefitTypeId, setBenefitTypeId] = useState('')
  const [benefitAmount, setBenefitAmount] = useState('')
  const [advanceAmount, setAdvanceAmount] = useState('')
  const [advanceNotes, setAdvanceNotes] = useState('')
  const [payBusy, setPayBusy] = useState(false)
  const [nextPayday, setNextPayday] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [s, n] = await Promise.all([payrollApi.listStaffHr(), payrollApi.nextPayday()])
    setLoading(false)
    if (s.error || s.data?.success === false) {
      showError(s.error?.message || s.data?.message || 'Could not load staff')
      return
    }
    setStaff(s.data.staff || [])
    if (n.data?.next_payday) setNextPayday(n.data.next_payday)
  }, [showError])

  useEffect(() => {
    load()
  }, [load])

  const loadDetail = useCallback(
    async (userId) => {
      if (!userId) return
      const [b, a] = await Promise.all([
        payrollApi.listBenefits(userId),
        payrollApi.listAdvances(userId, true),
      ])
      if (b.error || b.data?.success === false) {
        showError(b.error?.message || b.data?.message || 'Could not load benefits')
      } else {
        setBenefitTypes(b.data.types || [])
        setAssignments(b.data.assignments || [])
        setBenefitTypeId((prev) => prev || b.data.types?.[0]?.id || '')
      }
      if (a.error || a.data?.success === false) {
        showError(a.error?.message || a.data?.message || 'Could not load advances')
      } else {
        setAdvances(a.data.advances || [])
      }
    },
    [showError],
  )

  useEffect(() => {
    if (selectedId) loadDetail(selectedId)
  }, [selectedId, loadDetail])

  function startNew() {
    setForm(emptyForm())
    setShowForm(true)
    setSelectedId(null)
  }

  function startEdit(row) {
    setForm({
      user_id: row.id,
      name: row.name || '',
      email: row.email || '',
      phone: row.phone || '',
      job_title: row.employment?.job_title || 'Staff',
      base_salary: String(row.employment?.base_salary ?? 0),
      start_date: row.employment?.start_date || new Date().toISOString().slice(0, 10),
    })
    setShowForm(true)
    setSelectedId(row.id)
  }

  async function saveStaff(e) {
    e.preventDefault()
    setSaving(true)
    const { data, error } = await payrollApi.upsertStaff({
      user_id: form.user_id || undefined,
      name: form.name,
      email: form.email,
      phone: form.phone || null,
      job_title: form.job_title,
      base_salary: Number(form.base_salary) || 0,
      start_date: form.start_date,
    })
    setSaving(false)
    if (error || data?.success === false) {
      showError(error?.message || data?.message || 'Could not save staff')
      return
    }
    showSuccess(
      data.temporary_password
        ? `Staff saved. Temporary password: ${data.temporary_password}`
        : 'Staff updated.',
    )
    setShowForm(false)
    await load()
    if (data.staff?.id) setSelectedId(data.staff.id)
  }

  async function toggleActive(row) {
    const next = !row.is_active
    const ok = await confirm({
      title: next ? 'Enable staff?' : 'Disable staff?',
      message: next
        ? `${row.name} will be able to sign in again.`
        : `${row.name} will be blocked from signing in.`,
      confirmLabel: next ? 'Enable' : 'Disable',
    })
    if (!ok) return
    const { data, error } = await payrollApi.setStaffActive(row.id, next)
    if (error || data?.success === false) {
      showError(error?.message || data?.message || 'Could not update status')
      return
    }
    showSuccess(next ? 'Staff enabled.' : 'Staff disabled.')
    await load()
  }

  async function saveBenefit() {
    if (!selectedId || !benefitTypeId) return
    const { data, error } = await payrollApi.assignBenefit({
      user_id: selectedId,
      benefit_type_id: benefitTypeId,
      amount: Number(benefitAmount) || 0,
      active: true,
    })
    if (error || data?.success === false) {
      showError(error?.message || data?.message || 'Could not assign benefit')
      return
    }
    showSuccess('Benefit saved.')
    setBenefitAmount('')
    await loadDetail(selectedId)
  }

  async function saveAdvance() {
    if (!selectedId) return
    const amount = Number(advanceAmount)
    if (!(amount > 0)) {
      showError('Enter a positive advance amount.')
      return
    }
    const { data, error } = await payrollApi.createAdvance({
      user_id: selectedId,
      amount,
      notes: advanceNotes || null,
    })
    if (error || data?.success === false) {
      showError(error?.message || data?.message || 'Could not record advance')
      return
    }
    showSuccess('Salary advance recorded.')
    setAdvanceAmount('')
    setAdvanceNotes('')
    await loadDetail(selectedId)
  }

  async function runPayroll() {
    const ok = await confirm({
      title: 'Post pay run?',
      message: `This will create payslips for all active staff and recover open advances. Payday: ${nextPayday || 'auto'}.`,
      confirmLabel: 'Post payroll',
    })
    if (!ok) return
    setPayBusy(true)
    const { data, error } = await payrollApi.postPayRun({
      payday: nextPayday || undefined,
    })
    setPayBusy(false)
    if (error || data?.success === false) {
      showError(error?.message || data?.message || 'Pay run failed')
      return
    }
    showSuccess(`Pay run posted (${(data.payslips || []).length} payslips).`)
    if (selectedId) await loadDetail(selectedId)
  }

  const selected = staff.find((s) => s.id === selectedId)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Staff</h1>
          <p className="mt-1 text-sm text-ink-300">
            Manage employees, remuneration, benefits, and advances.
            {nextPayday ? (
              <>
                {' '}
                Next payday: <span className="text-ink-100">{nextPayday}</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={payBusy} onClick={runPayroll} className={adminBtnSecondary}>
            {payBusy ? 'Posting…' : 'Run payroll'}
          </button>
          <button type="button" onClick={startNew} className={adminBtnPrimary}>
            Add staff
          </button>
        </div>
      </div>

      {showForm ? (
        <form
          onSubmit={saveStaff}
          className="space-y-3 rounded-2xl border border-white/10 bg-ink-900/40 p-4 sm:p-5"
        >
          <h2 className="font-semibold text-white">{form.user_id ? 'Edit staff' : 'New staff'}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-ink-300">
              Name
              <input
                className={`${adminFieldClass} mt-1`}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </label>
            <label className="text-sm text-ink-300">
              Email
              <input
                type="email"
                className={`${adminFieldClass} mt-1`}
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                required
              />
            </label>
            <label className="text-sm text-ink-300">
              Phone
              <input
                className={`${adminFieldClass} mt-1`}
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </label>
            <label className="text-sm text-ink-300">
              Job title
              <input
                className={`${adminFieldClass} mt-1`}
                value={form.job_title}
                onChange={(e) => setForm((f) => ({ ...f, job_title: e.target.value }))}
              />
            </label>
            <label className="text-sm text-ink-300">
              Base salary (BWP)
              <input
                type="number"
                min="0"
                step="0.01"
                className={`${adminFieldClass} mt-1`}
                value={form.base_salary}
                onChange={(e) => setForm((f) => ({ ...f, base_salary: e.target.value }))}
              />
            </label>
            <div className="text-sm text-ink-300">
              Start date
              <div className="mt-1">
                <YearMonthDaySelect
                  value={form.start_date}
                  onChange={(start_date) => setForm((f) => ({ ...f, start_date }))}
                />
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className={adminBtnPrimary}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className={adminBtnSecondary} onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <div className={adminTableShellClass}>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/10 text-ink-400">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Salary</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-ink-500">
                  Loading…
                </td>
              </tr>
            ) : (
              staff.map((row) => (
                <tr
                  key={row.id}
                  className={`border-b border-white/5 ${selectedId === row.id ? 'bg-white/5' : ''}`}
                >
                  <td className="px-3 py-2 text-white">
                    <button type="button" className="text-left hover:text-brand-300" onClick={() => setSelectedId(row.id)}>
                      {row.name}
                      <div className="text-xs text-ink-500">{row.email}</div>
                    </button>
                  </td>
                  <td className="px-3 py-2 text-ink-300">{row.employment?.job_title || '—'}</td>
                  <td className="px-3 py-2 text-ink-200">
                    {formatPula(row.employment?.base_salary || 0)}
                  </td>
                  <td className="px-3 py-2">
                    <span className={row.is_active ? 'text-brand-300' : 'text-red-300'}>
                      {row.is_active ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td className="space-x-2 px-3 py-2 text-right">
                    <button type="button" className={adminBtnSecondary} onClick={() => startEdit(row)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className={row.is_active ? adminBtnDanger : adminBtnPrimary}
                      onClick={() => toggleActive(row)}
                    >
                      {row.is_active ? 'Disable' : 'Enable'}
                    </button>
                  </td>
                </tr>
              ))
            )}
            {!loading && !staff.length ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-ink-500">
                  No staff yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {selected ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-white/10 bg-ink-900/40 p-4">
            <h2 className="font-semibold text-white">Benefits — {selected.name}</h2>
            <ul className="mt-3 space-y-1 text-sm text-ink-300">
              {assignments
                .filter((a) => a.active)
                .map((a) => (
                  <li key={a.id} className="flex justify-between gap-2">
                    <span>{a.benefit?.name || 'Benefit'}</span>
                    <span>{formatPula(a.amount)}</span>
                  </li>
                ))}
              {!assignments.filter((a) => a.active).length ? (
                <li className="text-ink-500">No benefits assigned.</li>
              ) : null}
            </ul>
            <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_8rem_auto]">
              <select
                className={adminFieldClass}
                value={benefitTypeId}
                onChange={(e) => setBenefitTypeId(e.target.value)}
              >
                {benefitTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Amount"
                className={adminFieldClass}
                value={benefitAmount}
                onChange={(e) => setBenefitAmount(e.target.value)}
              />
              <button type="button" className={adminBtnPrimary} onClick={saveBenefit}>
                Save
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-ink-900/40 p-4">
            <h2 className="font-semibold text-white">Open advances — {selected.name}</h2>
            <ul className="mt-3 space-y-1 text-sm text-ink-300">
              {advances.map((a) => (
                <li key={a.id} className="flex justify-between gap-2">
                  <span>{a.advance_date}</span>
                  <span>{formatPula(a.remaining)} left</span>
                </li>
              ))}
              {!advances.length ? <li className="text-ink-500">No open advances.</li> : null}
            </ul>
            <div className="mt-4 space-y-2">
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Advance amount"
                className={adminFieldClass}
                value={advanceAmount}
                onChange={(e) => setAdvanceAmount(e.target.value)}
              />
              <input
                placeholder="Notes"
                className={adminFieldClass}
                value={advanceNotes}
                onChange={(e) => setAdvanceNotes(e.target.value)}
              />
              <button type="button" className={adminBtnPrimary} onClick={saveAdvance}>
                Record advance
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <StaffPayslipsPanel userId={selectedId} />
    </div>
  )
}

function StaffPayslipsPanel({ userId }) {
  const { showError } = useOpsAlert()
  const [slips, setSlips] = useState([])

  useEffect(() => {
    let cancelled = false
    payrollApi.listPayslips(userId || undefined).then(({ data, error }) => {
      if (cancelled) return
      if (error || data?.success === false) {
        showError(error?.message || data?.message || 'Could not load payslips')
        return
      }
      setSlips(data.payslips || [])
    })
    return () => {
      cancelled = true
    }
  }, [userId, showError])

  return (
    <section className="rounded-2xl border border-white/10 bg-ink-900/40 p-4">
      <h2 className="font-semibold text-white">
        {userId ? 'Payslips for selected staff' : 'All payslips'}
      </h2>
      <div className={`${adminTableShellClass} mt-3`}>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/10 text-ink-400">
            <tr>
              <th className="px-3 py-2">Period</th>
              <th className="px-3 py-2">Net</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {slips.map((s) => (
              <tr key={s.id} className="border-b border-white/5">
                <td className="px-3 py-2 text-ink-200">
                  {s.pay_run?.period_year}-{String(s.pay_run?.period_month || '').padStart(2, '0')}
                  <div className="text-xs text-ink-500">{s.snapshot?.staff_name}</div>
                </td>
                <td className="px-3 py-2">{formatPula(s.net)}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    className={adminBtnSecondary}
                    onClick={() => openPayslipPrintWindow(s)}
                  >
                    Print
                  </button>
                </td>
              </tr>
            ))}
            {!slips.length ? (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-ink-500">
                  No payslips yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}
