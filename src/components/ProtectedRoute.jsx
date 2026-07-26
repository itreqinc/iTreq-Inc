import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  VIEW_MODES,
  isStaffLike,
  normalizeRole,
  ROLES,
} from '../lib/authConfig'

export function ProtectedRoute({ children, allowedRoles, requireOpsHours = false }) {
  const { user, loading, opsAllowed, viewMode, dualRole } = useAuth()
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

  if (user.must_change_password && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }

  const ur = normalizeRole(user.role)

  // Dual-role in client view: treat as portal access even if role is staff/admin.
  if (allowedRoles?.includes(ROLES.client) && dualRole && viewMode === VIEW_MODES.client) {
    return children
  }

  if (allowedRoles?.length) {
    const ok = allowedRoles.some((r) => normalizeRole(r) === ur)
    if (!ok) {
      if (ur === ROLES.client) return <Navigate to="/portal" replace />
      if (isStaffLike(ur)) {
        if (dualRole && viewMode === VIEW_MODES.client) {
          return <Navigate to="/portal" replace />
        }
        return <Navigate to="/admin" replace />
      }
      return <Navigate to="/unauthorized" replace />
    }
  }

  if (requireOpsHours && isStaffLike(ur) && !opsAllowed) {
    if (user.client_id) {
      return <Navigate to="/portal" replace />
    }
    return <Navigate to="/ops-closed" replace />
  }

  // Dual-role staff view should not linger on portal routes.
  if (
    dualRole &&
    viewMode === VIEW_MODES.staff &&
    location.pathname.startsWith('/portal')
  ) {
    return <Navigate to={opsAllowed ? '/admin' : '/ops-closed'} replace />
  }

  return children
}
