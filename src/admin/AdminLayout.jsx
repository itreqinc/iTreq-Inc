import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { ROLES, VIEW_MODES, isAdmin } from '../lib/authConfig'
import { Logo } from '../components/Logo'
import { OpsAlertProvider } from './OpsAlertContext'

const navItems = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/clients', label: 'Clients' },
  { to: '/admin/staff', label: 'Staff', adminOnly: true },
  { to: '/admin/stock', label: 'Stock', adminOnly: true },
  { to: '/admin/products', label: 'Products' },
  { to: '/admin/tracking-catalog', label: 'Tracking catalog', adminOnly: true },
  { to: '/admin/quotations', label: 'Quotations' },
  { to: '/admin/invoices', label: 'Invoices' },
  { to: '/admin/monthly-fees', label: 'Monthly fees' },
  { to: '/admin/payments', label: 'Payments' },
  { to: '/admin/expenses', label: 'Expenses' },
  { to: '/admin/my-pay', label: 'My pay' },
  { to: '/admin/reports', label: 'Reports' },
  { to: '/admin/settings', label: 'Settings', adminOnly: true },
]

export function AdminLayout() {
  const navigate = useNavigate()
  const {
    user,
    authBypass,
    setBypassRole,
    logout,
    dualRole,
    setViewMode,
  } = useAuth()

  const nav = navItems.filter((item) => !item.adminOnly || isAdmin(user?.role))

  return (
    <OpsAlertProvider>
    <div className="min-h-screen overflow-x-clip bg-ink-950 text-ink-100">
      <header className="border-b border-white/10 bg-ink-900/80">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-4">
            <Link to="/admin" className="flex items-center gap-2">
              <Logo className="h-9" />
              <span className="font-display text-sm font-semibold text-white">Ops</span>
            </Link>
            <Link to="/" className="text-xs text-ink-400 hover:text-ink-200">
              ← Public site
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            {authBypass ? (
              <>
                <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-amber-200">
                  Auth bypass ON
                </span>
                <label className="flex items-center gap-2 text-ink-300">
                  Role
                  <select
                    value={user?.role || ROLES.staff}
                    onChange={(e) => setBypassRole(e.target.value)}
                    className="rounded-md border border-white/10 bg-ink-950 px-2 py-1 text-white"
                  >
                    <option value={ROLES.admin}>admin</option>
                    <option value={ROLES.staff}>staff</option>
                    <option value={ROLES.client}>client</option>
                  </select>
                </label>
              </>
            ) : (
              <>
                {dualRole ? (
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode(VIEW_MODES.client)
                      navigate('/portal')
                    }}
                    className="rounded-md border border-brand-500/40 bg-brand-500/10 px-2 py-1 font-semibold text-brand-200"
                  >
                    Client view
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={async () => {
                    await logout()
                    navigate('/login', { replace: true })
                  }}
                  className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 font-semibold text-amber-100"
                >
                  Switch user
                </button>
                <Link
                  to="/profile"
                  className="font-semibold text-ink-400 hover:text-ink-200"
                >
                  Profile
                </Link>
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
              </>
            )}
            <span className="text-ink-400">
              {user?.name || 'User'} · <span className="text-ink-200">{user?.role}</span>
            </span>
          </div>
        </div>
      </header>

      {dualRole ? (
        <div className="border-b border-amber-500/20 bg-amber-500/5 px-4 py-2 text-center text-xs text-amber-100 sm:px-6">
          Staff view: you cannot review, edit, or delete quotes, invoices, or payments for your own
          client account.
        </div>
      ) : null}

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[220px_1fr] lg:gap-0">
        <nav className="space-y-1 lg:sticky lg:top-6 lg:self-start lg:border-r lg:border-white/10 lg:pr-6">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
                  isActive
                    ? 'bg-brand-500/15 text-brand-300'
                    : 'text-ink-300 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <main className="min-w-0 lg:pl-6">
          <Outlet />
        </main>
      </div>
    </div>
    </OpsAlertProvider>
  )
}
