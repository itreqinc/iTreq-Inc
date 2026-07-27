import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { isStaffLike, ROLES } from '../lib/authConfig'
import { adminBtnPrimary, adminBtnSecondary } from '../admin/ui'

export default function Unauthorized() {
  const navigate = useNavigate()
  const { user, authBypass, setBypassRole, logout } = useAuth()
  const role = user?.role

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink-950 px-4 text-center">
      <h1 className="font-display text-2xl font-bold text-white">Not authorized</h1>
      <p className="mt-3 max-w-md text-sm text-ink-300">
        Your account does not have access to this area
        {role ? (
          <>
            {' '}
            (current role: <span className="text-white">{role}</span>)
          </>
        ) : null}
        .
      </p>

      {authBypass ? (
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              setBypassRole(ROLES.admin)
              navigate('/admin', { replace: true })
            }}
            className={adminBtnPrimary}
          >
            Continue as admin
          </button>
          <button
            type="button"
            onClick={() => {
              setBypassRole(ROLES.staff)
              navigate('/admin', { replace: true })
            }}
            className={adminBtnSecondary}
          >
            Continue as staff
          </button>
          <button
            type="button"
            onClick={() => {
              setBypassRole(ROLES.client)
              navigate('/portal', { replace: true })
            }}
            className={adminBtnSecondary}
          >
            Continue as client
          </button>
        </div>
      ) : (
        <div className="mt-6 flex flex-wrap justify-center gap-4">
          <button
            type="button"
            onClick={async () => {
              await logout()
              navigate('/login', { replace: true })
            }}
            className={adminBtnPrimary}
          >
            Sign out
          </button>
          <Link
            to={
              role === ROLES.client
                ? '/portal'
                : isStaffLike(role)
                  ? '/admin'
                  : '/login'
            }
            className="text-sm font-semibold text-brand-400"
          >
            {role === ROLES.client
              ? 'Client portal'
              : isStaffLike(role)
                ? 'Ops home'
                : 'Sign in'}
          </Link>
          <Link to="/" className="text-sm font-semibold text-ink-400">
            Public site
          </Link>
        </div>
      )}

      <Link to="/" className="mt-4 text-sm text-ink-500 hover:text-ink-300">
        Public site
      </Link>
    </div>
  )
}
