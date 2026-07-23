import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { ROLES } from '../lib/authConfig'

export default function Unauthorized() {
  const navigate = useNavigate()
  const { user, authBypass, setBypassRole } = useAuth()
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
              setBypassRole(ROLES.staff)
              navigate('/admin', { replace: true })
            }}
            className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-ink-950 hover:bg-brand-400"
          >
            Continue as staff
          </button>
          <button
            type="button"
            onClick={() => {
              setBypassRole(ROLES.client)
              navigate('/portal', { replace: true })
            }}
            className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-ink-200 hover:bg-white/5"
          >
            Continue as client
          </button>
        </div>
      ) : (
        <div className="mt-6 flex gap-4">
          <Link
            to={role === ROLES.client ? '/portal' : '/admin'}
            className="text-sm font-semibold text-brand-400"
          >
            {role === ROLES.client ? 'Client portal' : 'Ops home'}
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
