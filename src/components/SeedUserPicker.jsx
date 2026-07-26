import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { ROLES } from '../lib/authConfig'
import { authAction } from '../lib/authApi'

const ROLE_ORDER = [ROLES.admin, ROLES.staff, ROLES.client]

/**
 * Dev/local seed account picker — mints a real session via `dev_impersonate`.
 * Requires Edge ALLOW_DEV_IMPERSONATE=true (blocked when APP_ENV=production).
 */
export function SeedUserPicker({
  title = 'Choose a seed user',
  subtitle = 'Creates a real session for local testing. Seed password is password123.',
  className = '',
  onPicked,
}) {
  const navigate = useNavigate()
  const { user, applySession } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data, error: err } = await authAction('list_users_dev', {})
      if (err || data?.success === false) {
        setError(err?.message || data?.message || 'Could not load users')
        setUsers([])
        return
      }
      setUsers(data?.users || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  const grouped = useMemo(() => {
    const map = { admin: [], staff: [], client: [], other: [] }
    for (const u of users) {
      const role = String(u.role || '').toLowerCase()
      if (map[role]) map[role].push(u)
      else map.other.push(u)
    }
    return map
  }, [users])

  async function pick(target) {
    setBusyId(target.id)
    setError('')
    try {
      const prev =
        typeof window !== 'undefined' ? localStorage.getItem('session') || '' : ''
      const { data, error: err } = await authAction('dev_impersonate', {
        user_id: target.id,
        session_token: prev,
      })
      if (err || !data?.session_token) {
        setError(err?.message || data?.message || 'Could not create session')
        return
      }
      await applySession(data)
      onPicked?.(data.user)
      // Let RoleRedirect choose portal vs admin vs ops-closed (handles dual-role + hours).
      navigate('/redirect', { replace: true })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className={className}>
      <h2 className="font-display text-lg font-semibold text-white">{title}</h2>
      {subtitle ? <p className="mt-1 text-sm text-ink-400">{subtitle}</p> : null}
      {user ? (
        <p className="mt-2 text-xs text-ink-500">
          Current: {user.name} ({user.role})
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className="mt-4 text-sm text-ink-400">Loading seed users…</p>
      ) : (
        <div className="mt-4 space-y-4">
          {ROLE_ORDER.map((role) => {
            const list = grouped[role] || []
            if (!list.length) return null
            return (
              <div key={role}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
                  {role}
                </h3>
                <ul className="space-y-1.5">
                  {list.map((u) => (
                    <li key={u.id}>
                      <button
                        type="button"
                        disabled={!!busyId || u.id === user?.id}
                        onClick={() => pick(u)}
                        className="flex w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-ink-950/50 px-3 py-2.5 text-left text-sm text-ink-200 transition hover:border-brand-500/40 hover:bg-white/5 disabled:opacity-40"
                      >
                        <span>
                          <span className="font-medium text-white">{u.name}</span>
                          <span className="mt-0.5 block text-xs text-ink-500">
                            {u.email || u.phone || u.id}
                            {u.must_change_password ? ' · must change password' : ''}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs font-semibold text-brand-300">
                          {busyId === u.id ? '…' : u.id === user?.id ? 'active' : 'Use'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
          {!users.length ? (
            <p className="text-sm text-ink-500">
              No users returned. Confirm Edge secrets{' '}
              <code className="text-ink-300">ALLOW_DEV_IMPERSONATE=true</code> and{' '}
              <code className="text-ink-300">APP_ENV=development</code>.
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}
