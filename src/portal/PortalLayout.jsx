import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { useAuth } from '../contexts/AuthContext'
import { AUTH_BYPASS, ROLES } from '../lib/authConfig'
import { getPortalClientId, setPortalClientId } from '../lib/portalClient'
import { opsApi } from '../lib/opsApi'
import { OpsAlertProvider, useOpsAlert } from '../admin/OpsAlertContext'

function PortalShell() {
  const navigate = useNavigate()
  const { user, authBypass, setBypassRole, logout } = useAuth()
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

  return (
    <div className="min-h-screen overflow-x-clip bg-ink-950 text-ink-100">
      <header className="border-b border-white/10 bg-ink-900/80">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-4">
            <Link to="/portal" className="flex items-center gap-2">
              <Logo className="h-9" />
              <span className="font-display text-sm font-semibold text-white">Client portal</span>
            </Link>
            <nav className="flex flex-wrap gap-1">
              <NavLink to="/portal" end className={navClass}>
                Overview
              </NavLink>
              <NavLink to="/portal/quotes" className={navClass}>
                Quotes
              </NavLink>
              <NavLink to="/portal/invoices" className={navClass}>
                Invoices
              </NavLink>
              <NavLink to="/portal/payments" className={navClass}>
                Payments
              </NavLink>
              <NavLink to="/portal/statement" className={navClass}>
                Statement
              </NavLink>
            </nav>
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
            ) : (
              <button
                type="button"
                onClick={async () => {
                  await logout()
                  navigate('/login', { replace: true })
                }}
                className="font-semibold text-ink-400 hover:text-ink-200"
              >
                Sign out
              </button>
            )}
            <Link to="/" className="text-ink-400 hover:text-ink-200">
              Public site
            </Link>
          </div>
        </div>
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
