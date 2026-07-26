import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { canAccessOps, isStaffLike, ROLES, normalizeRole } from '../lib/authConfig'
import { PasswordField } from '../components/PasswordField'
import { adminBtnPrimary } from '../admin/ui'

export default function ChangePassword() {
  const { user, loading, changePassword, opsAccess } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-950 text-ink-300">
        Loading…
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  if (!user.must_change_password && done === false && !busy) {
    const role = normalizeRole(user.role)
    if (role === ROLES.client) return <Navigate to="/portal" replace />
    if (isStaffLike(role) && canAccessOps(user, opsAccess)) {
      return <Navigate to="/admin" replace />
    }
    if (user.client_id) return <Navigate to="/portal" replace />
    return <Navigate to="/redirect" replace />
  }

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirm) {
      setError('New passwords do not match.')
      return
    }
    setBusy(true)
    try {
      await changePassword(
        user.must_change_password ? '' : currentPassword,
        newPassword,
      )
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change password')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    const role = normalizeRole(user.role)
    const to =
      role === ROLES.client
        ? '/portal'
        : canAccessOps(user, opsAccess)
          ? '/admin'
          : user.client_id
            ? '/portal'
            : '/redirect'
    return <Navigate to={to} replace />
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink-950 px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-ink-900/60 p-8">
        <h1 className="font-display text-2xl font-bold text-white">Change password</h1>
        <p className="mt-2 text-sm text-ink-300">
          {user.must_change_password
            ? 'For security, set a new password before continuing. Your invite used a temporary password.'
            : 'Update your account password.'}
        </p>

        {error ? (
          <p className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        ) : null}

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          {!user.must_change_password ? (
            <label className="block text-sm text-ink-300">
              Current password
              <PasswordField
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </label>
          ) : null}
          <label className="block text-sm text-ink-300">
            New password
            <PasswordField
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
          <label className="block text-sm text-ink-300">
            Confirm new password
            <PasswordField
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
            />
          </label>
          <button type="submit" disabled={busy} className={`${adminBtnPrimary} w-full`}>
            {busy ? 'Saving…' : 'Save password'}
          </button>
        </form>

        <Link to="/" className="mt-6 block text-center text-sm font-semibold text-brand-400">
          ← Public site
        </Link>
      </div>
    </div>
  )
}
