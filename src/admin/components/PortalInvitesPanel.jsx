import { useCallback, useEffect, useMemo, useState } from 'react'
import { authAction } from '../../lib/authApi'
import { AUTH_BYPASS } from '../../lib/authConfig'
import { canSendPortalInviteEmail, portalInviteConfirmMessage } from '../../lib/portalInvite'
import { DetailsCollapse } from '../../components/DetailsCollapse'
import { AdminIconAction } from '../AdminIconAction'
import { useOpsAlert } from '../OpsAlertContext'
import { adminBtnPrimary, adminBtnSecondary, adminTableShellClass } from '../ui'

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

function toggleId(list, id, checked) {
  if (checked) return list.includes(id) ? list : [...list, id]
  return list.filter((x) => x !== id)
}

function rowInviteable(row) {
  return canSendPortalInviteEmail(row?.email)
}

export function PortalInvitesPanel() {
  const { showError, showSuccess, showWarning, confirm, runWithProgress } = useOpsAlert()
  const [pending, setPending] = useState([])
  const [notified, setNotified] = useState([])
  const [loading, setLoading] = useState(!AUTH_BYPASS)
  const [busyId, setBusyId] = useState(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [selectedPending, setSelectedPending] = useState([])
  const [selectedNotified, setSelectedNotified] = useState([])

  const inviteablePendingIds = useMemo(
    () => pending.filter(rowInviteable).map((r) => r.client_id),
    [pending],
  )
  const inviteableNotifiedIds = useMemo(
    () => notified.filter(rowInviteable).map((r) => r.client_id),
    [notified],
  )

  const allPendingSelected =
    inviteablePendingIds.length > 0 &&
    inviteablePendingIds.every((id) => selectedPending.includes(id))
  const allNotifiedSelected =
    inviteableNotifiedIds.length > 0 &&
    inviteableNotifiedIds.every((id) => selectedNotified.includes(id))

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
    const nextPending = data.pending || []
    const nextNotified = data.notified || []
    setPending(nextPending)
    setNotified(nextNotified)
    const pendingInviteable = new Set(
      nextPending.filter(rowInviteable).map((r) => r.client_id),
    )
    const notifiedInviteable = new Set(
      nextNotified.filter(rowInviteable).map((r) => r.client_id),
    )
    setSelectedPending((prev) => prev.filter((id) => pendingInviteable.has(id)))
    setSelectedNotified((prev) => prev.filter((id) => notifiedInviteable.has(id)))
  }, [showError])

  useEffect(() => {
    load()
  }, [load])

  async function inviteOne(clientId) {
    const { data, error } = await authAction(
      'invite_client',
      { client_id: clientId },
      { withAuth: true },
    )
    if (error || data?.success === false) {
      return { ok: false, message: error?.message || data?.message || 'Invite failed', stub: false }
    }
    return { ok: true, stub: Boolean(data.stub), message: data.message || '' }
  }

  async function invite(clientId) {
    const row =
      pending.find((r) => r.client_id === clientId) ||
      notified.find((r) => r.client_id === clientId)
    if (!row || !rowInviteable(row)) {
      showError(
        'This client uses the office email placeholder and cannot receive a portal invite. Add their real email first.',
      )
      return
    }

    const ok = await confirm({
      title: 'Send portal invite?',
      message: portalInviteConfirmMessage(1),
      confirmLabel: 'Send invite',
    })
    if (!ok) return

    setBusyId(clientId)
    try {
      const result = await inviteOne(clientId)
      if (!result.ok) {
        showError(result.message)
        return
      }
      showSuccess(
        result.stub
          ? 'Invite saved (email stubbed — check Edge Function logs). Temporary password: password123'
          : 'Invite email sent. Temporary password: password123',
      )
      await load()
    } finally {
      setBusyId(null)
    }
  }

  async function inviteBulk(ids, { resend }) {
    const inviteable = ids.filter((id) => {
      const row =
        pending.find((r) => r.client_id === id) || notified.find((r) => r.client_id === id)
      return row ? rowInviteable(row) : false
    })
    if (!inviteable.length || bulkBusy) {
      if (ids.length && !inviteable.length) {
        showWarning('No inviteable clients in the selection.')
      }
      return
    }
    const ok = await confirm({
      title: resend ? 'Resend selected invites?' : 'Invite selected clients?',
      message: portalInviteConfirmMessage(inviteable.length),
      confirmLabel: resend ? 'Resend invites' : 'Send invites',
    })
    if (!ok) return

    setBulkBusy(true)
    let sent = 0
    let stubbed = 0
    const failures = []
    try {
      await runWithProgress({
        title: resend ? 'Resending invites…' : 'Sending invites…',
        items: inviteable,
        getLabel: (clientId) => {
          const row =
            pending.find((r) => r.client_id === clientId) ||
            notified.find((r) => r.client_id === clientId)
          return row?.client_name || row?.email || 'Client'
        },
        fn: async (clientId) => {
          const result = await inviteOne(clientId)
          if (result.ok) {
            sent += 1
            if (result.stub) stubbed += 1
          } else {
            failures.push(result.message)
          }
          return result
        },
      })
    } finally {
      setBulkBusy(false)
    }

    await load()
    if (resend) setSelectedNotified([])
    else setSelectedPending([])

    if (sent > 0 && failures.length === 0) {
      showSuccess(
        stubbed
          ? `${sent} invite${sent === 1 ? '' : 's'} saved (email stubbed). Temporary password: password123`
          : `${sent} invite${sent === 1 ? '' : 's'} sent. Temporary password: password123`,
      )
      return
    }
    if (sent > 0 && failures.length > 0) {
      showWarning(
        `${sent} sent, ${failures.length} failed. ${failures[0] || ''}`.trim(),
      )
      return
    }
    showError(failures[0] || 'Could not send invites.')
  }

  const anyBusy = bulkBusy || busyId != null

  return (
    <DetailsCollapse className="group rounded-2xl border border-white/10 bg-ink-900/30 [&>summary]:list-none [&>summary::-webkit-details-marker]:hidden">
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
            <DetailsCollapse constrainBody={false} className={detailsClass}>
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
              <div className="space-y-2 border-t border-white/10 p-2">
                {selectedPending.length > 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                    <p className="text-xs text-ink-400">
                      {selectedPending.length} selected
                    </p>
                    <button
                      type="button"
                      disabled={anyBusy}
                      onClick={() => inviteBulk(selectedPending, { resend: false })}
                      className={adminBtnPrimary}
                    >
                      {bulkBusy ? 'Sending…' : `Invite selected (${selectedPending.length})`}
                    </button>
                  </div>
                ) : null}
                <div className={`${adminTableShellClass} max-h-[min(50vh,28rem)] overflow-y-auto`}>
                  <table className="w-full min-w-[28rem] text-left text-sm">
                    <thead className="sticky top-0 z-10 border-b border-white/10 bg-ink-950 text-ink-400">
                      <tr>
                        <th className="w-10 px-3 py-2">
                          <input
                            type="checkbox"
                            aria-label="Select all clients to invite"
                            checked={allPendingSelected}
                            disabled={anyBusy || inviteablePendingIds.length === 0}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedPending(inviteablePendingIds)
                              else setSelectedPending([])
                            }}
                          />
                        </th>
                        <th className="px-3 py-2">Client</th>
                        <th className="px-3 py-2">Email</th>
                        <th className="w-12 px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {pending.map((row) => {
                        const inviteable = rowInviteable(row)
                        const checked = selectedPending.includes(row.client_id)
                        return (
                          <tr key={row.client_id} className="border-b border-white/5">
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                aria-label={`Select ${row.client_name}`}
                                checked={checked}
                                disabled={anyBusy || !inviteable}
                                onChange={(e) =>
                                  setSelectedPending((prev) =>
                                    toggleId(prev, row.client_id, e.target.checked),
                                  )
                                }
                              />
                            </td>
                            <td className="px-3 py-2 text-white">{row.client_name}</td>
                            <td className="break-all px-3 py-2 text-ink-300">{row.email}</td>
                            <td className="px-3 py-2 text-right">
                              {inviteable ? (
                                <AdminIconAction
                                  label="Invite"
                                  icon="mail"
                                  disabled={anyBusy}
                                  onClick={() => invite(row.client_id)}
                                />
                              ) : null}
                            </td>
                          </tr>
                        )
                      })}
                      {!pending.length ? (
                        <tr>
                          <td colSpan={4} className="px-3 py-4 text-ink-500">
                            No clients waiting for an invite.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </DetailsCollapse>

            <DetailsCollapse constrainBody={false} className={detailsClass}>
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
              <div className="space-y-2 border-t border-white/10 p-2">
                {selectedNotified.length > 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                    <p className="text-xs text-ink-400">
                      {selectedNotified.length} selected
                    </p>
                    <button
                      type="button"
                      disabled={anyBusy}
                      onClick={() => inviteBulk(selectedNotified, { resend: true })}
                      className={adminBtnSecondary}
                    >
                      {bulkBusy ? 'Sending…' : `Resend selected (${selectedNotified.length})`}
                    </button>
                  </div>
                ) : null}
                <div className={`${adminTableShellClass} max-h-[min(50vh,28rem)] overflow-y-auto`}>
                  <table className="w-full min-w-[28rem] text-left text-sm">
                    <thead className="sticky top-0 z-10 border-b border-white/10 bg-ink-950 text-ink-400">
                      <tr>
                        <th className="w-10 px-3 py-2">
                          <input
                            type="checkbox"
                            aria-label="Select all clients to resend"
                            checked={allNotifiedSelected}
                            disabled={anyBusy || inviteableNotifiedIds.length === 0}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedNotified(inviteableNotifiedIds)
                              else setSelectedNotified([])
                            }}
                          />
                        </th>
                        <th className="px-3 py-2">Client</th>
                        <th className="px-3 py-2">Notified</th>
                        <th className="w-12 px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {notified.map((row) => {
                        const inviteable = rowInviteable(row)
                        const checked = selectedNotified.includes(row.client_id)
                        return (
                          <tr key={row.client_id} className="border-b border-white/5">
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                aria-label={`Select ${row.client_name}`}
                                checked={checked}
                                disabled={anyBusy || !inviteable}
                                onChange={(e) =>
                                  setSelectedNotified((prev) =>
                                    toggleId(prev, row.client_id, e.target.checked),
                                  )
                                }
                              />
                            </td>
                            <td className="px-3 py-2 text-white">{row.client_name}</td>
                            <td className="px-3 py-2 text-ink-300">{formatWhen(row.invited_at)}</td>
                            <td className="px-3 py-2 text-right">
                              {inviteable ? (
                                <AdminIconAction
                                  label="Resend invite"
                                  icon="mail"
                                  tone="muted"
                                  disabled={anyBusy}
                                  onClick={() => invite(row.client_id)}
                                />
                              ) : null}
                            </td>
                          </tr>
                        )
                      })}
                      {!notified.length ? (
                        <tr>
                          <td colSpan={4} className="px-3 py-4 text-ink-500">
                            No pending activations.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </DetailsCollapse>
          </div>
        )}
      </div>
    </DetailsCollapse>
  )
}
