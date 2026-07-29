import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { useAuth } from '../contexts/AuthContext'
import { AUTH_BYPASS, ROLES, VIEW_MODES } from '../lib/authConfig'
import { getPortalClientId, setPortalClientId } from '../lib/portalClient'
import { opsApi } from '../lib/opsApi'
import { OpsAlertProvider, useOpsAlert } from '../admin/OpsAlertContext'
import { SignOutButton } from '../components/SignOutButton'

function PortalShell() {
  const navigate = useNavigate()
  const { user, authBypass, setBypassRole, dualRole, setViewMode, opsAllowed } =
    useAuth()
  const { showError } = useOpsAlert()
  const [clients, setClients] = useState([])
  const linkedClientId = user?.client_id && !user?.bypass ? user.client_id : null
  const [clientId, setClientId] = useState(() => getPortalClientId(user))
  const [loadingClients, setLoadingClients] = useState(true)

  useEffect(() => {
    if (linkedClientId) {
      setClientId(linkedClientId)
      return
    }
    setClientId(getPortalClientId(user))
  }, [linkedClientId, user])

  useEffect(() => {
    let cancelled = false
    setLoadingClients(true)
    opsApi.listClients().then(({ data, error }) => {
      if (cancelled) return
      setLoadingClients(false)
      if (error) {
        showError(error.message)
        return
      }
      const list = data || []
      setClients(list)

      if (linkedClientId) {
        setClientId(linkedClientId)
        return
      }

      if (!(AUTH_BYPASS || authBypass)) return

      const stored = getPortalClientId(user)
      if (stored && list.some((c) => c.id === stored)) {
        setClientId(stored)
      } else if (list.length === 1) {
        setPortalClientId(list[0].id)
        setClientId(list[0].id)
      } else if (stored && !list.some((c) => c.id === stored)) {
        setPortalClientId(null)
        setClientId(null)
      }
    })
    return () => {
      cancelled = true
    }
  }, [showError, linkedClientId, authBypass, user])

  const selectClient = useCallback((id) => {
    if (!(AUTH_BYPASS || authBypass)) return
    setPortalClientId(id || null)
    setClientId(id || null)
  }, [authBypass])

  const client = useMemo(() => {
    if (linkedClientId) {
      return clients.find((c) => c.id === linkedClientId) || { id: linkedClientId, name: user?.name }
    }
    return clients.find((c) => c.id === clientId) || null
  }, [clients, clientId, linkedClientId, user?.name])

  const effectiveClientId = linkedClientId || clientId

  const outletContext = useMemo(
    () => ({
      clientId: effectiveClientId,
      client,
      clients,
      selectClient,
    }),
    [effectiveClientId, client, clients, selectClient],
  )

  const navClass = ({ isActive }) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium transition ${
      isActive ? 'bg-brand-500/15 text-brand-300' : 'text-ink-300 hover:bg-white/5 hover:text-white'
    }`

  const [navOpen, setNavOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setNavOpen(false)
  }, [location.pathname])

  useEffect(() => {
    document.body.style.overflow = navOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [navOpen])

  const portalNav = [
    { to: '/portal', label: 'Overview', end: true },
    { to: '/portal/quotes', label: 'Quotes' },
    { to: '/portal/invoices', label: 'Invoices' },
    { to: '/portal/payments', label: 'Payments' },
    { to: '/portal/statement', label: 'Statement' },
  ]

  return (
    <div className="min-h-screen overflow-x-clip bg-ink-950 text-ink-100">
      <header className="relative z-40 border-b border-white/10 bg-ink-900/80">
        <div className="mx-auto max-w-5xl px-4 py-3 sm:px-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-3">
            <div className="flex items-center justify-between gap-3 md:justify-start">
              <div className="flex min-w-0 items-center gap-3">
                <Link to="/portal" className="flex min-w-0 items-center gap-2" onClick={() => setNavOpen(false)}>
                  <Logo className="h-9 shrink-0" />
                  <span className="font-display text-sm font-semibold text-white">Client portal</span>
                </Link>
                <nav className="hidden flex-wrap gap-1 md:flex">
                  {portalNav.map((item) => (
                    <NavLink key={item.to} to={item.to} end={item.end} className={navClass}>
                      {item.label}
                    </NavLink>
                  ))}
                </nav>
              </div>
              <button
                type="button"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/15 text-white md:hidden"
                aria-label={navOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={navOpen}
                onClick={() => setNavOpen((v) => !v)}
              >
                <span className="sr-only">Menu</span>
                <div className="flex w-5 flex-col gap-1.5">
                  <span
                    className={`h-0.5 w-full bg-current transition ${navOpen ? 'translate-y-2 rotate-45' : ''}`}
                  />
                  <span className={`h-0.5 w-full bg-current transition ${navOpen ? 'opacity-0' : ''}`} />
                  <span
                    className={`h-0.5 w-full bg-current transition ${navOpen ? '-translate-y-2 -rotate-45' : ''}`}
                  />
                </div>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs">
            {AUTH_BYPASS || authBypass ? (
              <label className="flex items-center gap-2 text-ink-300">
                Client
                <select
                  value={clientId || ''}
                  onChange={(e) => selectClient(e.target.value || null)}
                  className="max-w-[14rem] rounded-md border border-white/10 bg-ink-950 px-2 py-1 text-white"
                  disabled={loadingClients}
                >
                  <option value="">Select…</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <span className="text-ink-400">
              {user?.name || 'User'}
              {client ? (
                <>
                  {' '}
                  · <span className="text-ink-200">{client.name}</span>
                </>
              ) : null}
            </span>
            {authBypass ? (
              <button
                type="button"
                onClick={() => {
                  setBypassRole(ROLES.staff)
                  navigate('/admin')
                }}
                className="font-semibold text-brand-400 hover:text-brand-300"
              >
                Staff →
              </button>
            ) : null}
            {dualRole && !authBypass ? (
              <button
                type="button"
                onClick={() => {
                  setViewMode(VIEW_MODES.staff)
                  navigate(opsAllowed ? '/admin' : '/ops-closed')
                }}
                className="font-semibold text-brand-400 hover:text-brand-300"
              >
                Staff view →
              </button>
            ) : null}
            {!authBypass ? (
              <>
                <Link
                  to="/profile"
                  className="font-semibold text-ink-400 hover:text-ink-200"
                >
                  Profile
                </Link>
                <SignOutButton className="font-semibold text-ink-400 hover:text-ink-200" />
              </>
            ) : null}
            <Link to="/" className="text-ink-400 hover:text-ink-200">
              Public site
            </Link>
            </div>
          </div>
        </div>

        {navOpen ? (
          <>
            <button
              type="button"
              className="fixed inset-0 z-40 bg-ink-950/60 backdrop-blur-sm md:hidden"
              aria-label="Close menu"
              onClick={() => setNavOpen(false)}
            />
            <nav className="relative z-50 border-t border-white/10 bg-ink-900/98 px-4 py-3 md:hidden">
              <div className="flex flex-col gap-1">
                {portalNav.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={() => setNavOpen(false)}
                    className={({ isActive }) =>
                      `rounded-lg px-3 py-2.5 text-sm font-medium ${
                        isActive ? 'bg-brand-500/15 text-brand-300' : 'text-ink-200'
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </nav>
          </>
        ) : null}
      </header>

      <main className="mx-auto min-w-0 max-w-5xl px-4 py-6 sm:px-6">
        {!effectiveClientId ? (
          <div className="rounded-2xl border border-white/10 bg-ink-900/50 p-8 text-center">
            <h1 className="font-display text-xl font-bold text-white">Select your account</h1>
            <p className="mt-2 text-sm text-ink-300">
              {AUTH_BYPASS || authBypass
                ? 'Choose a client in the header to preview the portal (auth bypass).'
                : 'Your account is not linked to a client yet. Please contact iTreq Inc.'}
            </p>
          </div>
        ) : (
          <Outlet context={outletContext} />
        )}
      </main>
    </div>
  )
}

export function PortalLayout() {
  return (
    <OpsAlertProvider>
      <PortalShell />
    </OpsAlertProvider>
  )
}
