import { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  VIEW_MODES,
  canAccessOps,
  isStaffLike,
  normalizeRole,
  ROLES,
} from '../lib/authConfig'

/** Post-login role router. */
export default function RoleRedirect() {
  const { user, loading, opsAccess, dualRole, viewMode, setViewMode } = useAuth()

  useEffect(() => {
    if (!user) return
    if (isStaffLike(user.role) && user.client_id && !canAccessOps(user, opsAccess)) {
      setViewMode(VIEW_MODES.client)
    }
  }, [user, opsAccess, setViewMode])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-ink-300">
        Redirecting…
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (user.must_change_password) return <Navigate to="/change-password" replace />

  const role = normalizeRole(user.role)

  if (dualRole && viewMode === VIEW_MODES.client) {
    return <Navigate to="/portal" replace />
  }

  if (role === ROLES.client) return <Navigate to="/portal" replace />

  if (isStaffLike(role)) {
    if (canAccessOps(user, opsAccess)) return <Navigate to="/admin" replace />
    if (user.client_id) return <Navigate to="/portal" replace />
    return <Navigate to="/ops-closed" replace />
  }

  return <Navigate to="/unauthorized" replace />
}
