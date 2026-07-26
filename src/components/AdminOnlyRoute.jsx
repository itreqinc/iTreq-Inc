import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { isAdmin } from '../lib/authConfig'

/** Renders children only for admin; others are sent back to the ops dashboard. */
export function AdminOnlyRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-ink-300">
        Checking access…
      </div>
    )
  }

  if (!isAdmin(user?.role)) {
    return <Navigate to="/admin" replace />
  }

  return children
}
