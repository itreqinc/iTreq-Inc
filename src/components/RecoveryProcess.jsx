import { RECOVERY_PROCESS } from '../data/recoveries'

export function RecoveryProcess() {
  return (
    <section className="section-pad border-t border-white/5 bg-ink-900/40">
      <div className="container-site">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-azure-400">
            How recovery works
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold text-white sm:text-4xl">
            Tracked, coordinated and recovered with law enforcement
          </h2>
          <p className="mt-4 text-ink-300">
            When a fitted asset goes missing, iTreq Inc supports the recovery process with live
            tracking — working alongside clients and law enforcement officers on the ground.
          </p>
        </div>

        <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {RECOVERY_PROCESS.map((step) => (
            <li
              key={step.step}
              className="relative rounded-2xl border border-white/10 bg-ink-950/60 p-5"
            >
              <span className="font-display text-3xl font-bold text-brand-500/40">
                {String(step.step).padStart(2, '0')}
              </span>
              <h3 className="mt-3 font-display text-lg font-semibold text-white">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-300">{step.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
