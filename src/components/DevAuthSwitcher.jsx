import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { DEV_AUTH_SWITCHER, isStaffLike, ROLES } from '../lib/authConfig'
import { authAction } from '../lib/authApi'

/**
 * Local-only quick user switcher.
 * Requires import.meta.env.DEV + VITE_DEV_AUTH_SWITCHER=true
 * and Edge ALLOW_DEV_IMPERSONATE=true (blocked when APP_ENV=production).
 */
export function DevAuthSwitcher() {
  const navigate = useNavigate()
  const { user, applySession, authBypass } = useAuth()
  const [open, setOpen] = useState(false)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
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
    if (!open) return
    loadUsers()
  }, [open, loadUsers])

  if (!DEV_AUTH_SWITCHER || authBypass) return null

  async function impersonate(target) {
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
        setError(err?.message || data?.message || 'Impersonation failed')
        return
      }
      await applySession(data)
      setOpen(false)
      const role = String(target.role || '').toLowerCase()
      if (role === ROLES.client) navigate('/portal', { replace: true })
      else if (isStaffLike(role)) navigate('/admin', { replace: true })
      else navigate('/redirect', { replace: true })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-[100] max-w-sm font-sans text-xs">
      {open ? (
        <div className="rounded-2xl border border-amber-500/40 bg-ink-950/95 p-3 shadow-xl backdrop-blur">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="font-semibold text-amber-200">Dev user switcher</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-ink-400 hover:text-white"
            >
              Close
            </button>
          </div>
          <p className="mb-2 text-ink-400">
            Current: {user?.name || 'none'} ({user?.role || '—'})
          </p>
          {error ? <p className="mb-2 text-red-300">{error}</p> : null}
          {loading ? (
            <p className="text-ink-400">Loading users…</p>
          ) : (
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {users.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    disabled={!!busyId || u.id === user?.id}
                    onClick={() => impersonate(u)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/10 px-2 py-1.5 text-left text-ink-200 transition hover:bg-white/5 disabled:opacity-40"
                  >
                    <span>
                      <span className="font-medium text-white">{u.name}</span>
                      <span className="mt-0.5 block text-[10px] text-ink-500">
                        {u.role}
                        {u.email ? ` · ${u.email}` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-amber-300">
                      {busyId === u.id ? '…' : u.id === user?.id ? 'active' : 'switch'}
                    </span>
                  </button>
                </li>
              ))}
              {!users.length ? (
                <li className="text-ink-500">No users (check ALLOW_DEV_IMPERSONATE).</li>
              ) : null}
            </ul>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full border border-amber-500/50 bg-amber-500/15 px-3 py-2 font-semibold text-amber-100 shadow-lg hover:bg-amber-500/25"
        >
          Switch user
        </button>
      )}
    </div>
  )
}
