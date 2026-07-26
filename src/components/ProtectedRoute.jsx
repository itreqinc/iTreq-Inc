import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { isStaffLike, normalizeRole, ROLES } from '../lib/authConfig'

export function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-950 text-ink-300">
        Checking your session…
      </div>
    )
  }

  const hasToken =
    typeof window !== 'undefined' &&
    (!!localStorage.getItem('session') || user?.bypass)

  if (!user || !user.role || !hasToken) {
    const redirect = `${location.pathname}${location.search}${location.hash}`
    return (
      <Navigate to={`/login?redirect=${encodeURIComponent(redirect)}`} replace />
    )
  }

  if (allowedRoles?.length) {
    const ur = normalizeRole(user.role)
    const ok = allowedRoles.some((r) => normalizeRole(r) === ur)
    if (!ok) {
      if (ur === ROLES.client) return <Navigate to="/portal" replace />
      if (isStaffLike(ur)) return <Navigate to="/admin" replace />
      return <Navigate to="/unauthorized" replace />
    }
  }

  return children
}
