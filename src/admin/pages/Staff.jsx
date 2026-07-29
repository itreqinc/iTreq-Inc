import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { payrollApi } from '../../lib/payrollApi'
import { upsertById, removeById } from '../../lib/listState'
import { openPayslipPrintWindow } from '../../lib/payslipDocument'
import { useAuth } from '../../contexts/AuthContext'
import { AUTH_BYPASS, isAfterHoursActive, privilegeRoleLabel } from '../../lib/authConfig'
import { authAction } from '../../lib/authApi'
import {
  inferCountryCodeFromPhone,
  validatePhoneForCountry,
} from '../../lib/phoneCountry'
import { CountryPhoneInput } from '../../components/CountryPhoneInput'
import { YearMonthDaySelect } from '../../components/YearMonthDaySelect'
import { useOpsAlert } from '../OpsAlertContext'
import { AdminIconAction } from '../AdminIconAction'
import { ActionsMenu } from '../ActionsMenu'
import {
  adminBtnPrimary,
  adminBtnSecondary,
  adminFieldClass,
  adminTableShellClass,
  activateRowKey,
  clickableDocClass,
  clickableRowClass,
  formatPula,
} from '../ui'

function toDatetimeLocalValue(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

const emptyForm = () => ({
  user_id: '',
  first_name: '',
  middle_name: '',
  surname: '',
  gender: '',
  email: '',
  country: 'BW',
  phone: '+267',
  // Privilege role for the account: controls ops access in the system.
  role: 'staff',
  job_title: 'Staff',
  base_salary: '0',
  start_date: new Date().toISOString().slice(0, 10),
  employment_status: 'active',
  bank_name: '',
  bank_account: '',
  notes: '',
})

const dash = (value) => {
  const text = String(value ?? '').trim()
  return text || '—'
}

const genderLabel = (value) =>
  value === 'M' ? 'Male' : value === 'F' ? 'Female' : '—'

const statusLabel = (value) =>
  ({ active: 'Active', on_leave: 'On leave', terminated: 'Terminated' })[value] || '—'

function DetailField({ label, children, className = '' }) {
  return (
    <div className={className}>
      <dt className="text-xs uppercase tracking-wide text-ink-500">{label}</dt>
      <dd className="mt-1 whitespace-pre-line break-words text-sm text-ink-100">{children}</dd>
    </div>
  )
}

export default function StaffPage() {
  const { user: currentUser } = useAuth()
  const { showError, showSuccess, confirm } = useOpsAlert()

  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [benefitTypes, setBenefitTypes] = useState([])
  const [assignments, setAssignments] = useState([])
  const [advances, setAdvances] = useState([])
  const [benefitTypeId, setBenefitTypeId] = useState('')
  const [benefitAmount, setBenefitAmount] = useState('')
  const [editingBenefitId, setEditingBenefitId] = useState(null)
  const [advanceAmount, setAdvanceAmount] = useState('')
  const [advanceNotes, setAdvanceNotes] = useState('')
  const [editingAdvanceId, setEditingAdvanceId] = useState(null)
  const [payBusy, setPayBusy] = useState(false)
  const [nextPayday, setNextPayday] = useState('')
  const [viewId, setViewId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [afterHoursUntil, setAfterHoursUntil] = useState('')
  const [afterHoursBusy, setAfterHoursBusy] = useState(false)

  const activeAssignments = assignments.filter((a) => a.active)
  const assignedTypeIds = new Set(activeAssignments.map((a) => a.benefit_type_id))
  const availableBenefitTypes = benefitTypes.filter((t) => t.active !== false && !assignedTypeIds.has(t.id))
  const editingBenefit = editingBenefitId
    ? activeAssignments.find((a) => a.id === editingBenefitId)
    : null
  const editingAdvance = editingAdvanceId
    ? advances.find((a) => a.id === editingAdvanceId)
    : null

  const filteredStaff = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return staff
    return staff.filter((row) => {
      const hay = [
        row.name,
        row.first_name,
        row.middle_name,
        row.surname,
        row.email,
        row.phone,
        row.employment?.job_title,
        privilegeRoleLabel(row.role),
      ]
        .map((v) => String(v || '').toLowerCase())
        .join(' ')
      return hay.includes(q)
    })
  }, [staff, searchQuery])

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
        const types = b.data.types || []
        const list = b.data.assignments || []
        setBenefitTypes(types)
        setAssignments(list)
        const taken = new Set(list.filter((x) => x.active).map((x) => x.benefit_type_id))
        const firstFree = types.find((t) => t.active !== false && !taken.has(t.id))
        setBenefitTypeId(firstFree?.id || '')
      }
      if (a.error || a.data?.success === false) {
        showError(a.error?.message || a.data?.message || 'Could not load advances')
      } else {
        setAdvances(a.data.advances || [])
      }
      setEditingBenefitId(null)
      setEditingAdvanceId(null)
      setBenefitAmount('')
      setAdvanceAmount('')
      setAdvanceNotes('')
    },
    [showError],
  )

  useEffect(() => {
    if (selectedId) loadDetail(selectedId)
  }, [selectedId, loadDetail])

  useEffect(() => {
    const row = staff.find((s) => s.id === selectedId)
    setAfterHoursUntil(
      isAfterHoursActive(row?.after_hours_until)
        ? toDatetimeLocalValue(row.after_hours_until)
        : '',
    )
  }, [selectedId, staff])

  function startNew() {
    setForm(emptyForm())
    setShowForm(true)
    setViewId(null)
    setSelectedId(null)
  }

  function selectStaff(row) {
    setSelectedId((prev) => (prev === row.id ? null : row.id))
    setShowForm(false)
  }

  function openView(row) {
    setViewId(row.id)
    setSelectedId(row.id)
    setShowForm(false)
  }

  function closeView() {
    setViewId(null)
  }

  function startEdit(row) {
    const phone = row.phone || '+267'
    setForm({
      user_id: row.id,
      first_name: row.first_name || '',
      middle_name: row.middle_name || '',
      surname: row.surname || '',
      gender: row.gender || '',
      email: row.email || '',
      country: inferCountryCodeFromPhone(phone) || 'BW',
      phone,
      role: row.role || 'staff',
      job_title: row.employment?.job_title || 'Staff',
      base_salary: String(row.employment?.base_salary ?? 0),
      start_date: row.employment?.start_date || new Date().toISOString().slice(0, 10),
      employment_status: row.employment?.employment_status || 'active',
      bank_name: row.employment?.bank_name || '',
      bank_account: row.employment?.bank_account || '',
      notes: row.employment?.notes || '',
    })
    setShowForm(true)
    setViewId(null)
    setSelectedId(row.id)
  }

  async function saveStaff(e) {
    e.preventDefault()
    if (!String(form.first_name || '').trim() || !String(form.surname || '').trim()) {
      showError('First name and last name are required.')
      return
    }
    const phoneCheck = validatePhoneForCountry(form.country, form.phone)
    if (!phoneCheck.ok) {
      showError(phoneCheck.message)
      return
    }
    if (!String(form.email || '').trim()) {
      showError('Email is required for staff login.')
      return
    }

    const displayName = [form.first_name, form.middle_name, form.surname]
      .map((p) => String(p || '').trim())
      .filter(Boolean)
      .join(' ')
    const isNew = !form.user_id
    const ok = await confirm({
      title: isNew ? 'Add this staff member?' : 'Save staff changes?',
      message: isNew
        ? `${displayName} will be created with a login (${form.email}) and temporary password password123.`
        : `Save changes to ${displayName}?`,
      confirmLabel: isNew ? 'Add staff' : 'Save changes',
    })
    if (!ok) return

    setSaving(true)
    const { data, error } = await payrollApi.upsertStaff({
      user_id: form.user_id || undefined,
      first_name: form.first_name,
      middle_name: form.middle_name || null,
      surname: form.surname,
      gender: form.gender || null,
      email: form.email,
      phone: form.phone,
      role: form.role,
      job_title: form.job_title,
      base_salary: Number(form.base_salary) || 0,
      start_date: form.start_date,
      employment_status: form.employment_status,
      bank_name: form.bank_name || null,
      bank_account: form.bank_account || null,
      notes: form.notes || null,
    })
    setSaving(false)
    if (error || data?.success === false) {
      showError(error?.message || data?.message || 'Could not save staff')
      return
    }
    showSuccess(
      data.temporary_password
        ? `Staff saved. They can sign in with email or phone. Temporary password: ${data.temporary_password}`
        : 'Staff updated.',
    )
    setShowForm(false)
    if (data.staff?.id) {
      setStaff((prev) => upsertById(prev, data.staff))
      setSelectedId(data.staff.id)
    }
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
    setStaff((prev) =>
      upsertById(prev, {
        ...row,
        is_active: next,
        ...(data?.user || {}),
        employment: {
          ...row.employment,
          employment_status: next ? row.employment?.employment_status || 'active' : 'terminated',
        },
      }),
    )
  }

  async function removeStaff(row) {
    const ok = await confirm({
      type: 'error',
      title: 'Delete staff member?',
      message: `This permanently deletes ${row.name}, their login, employment record, benefits, and advances. This cannot be undone. Staff with payslips cannot be deleted — disable them instead.`,
      confirmLabel: 'Delete permanently',
    })
    if (!ok) return
    setDeletingId(row.id)
    const { data, error } = await payrollApi.deleteStaff(row.id)
    setDeletingId(null)
    if (error || data?.success === false) {
      showError(error?.message || data?.message || 'Could not delete staff')
      return
    }
    showSuccess(`${row.name} deleted.`)
    if (selectedId === row.id) setSelectedId(null)
    if (viewId === row.id) setViewId(null)
    if (form.user_id === row.id) setShowForm(false)
    setStaff((prev) => removeById(prev, row.id))
  }

  async function resetPassword(row) {
    const ok = await confirm({
      title: 'Reset password?',
      message: `${row.name}'s password will be set to password123. They must change it on next sign-in. Active sessions will be signed out.`,
      confirmLabel: 'Reset to password123',
    })
    if (!ok) return
    const { data, error } = await payrollApi.resetStaffPassword(row.id)
    if (error || data?.success === false) {
      showError(error?.message || data?.message || 'Could not reset password')
      return
    }
    showSuccess(
      `Password reset for ${row.name}. Temporary password: ${data.temporary_password || 'password123'}`,
    )
  }

  function staffRowMenuItems(row) {
    const isSelf = row.id === currentUser?.id
    const items = [
      {
        label: 'View',
        icon: 'eye',
        onClick: () => openView(row),
      },
      {
        label: 'Edit',
        icon: 'pencil',
        onClick: () => startEdit(row),
      },
    ]
    if (!isSelf) {
      items.push(
        {
          label: 'Reset password',
          icon: 'key',
          onClick: () => resetPassword(row),
        },
        {
          label: row.is_active ? 'Disable' : 'Enable',
          icon: row.is_active ? 'ban' : 'checkCircle',
          tone: row.is_active ? 'danger' : undefined,
          onClick: () => toggleActive(row),
        },
        {
          label: deletingId === row.id ? 'Deleting…' : 'Delete',
          icon: 'trash',
          tone: 'danger',
          disabled: deletingId === row.id,
          onClick: () => removeStaff(row),
        },
      )
    }
    return items
  }

  function startEditBenefit(assignment) {
    setEditingBenefitId(assignment.id)
    setBenefitTypeId(assignment.benefit_type_id)
    setBenefitAmount(String(assignment.amount ?? ''))
    setEditingAdvanceId(null)
  }

  function cancelEditBenefit() {
    setEditingBenefitId(null)
    setBenefitAmount('')
    const firstFree = availableBenefitTypes[0]
    setBenefitTypeId(firstFree?.id || '')
  }

  function startEditAdvance(advance) {
    setEditingAdvanceId(advance.id)
    setAdvanceAmount(String(advance.amount ?? advance.remaining ?? ''))
    setAdvanceNotes(advance.notes || '')
    setEditingBenefitId(null)
  }

  function cancelEditAdvance() {
    setEditingAdvanceId(null)
    setAdvanceAmount('')
    setAdvanceNotes('')
  }

  async function saveBenefit() {
    if (!selectedId) return
    const amount = Number(benefitAmount)
    if (!(amount > 0)) {
      showError('Benefit amount must be greater than zero.')
      return
    }
    const person = staff.find((s) => s.id === selectedId)
    const typeId = editingBenefit ? editingBenefit.benefit_type_id : benefitTypeId
    if (!typeId) {
      showError('Choose a benefit type.')
      return
    }
    const typeName =
      editingBenefit?.benefit?.name ||
      benefitTypes.find((t) => t.id === typeId)?.name ||
      'Benefit'
    const ok = await confirm({
      title: editingBenefit ? 'Update benefit?' : 'Save benefit?',
      message: editingBenefit
        ? `Update ${typeName} to ${formatPula(amount)} for ${person?.name || 'this staff member'}?`
        : `Assign ${typeName} (${formatPula(amount)}) to ${person?.name || 'this staff member'}?`,
      confirmLabel: editingBenefit ? 'Update benefit' : 'Save benefit',
    })
    if (!ok) return
    const { data, error } = await payrollApi.assignBenefit({
      user_id: selectedId,
      benefit_type_id: typeId,
      amount,
      active: true,
    })
    if (error || data?.success === false) {
      showError(error?.message || data?.message || 'Could not assign benefit')
      return
    }
    showSuccess(editingBenefit ? 'Benefit updated.' : 'Benefit saved.')
    setEditingBenefitId(null)
    setBenefitAmount('')
    await loadDetail(selectedId)
  }

  async function removeBenefit(assignment) {
    const ok = await confirm({
      type: 'error',
      title: 'Remove benefit?',
      message: `Remove ${assignment.benefit?.name || 'this benefit'} (${formatPula(assignment.amount)}) from ${staff.find((s) => s.id === selectedId)?.name || 'this staff member'}?`,
      confirmLabel: 'Remove',
    })
    if (!ok) return
    const { data, error } = await payrollApi.removeBenefit(assignment.id)
    if (error || data?.success === false) {
      showError(error?.message || data?.message || 'Could not remove benefit')
      return
    }
    showSuccess('Benefit removed.')
    if (editingBenefitId === assignment.id) cancelEditBenefit()
    await loadDetail(selectedId)
  }

  async function saveAdvance() {
    if (!selectedId) return
    const amount = Number(advanceAmount)
    if (!(amount > 0)) {
      showError('Advance amount must be greater than zero.')
      return
    }
    const person = staff.find((s) => s.id === selectedId)
    const ok = await confirm({
      title: editingAdvance ? 'Update salary advance?' : 'Record salary advance?',
      message: editingAdvance
        ? `Update advance to ${formatPula(amount)} for ${person?.name || 'this staff member'}?`
        : `Record an advance of ${formatPula(amount)} for ${person?.name || 'this staff member'}? It will be recovered on the next pay run.`,
      confirmLabel: editingAdvance ? 'Update advance' : 'Record advance',
    })
    if (!ok) return

    if (editingAdvance) {
      const { data, error } = await payrollApi.updateAdvance({
        advance_id: editingAdvance.id,
        amount,
        notes: advanceNotes || null,
      })
      if (error || data?.success === false) {
        showError(error?.message || data?.message || 'Could not update advance')
        return
      }
      showSuccess('Salary advance updated.')
    } else {
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
    }
    setEditingAdvanceId(null)
    setAdvanceAmount('')
    setAdvanceNotes('')
    await loadDetail(selectedId)
  }

  async function removeAdvance(advance) {
    const ok = await confirm({
      type: 'error',
      title: 'Delete salary advance?',
      message: `Delete the ${formatPula(advance.amount)} advance from ${advance.advance_date}? This cannot be undone.`,
      confirmLabel: 'Delete advance',
    })
    if (!ok) return
    const { data, error } = await payrollApi.deleteAdvance(advance.id)
    if (error || data?.success === false) {
      showError(error?.message || data?.message || 'Could not delete advance')
      return
    }
    showSuccess('Advance deleted.')
    if (editingAdvanceId === advance.id) cancelEditAdvance()
    await loadDetail(selectedId)
  }

  async function saveAfterHours(clear = false) {
    if (!selectedId) return
    if (AUTH_BYPASS) {
      showError(
        'After-hours controls need a real admin session. Set VITE_AUTH_BYPASS=false and sign in.',
      )
      return
    }
    const person = staff.find((s) => s.id === selectedId)
    if (clear) {
      if (!isAfterHoursActive(person?.after_hours_until)) {
        showError('This staff member has no after-hours access to clear.')
        return
      }
      const ok = await confirm({
        title: 'Clear after-hours access?',
        message: `${person?.name || 'This staff member'} will only be able to open ops during normal hours (Mon–Fri 07:00–18:00).`,
        confirmLabel: 'Clear access',
      })
      if (!ok) return
    } else {
      if (!afterHoursUntil) {
        showError('Choose when after-hours access should end.')
        return
      }
      const untilLabel = new Date(afterHoursUntil).toLocaleString()
      const ok = await confirm({
        title: 'Grant after-hours access?',
        message: `${person?.name || 'This staff member'} will be able to open ops until ${untilLabel}.`,
        confirmLabel: 'Grant access',
      })
      if (!ok) return
    }
    setAfterHoursBusy(true)
    try {
      const value = clear ? null : afterHoursUntil || null
      const { data, error } = await authAction(
        'set_after_hours',
        {
          user_id: selectedId,
          after_hours_until: value ? new Date(value).toISOString() : null,
        },
        { withAuth: true },
      )
      if (error || data?.success === false) {
        showError(error?.message || data?.message || 'Could not update after-hours access')
        return
      }
      showSuccess(clear ? 'After-hours access cleared.' : 'After-hours access updated.')
      if (clear) setAfterHoursUntil('')
      const until = clear ? null : data?.user?.after_hours_until ?? (value ? new Date(value).toISOString() : null)
      setStaff((prev) =>
        upsertById(prev, {
          id: selectedId,
          after_hours_until: until,
        }),
      )
    } finally {
      setAfterHoursBusy(false)
    }
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

  const viewing = viewId ? staff.find((s) => s.id === viewId) : null
  const editingSelf = Boolean(form.user_id && form.user_id === currentUser?.id)

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
          className="space-y-4 rounded-2xl border border-white/10 bg-ink-900/40 p-4 sm:p-5"
        >
          <div>
            <h2 className="font-semibold text-white">{form.user_id ? 'Edit staff' : 'New staff'}</h2>
            <p className="mt-1 text-xs text-ink-400">
              Email and phone are required for login (password, email OTP, or SMS OTP). New staff get
              temporary password <code className="text-ink-300">password123</code> and must change it
              on first sign-in.
            </p>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
              Login identity
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-sm text-ink-300">
                First name
                <input
                  className={`${adminFieldClass} mt-1`}
                  value={form.first_name}
                  onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                  required
                />
              </label>
              <label className="text-sm text-ink-300">
                Middle name
                <input
                  className={`${adminFieldClass} mt-1`}
                  value={form.middle_name}
                  onChange={(e) => setForm((f) => ({ ...f, middle_name: e.target.value }))}
                />
              </label>
              <label className="text-sm text-ink-300">
                Last name
                <input
                  className={`${adminFieldClass} mt-1`}
                  value={form.surname}
                  onChange={(e) => setForm((f) => ({ ...f, surname: e.target.value }))}
                  required
                />
              </label>
              <label className="text-sm text-ink-300">
                Gender
                <select
                  className={`${adminFieldClass} mt-1`}
                  value={form.gender}
                  onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
                >
                  <option value="">—</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </select>
              </label>
              <label className="text-sm text-ink-300 sm:col-span-2">
                Email
                <input
                  type="email"
                  autoComplete="email"
                  className={`${adminFieldClass} mt-1`}
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  required
                />
              </label>
              <div className="text-sm text-ink-300 sm:col-span-3">
                <span className="mb-1 block">Phone</span>
                <CountryPhoneInput
                  country={form.country}
                  phone={form.phone}
                  required
                  onChange={({ country, phone }) =>
                    setForm((f) => ({ ...f, country, phone }))
                  }
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
              Employment
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm text-ink-300">
                Job title
                <input
                  className={`${adminFieldClass} mt-1`}
                  value={form.job_title}
                  onChange={(e) => setForm((f) => ({ ...f, job_title: e.target.value }))}
                  required
                />
              </label>
              <label className="text-sm text-ink-300">
                Role (system privileges)
                <select
                  className={`${adminFieldClass} mt-1`}
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  disabled={editingSelf}
                  required
                >
                  <option value="staff">Staff</option>
                  <option value="admin">Admin</option>
                </select>
                {editingSelf ? (
                  <span className="mt-1 block text-xs text-ink-500">
                    You cannot change your own system role.
                  </span>
                ) : (
                  <span className="mt-1 block text-xs text-ink-500">
                    Controls ops access (admin nav, settings, stock). Not the job title.
                  </span>
                )}
              </label>
              <label className="text-sm text-ink-300">
                Employment status
                <select
                  className={`${adminFieldClass} mt-1`}
                  value={form.employment_status}
                  onChange={(e) => setForm((f) => ({ ...f, employment_status: e.target.value }))}
                >
                  <option value="active">Active</option>
                  <option value="on_leave">On leave</option>
                  <option value="terminated">Terminated</option>
                </select>
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
                  required
                />
              </label>
              <div className="text-sm text-ink-300">
                Start date
                <div className="mt-1">
                  <YearMonthDaySelect
                    value={form.start_date}
                    onChange={(start_date) => setForm((f) => ({ ...f, start_date }))}
                    required
                  />
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
              Bank details (payslip)
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm text-ink-300">
                Bank name
                <input
                  className={`${adminFieldClass} mt-1`}
                  value={form.bank_name}
                  onChange={(e) => setForm((f) => ({ ...f, bank_name: e.target.value }))}
                  placeholder="e.g. First National Bank"
                />
              </label>
              <label className="text-sm text-ink-300">
                Account number
                <input
                  className={`${adminFieldClass} mt-1`}
                  value={form.bank_account}
                  onChange={(e) => setForm((f) => ({ ...f, bank_account: e.target.value }))}
                />
              </label>
              <label className="text-sm text-ink-300 sm:col-span-2">
                Notes
                <textarea
                  rows={2}
                  className={`${adminFieldClass} mt-1 resize-y`}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </label>
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

      {viewing && !showForm ? (
        <section className="rounded-2xl border border-white/10 bg-ink-900/40 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-white">{viewing.name}</h2>
              <p className="mt-1 text-xs text-ink-400">
                {viewing.employment?.job_title || 'Staff'} ·{' '}
                {privilegeRoleLabel(viewing.role)} ·{' '}
                <span className={viewing.is_active ? 'text-brand-300' : 'text-red-300'}>
                  {viewing.is_active ? 'Active' : 'Disabled'}
                </span>
              </p>
            </div>
            <div className="flex items-center gap-1">
              <AdminIconAction
                label="Edit"
                icon="pencil"
                onClick={() => startEdit(viewing)}
              />
              <AdminIconAction
                label="Close"
                icon="x"
                tone="muted"
                onClick={closeView}
              />
            </div>
          </div>

          <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <DetailField label="First name">{dash(viewing.first_name)}</DetailField>
            <DetailField label="Middle name">{dash(viewing.middle_name)}</DetailField>
            <DetailField label="Last name">{dash(viewing.surname)}</DetailField>
            <DetailField label="Gender">{genderLabel(viewing.gender)}</DetailField>
            <DetailField label="Email">{dash(viewing.email)}</DetailField>
            <DetailField label="Phone">{dash(viewing.phone)}</DetailField>
            <DetailField label="Job title">{dash(viewing.employment?.job_title)}</DetailField>
            <DetailField label="System role">{privilegeRoleLabel(viewing.role)}</DetailField>
            <DetailField label="Base salary">
              {formatPula(viewing.employment?.base_salary || 0)}
            </DetailField>
            <DetailField label="Employment status">
              {statusLabel(viewing.employment?.employment_status)}
            </DetailField>
            <DetailField label="Start date">{dash(viewing.employment?.start_date)}</DetailField>
            <DetailField label="Bank name">{dash(viewing.employment?.bank_name)}</DetailField>
            <DetailField label="Account number">
              {dash(viewing.employment?.bank_account)}
            </DetailField>
            <DetailField label="Notes" className="sm:col-span-2 lg:col-span-3">
              {dash(viewing.employment?.notes)}
            </DetailField>
          </dl>
        </section>
      ) : null}

      <div className="space-y-3">
        <label className="block max-w-md">
          <span className="sr-only">Search staff</span>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, email, phone, or job title…"
            className={adminFieldClass}
            autoComplete="off"
          />
        </label>
      <div className={adminTableShellClass}>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/10 text-ink-400">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Job title</th>
              <th className="px-3 py-2">System role</th>
              <th className="px-3 py-2">Salary</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-ink-500">
                  Loading…
                </td>
              </tr>
            ) : !staff.length ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-ink-500">
                  No staff yet.
                </td>
              </tr>
            ) : !filteredStaff.length ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-ink-500">
                  No staff match your search.
                </td>
              </tr>
            ) : (
              filteredStaff.map((row) => {
                const isSelected = selectedId === row.id
                return (
                  <Fragment key={row.id}>
                    <tr
                      role="button"
                      tabIndex={0}
                      className={`group border-b border-white/5 ${clickableRowClass} ${
                        isSelected ? 'bg-brand-500/10' : 'bg-ink-900/20'
                      }`}
                      onClick={() => selectStaff(row)}
                      onKeyDown={(e) => activateRowKey(e, () => selectStaff(row))}
                    >
                      <td className="px-3 py-2 text-white">
                        <span className={clickableDocClass}>{row.name}</span>
                        <div className="text-xs text-ink-500">{row.email}</div>
                        {row.phone ? <div className="text-xs text-ink-500">{row.phone}</div> : null}
                      </td>
                      <td className="px-3 py-2 text-ink-300">
                        {row.employment?.job_title || '—'}
                      </td>
                      <td className="px-3 py-2 text-ink-300">{privilegeRoleLabel(row.role)}</td>
                      <td className="px-3 py-2 text-ink-200">
                        {formatPula(row.employment?.base_salary || 0)}
                      </td>
                      <td className="px-3 py-2">
                        <span className={row.is_active ? 'text-brand-300' : 'text-red-300'}>
                          {row.is_active ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div
                          className="inline-flex justify-end"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <ActionsMenu
                            label={`Actions for ${row.name}`}
                            items={staffRowMenuItems(row)}
                          />
                        </div>
                      </td>
                    </tr>
                    {isSelected ? (
                      <tr className="border-b border-white/10 bg-ink-950/70">
                        <td colSpan={6} className="px-3 py-4">
                          <div className="grid gap-4 lg:grid-cols-3">
                            <section className="rounded-xl border border-white/10 bg-ink-900/50 p-3 sm:p-4">
                              <h3 className="text-sm font-semibold text-white">Benefits</h3>
                              <ul className="mt-3 space-y-2 text-sm text-ink-300">
                                {activeAssignments.map((a) => (
                                  <li
                                    key={a.id}
                                    className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 ${
                                      editingBenefitId === a.id ? 'bg-brand-500/10' : 'bg-white/[0.03]'
                                    }`}
                                  >
                                    <span>
                                      {a.benefit?.name || 'Benefit'}
                                      <span className="ml-2 text-ink-100">{formatPula(a.amount)}</span>
                                    </span>
                                    <span className="inline-flex shrink-0 gap-0.5">
                                      <AdminIconAction
                                        label="Edit benefit"
                                        icon="pencil"
                                        onClick={() => startEditBenefit(a)}
                                      />
                                      <AdminIconAction
                                        label="Remove benefit"
                                        icon="trash"
                                        tone="danger"
                                        onClick={() => removeBenefit(a)}
                                      />
                                    </span>
                                  </li>
                                ))}
                                {!activeAssignments.length ? (
                                  <li className="text-ink-500">No benefits assigned.</li>
                                ) : null}
                              </ul>
                              {editingBenefit || availableBenefitTypes.length ? (
                                <div className="mt-4 space-y-2">
                                  {editingBenefit ? (
                                    <p className="text-xs text-ink-400">
                                      Editing{' '}
                                      <span className="text-ink-200">
                                        {editingBenefit.benefit?.name || 'benefit'}
                                      </span>
                                    </p>
                                  ) : (
                                    <select
                                      className={adminFieldClass}
                                      value={benefitTypeId}
                                      onChange={(e) => setBenefitTypeId(e.target.value)}
                                    >
                                      {availableBenefitTypes.map((t) => (
                                        <option key={t.id} value={t.id}>
                                          {t.name}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="number"
                                      min="0.01"
                                      step="0.01"
                                      placeholder="Amount"
                                      className={adminFieldClass}
                                      value={benefitAmount}
                                      onChange={(e) => setBenefitAmount(e.target.value)}
                                    />
                                    <AdminIconAction
                                      label={editingBenefit ? 'Update benefit' : 'Save benefit'}
                                      icon="check"
                                      onClick={saveBenefit}
                                    />
                                    {editingBenefit ? (
                                      <AdminIconAction
                                        label="Cancel edit"
                                        icon="x"
                                        tone="muted"
                                        onClick={cancelEditBenefit}
                                      />
                                    ) : null}
                                  </div>
                                </div>
                              ) : (
                                <p className="mt-3 text-xs text-ink-500">
                                  All benefit types are already assigned. Edit or remove an existing one.
                                </p>
                              )}
                            </section>

                            <section className="rounded-xl border border-white/10 bg-ink-900/50 p-3 sm:p-4">
                              <h3 className="text-sm font-semibold text-white">Open advances</h3>
                              <ul className="mt-3 space-y-2 text-sm text-ink-300">
                                {advances.map((a) => (
                                  <li
                                    key={a.id}
                                    className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 ${
                                      editingAdvanceId === a.id ? 'bg-brand-500/10' : 'bg-white/[0.03]'
                                    }`}
                                  >
                                    <span>
                                      {a.advance_date}
                                      <span className="ml-2 text-ink-100">
                                        {formatPula(a.remaining)} left
                                      </span>
                                      {a.notes ? (
                                        <span className="mt-0.5 block text-xs text-ink-500">{a.notes}</span>
                                      ) : null}
                                    </span>
                                    <span className="inline-flex shrink-0 gap-0.5">
                                      <AdminIconAction
                                        label="Edit advance"
                                        icon="pencil"
                                        onClick={() => startEditAdvance(a)}
                                      />
                                      <AdminIconAction
                                        label="Delete advance"
                                        icon="trash"
                                        tone="danger"
                                        onClick={() => removeAdvance(a)}
                                      />
                                    </span>
                                  </li>
                                ))}
                                {!advances.length ? (
                                  <li className="text-ink-500">No open advances.</li>
                                ) : null}
                              </ul>
                              <div className="mt-4 space-y-2">
                                {editingAdvance ? (
                                  <p className="text-xs text-ink-400">
                                    Editing advance from{' '}
                                    <span className="text-ink-200">{editingAdvance.advance_date}</span>
                                  </p>
                                ) : null}
                                <input
                                  type="number"
                                  min="0.01"
                                  step="0.01"
                                  placeholder="Advance amount"
                                  className={adminFieldClass}
                                  value={advanceAmount}
                                  onChange={(e) => setAdvanceAmount(e.target.value)}
                                />
                                <div className="flex items-center gap-2">
                                  <input
                                    placeholder="Notes"
                                    className={adminFieldClass}
                                    value={advanceNotes}
                                    onChange={(e) => setAdvanceNotes(e.target.value)}
                                  />
                                  <AdminIconAction
                                    label={editingAdvance ? 'Update advance' : 'Record advance'}
                                    icon={editingAdvance ? 'check' : 'plus'}
                                    onClick={saveAdvance}
                                  />
                                  {editingAdvance ? (
                                    <AdminIconAction
                                      label="Cancel edit"
                                      icon="x"
                                      tone="muted"
                                      onClick={cancelEditAdvance}
                                    />
                                  ) : null}
                                </div>
                              </div>
                            </section>

                            <section className="rounded-xl border border-white/10 bg-ink-900/50 p-3 sm:p-4">
                              <h3 className="text-sm font-semibold text-white">After-hours access</h3>
                              <p className="mt-1 text-xs text-ink-500">
                                Ops is Mon–Fri 07:00–18:00. Grant temporary access beyond that window.
                              </p>
                              {String(row.role) === 'admin' ? (
                                <p className="mt-3 text-sm text-ink-500">
                                  Admins always have ops access.
                                </p>
                              ) : AUTH_BYPASS ? (
                                <p className="mt-3 text-sm text-ink-500">
                                  Needs a real admin session.
                                </p>
                              ) : (
                                <div className="mt-4 space-y-2">
                                  <label className="block text-xs text-ink-400">
                                    Access until
                                    <input
                                      type="datetime-local"
                                      className={`${adminFieldClass} mt-1`}
                                      value={afterHoursUntil}
                                      onChange={(e) => setAfterHoursUntil(e.target.value)}
                                    />
                                  </label>
                                  <div className="flex items-center gap-0.5">
                                    <AdminIconAction
                                      label="Save access window"
                                      icon="check"
                                      disabled={afterHoursBusy}
                                      onClick={() => saveAfterHours(false)}
                                    />
                                    <AdminIconAction
                                      label="Clear access"
                                      icon="x"
                                      tone="muted"
                                      disabled={
                                        afterHoursBusy || !isAfterHoursActive(row.after_hours_until)
                                      }
                                      onClick={() => saveAfterHours(true)}
                                    />
                                  </div>
                                  {isAfterHoursActive(row.after_hours_until) ? (
                                    <p className="text-xs text-brand-300/90">
                                      Currently until{' '}
                                      {new Date(row.after_hours_until).toLocaleString()}
                                    </p>
                                  ) : null}
                                </div>
                              )}
                            </section>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      </div>

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
                  <AdminIconAction
                    label="Print"
                    icon="print"
                    onClick={() => openPayslipPrintWindow(s)}
                  />
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
