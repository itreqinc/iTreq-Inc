import { Navigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
  VIEW_MODES,
  isStaffLike,
  normalizeRole,
  ROLES,
} from '../lib/authConfig'

export function ProtectedRoute({ children, allowedRoles, requireOpsHours = false }) {
  const { user, loading, opsAllowed, viewMode, dualRole, setViewMode } = useAuth()
  const location = useLocation()

  // Outside ops hours, dual-role staff must use client view — keep mode in sync
  // so /portal is allowed and we don't bounce /admin ↔ /portal.
  useEffect(() => {
    if (!user || !dualRole || opsAllowed) return
    if (viewMode !== VIEW_MODES.client) setViewMode(VIEW_MODES.client)
  }, [user, dualRole, opsAllowed, viewMode, setViewMode])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-ink-300">
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
  const portalAsDualRole =
    dualRole && (viewMode === VIEW_MODES.client || !opsAllowed)

  // Dual-role in client view (or forced there when ops is closed).
  if (allowedRoles?.includes(ROLES.client) && portalAsDualRole) {
    return children
  }

  if (allowedRoles?.length) {
    const ok = allowedRoles.some((r) => normalizeRole(r) === ur)
    if (!ok) {
      if (ur === ROLES.client) return <Navigate to="/portal" replace />
      if (isStaffLike(ur)) {
        if (portalAsDualRole) {
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

  // Dual-role staff view should not linger on portal routes (only when ops is open).
  if (
    dualRole &&
    opsAllowed &&
    viewMode === VIEW_MODES.staff &&
    location.pathname.startsWith('/portal')
  ) {
    return <Navigate to="/admin" replace />
  }

  return children
}
