import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { VIEW_MODES } from '../lib/authConfig'
import { adminBtnPrimary, adminBtnSecondary } from '../admin/ui'

export default function OpsClosed() {
  const navigate = useNavigate()
  const { dualRole, setViewMode } = useAuth()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <h1 className="font-display text-2xl font-bold text-white">
        Operations are currently closed
      </h1>
      <p className="mt-3 max-w-md text-sm text-ink-300">
        Staff access to operations is available Monday–Friday, 07:00–18:00. Ask the Admin to grant
        you access.
      </p>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {dualRole ? (
          <button
            type="button"
            className={adminBtnPrimary}
            onClick={() => {
              setViewMode(VIEW_MODES.client)
              navigate('/portal', { replace: true })
            }}
          >
            Back to portal
          </button>
        ) : null}
        <Link to="/" className={dualRole ? adminBtnSecondary : adminBtnPrimary}>
          Public Site
        </Link>
      </div>
    </div>
  )
}
