import { useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { AUTH_BYPASS, DEV_AUTH_SWITCHER } from '../lib/authConfig'
import { authAction } from '../lib/authApi'
import { CountryPhoneInput } from '../components/CountryPhoneInput'
import { PasswordField } from '../components/PasswordField'
import { SeedUserPicker } from '../components/SeedUserPicker'
import { adminBtnPrimary, adminBtnSecondary, adminFieldClass } from '../admin/ui'

const METHODS = [
  { id: 'email', label: 'Email OTP' },
  { id: 'sms', label: 'SMS OTP' },
  { id: 'password', label: 'Password' },
]

function safeRedirect(raw) {
  if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw
  return '/redirect'
}

export default function Login() {
  const { user, authBypass, applySession } = useAuth()
  const [params] = useSearchParams()
  const redirect = safeRedirect(params.get('redirect'))

  const [showOther, setShowOther] = useState(!DEV_AUTH_SWITCHER)
  const [method, setMethod] = useState('password')
  const [email, setEmail] = useState('')
  const [phoneCountry, setPhoneCountry] = useState('BW')
  const [phone, setPhone] = useState('+267')
  const [password, setPassword] = useState('')
  const [passwordLogin, setPasswordLogin] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [code, setCode] = useState('')
  const [devOtp, setDevOtp] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  if (authBypass || user) {
    if (user?.must_change_password) {
      return <Navigate to="/change-password" replace />
    }
    const target = AUTH_BYPASS ? '/admin' : redirect === '/admin' ? '/redirect' : redirect
    return <Navigate to={target} replace />
  }

  function resetOtpState() {
    setOtpSent(false)
    setCode('')
    setDevOtp('')
    setInfo('')
    setError('')
  }

  function switchMethod(next) {
    setMethod(next)
    resetOtpState()
  }

  async function requestOtp(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setInfo('')
    setDevOtp('')
    try {
      const channel = method === 'sms' ? 'sms' : 'email'
      const destination = channel === 'sms' ? phone.trim() : email.trim()
      if (!destination) {
        setError(channel === 'sms' ? 'Enter your phone number.' : 'Enter your email.')
        return
      }
      const { data, error: err } = await authAction('request_otp', {
        channel,
        destination,
      })
      if (err || data?.success === false) {
        setError(err?.message || data?.message || 'Could not send code.')
        return
      }
      setOtpSent(true)
      setInfo(data?.message || 'Code sent.')
      if (data?.dev_otp) setDevOtp(String(data.dev_otp))
    } finally {
      setBusy(false)
    }
  }

  async function verifyOtp(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const channel = method === 'sms' ? 'sms' : 'email'
      const destination = channel === 'sms' ? phone.trim() : email.trim()
      const { data, error: err } = await authAction('verify_otp', {
        channel,
        destination,
        code: code.trim(),
      })
      if (err || !data?.session_token) {
        setError(err?.message || data?.message || 'Invalid or expired code.')
        return
      }
      await applySession(data)
    } finally {
      setBusy(false)
    }
  }

  async function loginPassword(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { data, error: err } = await authAction('login_password', {
        login: passwordLogin.trim(),
        password,
      })
      if (err || !data?.session_token) {
        setError(err?.message || data?.message || 'Invalid login or password.')
        return
      }
      await applySession(data)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink-950 px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        {DEV_AUTH_SWITCHER ? (
          <div className="rounded-3xl border border-amber-500/30 bg-ink-900/60 p-8">
            <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-amber-200">
              Local testing
            </p>
            <SeedUserPicker
              title="Sign in as seed user"
              subtitle="Admin, staff, and client accounts with a real session. Temporary password: password123."
            />
          </div>
        ) : null}

        <div className="rounded-3xl border border-white/10 bg-ink-900/60 p-8">
          {DEV_AUTH_SWITCHER ? (
            <button
              type="button"
              onClick={() => setShowOther((v) => !v)}
              className="mb-4 text-sm font-semibold text-brand-400 hover:text-brand-300"
            >
              {showOther ? 'Hide password / OTP' : 'Other sign-in (password / OTP)'}
            </button>
          ) : (
            <>
              <h1 className="font-display text-2xl font-bold text-white">Sign in</h1>
              <p className="mt-2 text-sm text-ink-300">
                Select the login route that you are comfortable with. Email and password are free to
                use. SMS may be paid.
              </p>
            </>
          )}

          {showOther ? (
            <>
              {!DEV_AUTH_SWITCHER ? null : (
                <h1 className="font-display text-xl font-bold text-white">Password / OTP</h1>
              )}

              <div className="mt-6 grid grid-cols-3 gap-2">
                {METHODS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => switchMethod(m.id)}
                    className={`rounded-xl px-2 py-2 text-xs font-semibold transition sm:text-sm ${
                      method === m.id
                        ? 'bg-brand-500 text-ink-950'
                        : 'border border-white/10 text-ink-300 hover:bg-white/5'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {error ? (
                <p className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  {error}
                </p>
              ) : null}
              {info ? (
                <p className="mt-4 rounded-xl border border-brand-500/30 bg-brand-500/10 px-3 py-2 text-sm text-brand-100">
                  {info}
                  {devOtp ? (
                    <>
                      {' '}
                      Dev code: <span className="font-mono font-semibold text-white">{devOtp}</span>
                    </>
                  ) : null}
                </p>
              ) : null}

              {method === 'password' ? (
                <form onSubmit={loginPassword} className="mt-6 space-y-4">
                  <label className="block text-sm text-ink-300">
                    Email or phone
                    <input
                      type="text"
                      autoComplete="username"
                      value={passwordLogin}
                      onChange={(e) => setPasswordLogin(e.target.value)}
                      className={`${adminFieldClass} mt-1`}
                      placeholder="you@example.com or +267…"
                      required
                    />
                  </label>
                  <label className="block text-sm text-ink-300">
                    Password
                    <PasswordField
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </label>
                  <button type="submit" disabled={busy} className={`${adminBtnPrimary} w-full`}>
                    {busy ? 'Signing in…' : 'Sign in'}
                  </button>
                </form>
              ) : !otpSent ? (
                <form onSubmit={requestOtp} className="mt-6 space-y-4">
                  {method === 'email' ? (
                    <label className="block text-sm text-ink-300">
                      Email
                      <input
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={`${adminFieldClass} mt-1`}
                        required
                      />
                    </label>
                  ) : (
                    <div className="text-sm text-ink-300">
                      <span className="mb-1 block">Phone</span>
                      <CountryPhoneInput
                        country={phoneCountry}
                        phone={phone}
                        onChange={({ country, phone: next }) => {
                          setPhoneCountry(country)
                          setPhone(next)
                        }}
                        required
                      />
                      <p className="mt-2 text-xs text-ink-500">
                        SMS delivery is stubbed until the paid SMS route is connected.
                      </p>
                    </div>
                  )}
                  <button type="submit" disabled={busy} className={`${adminBtnPrimary} w-full`}>
                    {busy ? 'Sending…' : 'Send code'}
                  </button>
                </form>
              ) : (
                <form onSubmit={verifyOtp} className="mt-6 space-y-4">
                  <label className="block text-sm text-ink-300">
                    One-time code
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      className={`${adminFieldClass} mt-1 font-mono tracking-widest`}
                      placeholder="000000"
                      required
                    />
                  </label>
                  <button type="submit" disabled={busy} className={`${adminBtnPrimary} w-full`}>
                    {busy ? 'Verifying…' : 'Verify & sign in'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={resetOtpState}
                    className={`${adminBtnSecondary} w-full`}
                  >
                    Back
                  </button>
                </form>
              )}
            </>
          ) : null}

          <Link to="/" className="mt-6 block text-center text-sm font-semibold text-brand-400">
            ← Back to site
          </Link>
        </div>
      </div>
    </div>
  )
}
