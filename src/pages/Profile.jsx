import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { canAccessOps, isStaffLike, ROLES, normalizeRole, privilegeRoleLabel } from '../lib/authConfig'
import {
  inferCountryCodeFromPhone,
  validatePhoneForCountry,
} from '../lib/phoneCountry'
import { CountryPhoneInput } from '../components/CountryPhoneInput'
import { AdminIconAction } from '../admin/AdminIconAction'
import { adminBtnPrimary, adminBtnSecondary, adminFieldClass } from '../admin/ui'

function dash(value) {
  const s = String(value ?? '').trim()
  return s || '—'
}

function formatWhen(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return String(iso)
  }
}

function genderLabel(g) {
  if (g === 'M') return 'Male'
  if (g === 'F') return 'Female'
  return '—'
}

function Field({ label, children }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">{label}</dt>
      <dd className="mt-1 text-sm text-white">{children}</dd>
    </div>
  )
}

export default function Profile() {
  const { user, loading, updateProfile, opsAccess } = useAuth()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    first_name: '',
    middle_name: '',
    surname: '',
    gender: '',
    country: 'BW',
    phone: '+267',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  function syncFormFromUser(u) {
    const phone = u.phone || '+267'
    setForm({
      first_name: u.first_name || '',
      middle_name: u.middle_name || '',
      surname: u.surname || '',
      gender: u.gender || '',
      country: inferCountryCodeFromPhone(phone) || 'BW',
      phone,
    })
  }

  useEffect(() => {
    if (!user) return
    syncFormFromUser(user)
  }, [user])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-ink-300">
        Loading…
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (user.must_change_password) return <Navigate to="/change-password" replace />

  const role = normalizeRole(user.role)
  const home =
    role === ROLES.client
      ? '/portal'
      : canAccessOps(user, opsAccess)
        ? '/admin'
        : user.client_id
          ? '/portal'
          : '/redirect'

  function startEdit() {
    syncFormFromUser(user)
    setError('')
    setInfo('')
    setEditing(true)
  }

  function cancelEdit() {
    syncFormFromUser(user)
    setError('')
    setEditing(false)
  }

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setInfo('')
    if (!String(form.first_name || '').trim() || !String(form.surname || '').trim()) {
      setError('First name and last name are required.')
      return
    }
    const phoneCheck = validatePhoneForCountry(form.country, form.phone)
    if (!phoneCheck.ok) {
      setError(phoneCheck.message)
      return
    }
    setBusy(true)
    try {
      await updateProfile({
        first_name: form.first_name,
        middle_name: form.middle_name || null,
        surname: form.surname,
        gender: form.gender || null,
        phone: form.phone,
      })
      setInfo('Profile saved.')
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save profile')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-ink-900/92 p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold text-white">My profile</h1>
            <p className="mt-2 text-sm text-ink-300">
              {editing
                ? 'Update the details you can change. Email is managed by admin.'
                : 'Your account details. Use Edit to change name, phone, or gender.'}
            </p>
          </div>
          {!editing ? (
            <AdminIconAction label="Edit" icon="pencil" onClick={startEdit} />
          ) : null}
        </div>

        {error ? (
          <p className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        ) : null}
        {info ? (
          <p className="mt-4 rounded-xl border border-brand-500/30 bg-brand-500/10 px-3 py-2 text-sm text-brand-100">
            {info}
          </p>
        ) : null}

        {!editing ? (
          <>
            <dl className="mt-6 grid gap-4 sm:grid-cols-2">
              <Field label="Display name">{dash(user.name)}</Field>
              <Field label="System role">
                <span>{privilegeRoleLabel(user.role)}</span>
              </Field>
              {user.job_title ? (
                <Field label="Job title">{dash(user.job_title)}</Field>
              ) : null}
              <Field label="First name">{dash(user.first_name)}</Field>
              <Field label="Middle name">{dash(user.middle_name)}</Field>
              <Field label="Last name">{dash(user.surname)}</Field>
              <Field label="Gender">{genderLabel(user.gender)}</Field>
              <Field label="Email">{dash(user.email)}</Field>
              <Field label="Phone">{dash(user.phone)}</Field>
              <Field label="First login">{formatWhen(user.first_login_at)}</Field>
              <Field label="Invited">{formatWhen(user.invited_at)}</Field>
              {isStaffLike(role) ? (
                <Field label="After-hours until">{formatWhen(user.after_hours_until)}</Field>
              ) : null}
              {user.client_id ? (
                <Field label="Linked client">Yes</Field>
              ) : null}
            </dl>

            <div className="mt-8 flex flex-wrap gap-2">
              <Link to="/change-password" className={adminBtnSecondary}>
                Change password
              </Link>
              <Link to={home} className={adminBtnSecondary}>
                {isStaffLike(role) ? 'Back to ops' : 'Back to portal'}
              </Link>
            </div>
          </>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
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
            </div>

            <label className="block text-sm text-ink-300">
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

            <label className="block text-sm text-ink-300">
              Email
              <input
                type="email"
                value={user.email || ''}
                readOnly
                className={`${adminFieldClass} mt-1 cursor-default opacity-70`}
              />
            </label>

            <div className="text-sm text-ink-300">
              <span className="mb-1 block">Phone</span>
              <CountryPhoneInput
                country={form.country}
                phone={form.phone}
                required
                onChange={({ country, phone }) => setForm((f) => ({ ...f, country, phone }))}
              />
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <button type="submit" disabled={busy} className={adminBtnPrimary}>
                {busy ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={cancelEdit}
                className={adminBtnSecondary}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
