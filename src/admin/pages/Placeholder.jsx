import { Link } from 'react-router-dom'

/** Placeholder until the matching phase ships. */
export default function AdminPlaceholder({ title, phase }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/15 bg-ink-900/30 p-8 text-center">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">{phase}</p>
      <h1 className="mt-2 font-display text-2xl font-bold text-white">{title}</h1>
      <p className="mx-auto mt-3 max-w-md text-sm text-ink-300">
        This screen is wired into the admin shell so navigation is ready. Implementation lands in{' '}
        {phase}.
      </p>
      <Link
        to="/admin"
        className="mt-6 inline-block text-sm font-semibold text-brand-400 hover:text-brand-300"
      >
        ← Back to dashboard
      </Link>
    </div>
  )
}
