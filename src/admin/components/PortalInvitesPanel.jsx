import { useCallback, useEffect, useState } from 'react'
import { authAction } from '../../lib/authApi'
import { AUTH_BYPASS } from '../../lib/authConfig'
import { AdminIconAction } from '../AdminIconAction'
import { useOpsAlert } from '../OpsAlertContext'
import { adminTableShellClass } from '../ui'

function formatWhen(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return String(iso)
  }
}

function DetailsChevron({ className = '' }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      className={`h-5 w-5 shrink-0 text-ink-400 transition-transform duration-200 group-open:rotate-180 ${className}`}
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
        clipRule="evenodd"
      />
    </svg>
  )
}

const detailsClass =
  'group rounded-xl border border-white/10 bg-ink-950/20 [&>summary]:cursor-pointer [&>summary]:list-none [&>summary::-webkit-details-marker]:hidden'
const summaryClass =
  'flex items-start justify-between gap-3 px-3 py-2.5 hover:bg-white/[0.03]'

export function PortalInvitesPanel() {
  const { showError, showSuccess } = useOpsAlert()
  const [pending, setPending] = useState([])
  const [notified, setNotified] = useState([])
  const [loading, setLoading] = useState(!AUTH_BYPASS)
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    if (AUTH_BYPASS) {
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error } = await authAction('list_portal_invites', {}, { withAuth: true })
    setLoading(false)
    if (error || data?.success === false) {
      showError(error?.message || data?.message || 'Could not load portal invites')
      return
    }
    setPending(data.pending || [])
    setNotified(data.notified || [])
  }, [showError])

  useEffect(() => {
    load()
  }, [load])

  async function invite(clientId) {
    setBusyId(clientId)
    try {
      const { data, error } = await authAction(
        'invite_client',
        { client_id: clientId },
        { withAuth: true },
      )
      if (error || data?.success === false) {
        showError(error?.message || data?.message || 'Invite failed')
        return
      }
      showSuccess(
        data.stub
          ? 'Invite saved (email stubbed — check Edge Function logs). Temporary password: password123'
          : 'Invite email sent. Temporary password: password123',
      )
      await load()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <details
      className="group mt-10 rounded-2xl border border-white/10 bg-ink-900/30 [&>summary]:list-none [&>summary::-webkit-details-marker]:hidden"
    >
      <summary className="flex cursor-pointer items-start justify-between gap-3 px-4 py-3 sm:px-5">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-semibold text-white">Portal invites</h2>
          <p className="mt-1 text-sm text-ink-400">
            Send portal login details and track who still needs to sign in.
          </p>
        </div>
        <DetailsChevron className="mt-1" />
      </summary>

      <div className="space-y-4 border-t border-white/10 px-4 pb-4 pt-3 sm:px-5">
        {AUTH_BYPASS ? (
          <p className="text-sm text-ink-400">
            Portal invites need a real session. Set{' '}
            <code className="text-ink-300">VITE_AUTH_BYPASS=false</code> and sign in to list or send
            invites.
          </p>
        ) : loading ? (
          <p className="text-sm text-ink-400">Loading invite status…</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <details className={detailsClass}>
              <summary className={summaryClass}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink-200">
                    Yet to notify
                    <span className="ml-2 text-xs font-normal tabular-nums text-ink-400">
                      ({pending.length})
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-ink-400">
                    Clients who have not been sent portal login details yet.
                  </p>
                </div>
                <DetailsChevron className="mt-0.5" />
              </summary>
              <div className="border-t border-white/10 p-2">
                <div className={adminTableShellClass}>
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-white/10 text-ink-400">
                      <tr>
                        <th className="px-3 py-2">Client</th>
                        <th className="px-3 py-2">Email</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {pending.map((row) => (
                        <tr key={row.client_id} className="border-b border-white/5">
                          <td className="px-3 py-2 text-white">{row.client_name}</td>
                          <td className="px-3 py-2 text-ink-300">{row.email}</td>
                          <td className="px-3 py-2 text-right">
                            <AdminIconAction
                              label="Invite"
                              icon="mail"
                              disabled={busyId === row.client_id}
                              onClick={() => invite(row.client_id)}
                            />
                          </td>
                        </tr>
                      ))}
                      {!pending.length ? (
                        <tr>
                          <td colSpan={3} className="px-3 py-4 text-ink-500">
                            No clients waiting for an invite.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </details>

            <details className={detailsClass}>
              <summary className={summaryClass}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink-200">
                    Notified (awaiting first login)
                    <span className="ml-2 text-xs font-normal tabular-nums text-ink-400">
                      ({notified.length})
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-ink-400">
                    Invited by email but have not signed in to the portal yet.
                  </p>
                </div>
                <DetailsChevron className="mt-0.5" />
              </summary>
              <div className="border-t border-white/10 p-2">
                <div className={adminTableShellClass}>
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-white/10 text-ink-400">
                      <tr>
                        <th className="px-3 py-2">Client</th>
                        <th className="px-3 py-2">Notified</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {notified.map((row) => (
                        <tr key={row.client_id} className="border-b border-white/5">
                          <td className="px-3 py-2 text-white">{row.client_name}</td>
                          <td className="px-3 py-2 text-ink-300">{formatWhen(row.invited_at)}</td>
                          <td className="px-3 py-2 text-right">
                            <AdminIconAction
                              label="Resend invite"
                              icon="mail"
                              tone="muted"
                              disabled={busyId === row.client_id}
                              onClick={() => invite(row.client_id)}
                            />
                          </td>
                        </tr>
                      ))}
                      {!notified.length ? (
                        <tr>
                          <td colSpan={3} className="px-3 py-4 text-ink-500">
                            No pending activations.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </details>
          </div>
        )}
      </div>
    </details>
  )
}
