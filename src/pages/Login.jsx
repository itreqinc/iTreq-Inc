import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { AUTH_BYPASS } from '../lib/authConfig'

/**
 * Real OTP login lands in Phase 6 (iRegistry pattern).
 * With auth bypass on, redirect straight into ops.
 */
export default function Login() {
  const { user, authBypass } = useAuth()
  const [params] = useSearchParams()
  const redirect = params.get('redirect') || '/admin'

  if (authBypass || user) {
    const safe =
      redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/admin'
    return <Navigate to={AUTH_BYPASS ? '/admin' : safe} replace />
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink-950 px-4">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-ink-900/60 p-8 text-center">
        <h1 className="font-display text-2xl font-bold text-white">Staff login</h1>
        <p className="mt-3 text-sm text-ink-300">
          OTP login (same flow as iRegistry) will be connected in Phase 6. For now, enable{' '}
          <code className="text-brand-300">VITE_AUTH_BYPASS=true</code> in{' '}
          <code className="text-brand-300">.env.local</code> and restart the dev server.
        </p>
        <Link to="/" className="mt-6 inline-block text-sm font-semibold text-brand-400">
          ← Back to site
        </Link>
      </div>
    </div>
  )
}
