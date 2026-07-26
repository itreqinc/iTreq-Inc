import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { VIEW_MODES } from '../lib/authConfig'
import { adminBtnPrimary, adminBtnSecondary } from '../admin/ui'

export default function OpsClosed() {
  const { user, dualRole, setViewMode, logout } = useAuth()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink-950 px-4 text-center">
      <h1 className="font-display text-2xl font-bold text-white">Ops is closed</h1>
      <p className="mt-3 max-w-md text-sm text-ink-300">
        Staff access to ops is available Monday–Friday, 07:00–18:00 (Africa/Gaborone), unless an
        admin grants after-hours access.
      </p>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {user?.client_id || dualRole ? (
          <button
            type="button"
            className={adminBtnPrimary}
            onClick={() => setViewMode(VIEW_MODES.client)}
          >
            Open client portal
          </button>
        ) : null}
        <button
          type="button"
          className={adminBtnSecondary}
          onClick={async () => {
            await logout()
            window.location.href = '/login'
          }}
        >
          Sign out
        </button>
        <Link to="/" className={adminBtnSecondary}>
          Public site
        </Link>
      </div>
    </div>
  )
}
