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

function CollapsibleInviteList({
  title,
  count,
  open,
  onToggle,
  children,
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-ink-950/20">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm font-semibold text-ink-200 hover:bg-white/[0.03]"
      >
        <span>
          {title}
          <span className="ml-2 text-xs font-normal tabular-nums text-ink-400">({count})</span>
        </span>
        <span className="text-xs text-ink-400">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open ? <div className="border-t border-white/10 p-2">{children}</div> : null}
    </div>
  )
}

export function PortalInvitesPanel() {
  const { showError, showSuccess } = useOpsAlert()
  const [pending, setPending] = useState([])
  const [notified, setNotified] = useState([])
  const [loading, setLoading] = useState(!AUTH_BYPASS)
  const [busyId, setBusyId] = useState(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [pendingOpen, setPendingOpen] = useState(false)
  const [notifiedOpen, setNotifiedOpen] = useState(false)

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
    <section className="mt-10 rounded-2xl border border-white/10 bg-ink-900/30">
      <button
        type="button"
        onClick={() => setPanelOpen((o) => !o)}
        aria-expanded={panelOpen}
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left sm:px-5"
      >
        <div>
          <h2 className="font-display text-lg font-semibold text-white">Portal invites</h2>
          <p className="mt-1 text-sm text-ink-400">
            Notify clients of portal credentials. After their first successful login they leave this
            list.
          </p>
        </div>
        <span className="shrink-0 pt-1 text-xs font-semibold text-ink-400">
          {panelOpen ? 'Hide' : 'Show'}
        </span>
      </button>

      {panelOpen ? (
        <div className="space-y-4 border-t border-white/10 px-4 pb-4 pt-3 sm:px-5">
          {AUTH_BYPASS ? (
            <p className="text-sm text-ink-400">
              Portal invites need a real session. Set{' '}
              <code className="text-ink-300">VITE_AUTH_BYPASS=false</code> and sign in to list or
              send invites.
            </p>
          ) : loading ? (
            <p className="text-sm text-ink-400">Loading invite status…</p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <CollapsibleInviteList
                title="Yet to notify"
                count={pending.length}
                open={pendingOpen}
                onToggle={() => setPendingOpen((o) => !o)}
              >
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
              </CollapsibleInviteList>

              <CollapsibleInviteList
                title="Notified (awaiting first login)"
                count={notified.length}
                open={notifiedOpen}
                onToggle={() => setNotifiedOpen((o) => !o)}
              >
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
              </CollapsibleInviteList>
            </div>
          )}
        </div>
      ) : null}
    </section>
  )
}
