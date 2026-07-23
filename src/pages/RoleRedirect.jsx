import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { normalizeRole, ROLES } from '../lib/authConfig'

/** Post-login role router (Phase 6). Works with bypass roles today. */
export default function RoleRedirect() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-950 text-ink-300">
        Redirecting…
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  const role = normalizeRole(user.role)
  if (role === ROLES.client) return <Navigate to="/portal" replace />
  return <Navigate to="/admin" replace />
}
