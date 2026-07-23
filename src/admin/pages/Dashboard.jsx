import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { opsApi } from '../../lib/opsApi'

const upcoming = [
  { title: 'Clients', href: '/admin/clients', phase: 'Phase 1' },
  { title: 'Products & stock', href: '/admin/stock', phase: 'Phase 1' },
  { title: 'Quotations → invoices', href: '/admin/quotations', phase: 'Phase 2' },
  { title: 'Payments & statements', href: '/admin/payments', phase: 'Phase 3' },
  { title: 'Monthly fees', href: '/admin/monthly-fees', phase: 'Phase 4' },
  { title: 'Client portal', href: '/portal', phase: 'Phase 5' },
]

export default function AdminDashboard() {
  const [status, setStatus] = useState(null)

  useEffect(() => {
    let cancelled = false
    opsApi.getStatus().then(({ data }) => {
      if (!cancelled) setStatus(data)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">Ops</p>
        <h1 className="mt-1 font-display text-3xl font-bold text-white">Dashboard</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-300">
          Staff workspace scaffold is ready. Domain features will land phase by phase; login
          (iRegistry-style OTP) comes last.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-ink-900/50 p-4">
          <p className="text-xs uppercase tracking-wider text-ink-400">Auth bypass</p>
          <p className="mt-2 text-lg font-semibold text-white">
            {status?.authBypass ? 'Enabled' : 'Disabled'}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-ink-900/50 p-4">
          <p className="text-xs uppercase tracking-wider text-ink-400">Supabase</p>
          <p className="mt-2 text-lg font-semibold text-white">
            {status?.supabaseConfigured ? 'Configured' : 'Missing env'}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-ink-900/50 p-4">
          <p className="text-xs uppercase tracking-wider text-ink-400">Build phase</p>
          <p className="mt-2 text-lg font-semibold text-white">Phase 5</p>
        </div>
      </div>

      <section>
        <h2 className="font-display text-xl font-semibold text-white">Coming up</h2>
        <ul className="mt-4 divide-y divide-white/10 rounded-2xl border border-white/10 bg-ink-900/40">
          {upcoming.map((item) => (
            <li key={item.title} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-white">{item.title}</p>
                <p className="text-xs text-ink-400">{item.phase}</p>
              </div>
              <Link to={item.href} className="text-xs font-semibold text-brand-400 hover:text-brand-300">
                Open →
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
