import { useCallback, useEffect, useMemo, useState } from 'react'
import { opsApi } from '../lib/opsApi'
import { useOpsAlert } from '../admin/OpsAlertContext'
import { adminBtnPrimary, adminBtnSecondary, adminFieldClass } from '../admin/ui'

function formatWhen(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10)
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Messages from the other side after this role last opened the thread. */
export function disputeUnreadCount(dispute, role) {
  if (!dispute) return 0
  const lastRead =
    role === 'staff' ? dispute.staff_last_read_at : dispute.client_last_read_at
  return (dispute.messages || []).filter((msg) => {
    if (msg.author_role === role) return false
    if (!lastRead) return true
    return String(msg.created_at) > String(lastRead)
  }).length
}

/**
 * Dispute / query conversation attached to one invoice.
 * Same component for both sides; `authorRole` decides who is speaking.
 * Starts collapsed. Staff only see it once a client (or prior) message exists.
 * Expanding marks the thread read (backend + local badge clear).
 */
export function InvoiceQueryThread({ invoiceId, clientId, authorRole = 'client', onChanged }) {
  const isStaff = authorRole === 'staff'
  const { showError, showSuccess, confirm } = useOpsAlert()
  const [dispute, setDispute] = useState(null)
  const [loading, setLoading] = useState(true)
  const [body, setBody] = useState('')
  const [file, setFile] = useState(null)
  const [sending, setSending] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    if (!invoiceId) return
    setLoading(true)
    const res = isStaff
      ? await opsApi.getInvoiceDispute(invoiceId)
      : await opsApi.getInvoiceDisputeForClient(invoiceId, clientId)
    setLoading(false)
    if (res.error) {
      showError(res.error.message)
      return
    }
    setDispute(res.data)
  }, [invoiceId, clientId, isStaff, showError])

  useEffect(() => {
    load()
  }, [load])

  const messages = dispute?.messages || []
  const isResolved = dispute?.status === 'resolved'
  const messageCount = messages.length
  const unread = useMemo(
    () => disputeUnreadCount(dispute, authorRole),
    [dispute, authorRole],
  )

  async function markReadIfNeeded(current) {
    if (!current?.id) return
    if (disputeUnreadCount(current, authorRole) < 1) return
    const now = new Date().toISOString()
    const cursorKey = isStaff ? 'staff_last_read_at' : 'client_last_read_at'
    // Clear the badge right away; backend persists for the next page load.
    setDispute((d) => (d ? { ...d, [cursorKey]: now } : d))
    const { error } = await opsApi.markDisputeRead(current.id, authorRole)
    if (error) showError(error.message)
  }

  async function handleToggle() {
    const next = !open
    setOpen(next)
    if (next) await markReadIfNeeded(dispute)
  }

  async function openAttachment(path) {
    const { data, error } = await opsApi.getProofSignedUrl(path)
    if (error) {
      showError(error.message)
      return
    }
    window.open(data, '_blank', 'noopener')
  }

  async function handleSend(e) {
    e.preventDefault()
    if (sending) return
    if (!String(body).trim()) {
      showError('Type a message before sending.')
      return
    }

    setSending(true)
    let attachmentPath = null
    if (file) {
      const upload = await opsApi.uploadClientProof(file, { clientId })
      if (upload.error) {
        setSending(false)
        showError(upload.error.message)
        return
      }
      attachmentPath = upload.data.path
    }

    const { data, error } = await opsApi.postDisputeMessage({
      invoice_id: invoiceId,
      client_id: clientId,
      author_role: authorRole,
      body,
      attachment_path: attachmentPath,
    })
    setSending(false)
    if (error) {
      showError(error.message)
      return
    }

    setBody('')
    setFile(null)
    setDispute(data)
    setOpen(true)
    onChanged?.()
    showSuccess(
      isStaff ? 'Reply sent to the client.' : 'Sent. Our team will come back to you.',
      'Message sent',
    )
  }

  async function handleResolve() {
    if (!dispute?.id) return
    const ok = await confirm({
      title: 'Mark this query resolved?',
      message: 'The client will see it as resolved. They can still reply and reopen it.',
      confirmLabel: 'Mark resolved',
    })
    if (!ok) return

    setResolving(true)
    const { error } = await opsApi.setDisputeStatus(dispute.id, 'resolved')
    setResolving(false)
    if (error) {
      showError(error.message)
      return
    }
    await load()
    onChanged?.()
    showSuccess('Query marked as resolved.', 'Resolved')
  }

  // Staff only see the section once there is something to read.
  if (isStaff && !loading && messageCount === 0) return null
  if (isStaff && loading) return null

  return (
    <section className="rounded-2xl border border-white/10 bg-ink-900/40">
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        className={`flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left transition hover:bg-white/[0.03] ${
          open ? 'border-b border-white/10' : ''
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-white">Questions about this invoice</h2>
            {!loading && unread > 0 ? (
              <span className="inline-flex rounded-md bg-amber-500/25 px-2 py-0.5 text-xs font-semibold text-amber-100">
                {unread === 1 ? '1 new' : `${unread} new`}
              </span>
            ) : !loading && messageCount > 0 ? (
              <span className="inline-flex rounded-md bg-white/10 px-2 py-0.5 text-xs font-semibold text-ink-300">
                {messageCount}
              </span>
            ) : null}
            {isResolved ? (
              <span className="inline-flex rounded-md bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-200">
                Resolved
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-ink-400">
            {isStaff
              ? open
                ? 'Client queries and your replies. Replies are not instant messages.'
                : unread > 0
                  ? 'New reply from the client — tap to open.'
                  : 'Tap to open this query thread.'
              : open
                ? 'Something looks wrong? Tell us here and attach a photo if it helps. We reply within one working day.'
                : unread > 0
                  ? 'You have a new reply — tap to open.'
                  : 'Have a question or need to query a charge? Tap to open.'}
          </p>
        </div>
        <span
          className={`shrink-0 text-ink-400 transition ${open ? 'rotate-180' : ''}`}
          aria-hidden
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </span>
      </button>

      {open ? (
        <>
          {isStaff && dispute && !isResolved ? (
            <div className="flex justify-end border-b border-white/10 px-4 py-2">
              <button
                type="button"
                onClick={handleResolve}
                disabled={resolving}
                className={adminBtnSecondary}
              >
                {resolving ? 'Saving…' : 'Mark resolved'}
              </button>
            </div>
          ) : null}

          {loading ? (
            <p className="px-4 py-6 text-sm text-ink-400">Loading…</p>
          ) : messages.length === 0 ? (
            <p className="px-4 py-6 text-sm text-ink-400">No questions raised yet.</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {messages.map((msg) => {
                const author =
                  msg.author_role === authorRole
                    ? 'You'
                    : msg.author_role === 'staff'
                      ? 'iTreq Inc'
                      : dispute?.clients?.name || 'Client'
                return (
                  <li key={msg.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-xs font-semibold text-ink-200">{author}</p>
                      <p className="text-xs text-ink-500">{formatWhen(msg.created_at)}</p>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink-200">
                      {msg.body}
                    </p>
                    {msg.attachment_path ? (
                      <button
                        type="button"
                        onClick={() => openAttachment(msg.attachment_path)}
                        className="mt-2 text-xs font-semibold text-brand-400 hover:text-brand-300"
                      >
                        View attachment
                      </button>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}

          <form onSubmit={handleSend} className="space-y-3 border-t border-white/10 px-4 py-4">
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                {isStaff ? 'Reply to the client' : 'Your message'}
              </span>
              <textarea
                rows={3}
                className={adminFieldClass}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={
                  isStaff
                    ? 'Explain what you found or what happens next…'
                    : 'For example: this charge is for a vehicle we returned in June.'
                }
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
                Attach a file (optional)
              </span>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="w-full rounded-xl border border-white/10 bg-ink-950/80 px-3 py-2 text-sm text-ink-200 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-white/15"
              />
            </label>

            <button type="submit" disabled={sending} className={adminBtnPrimary}>
              {sending ? 'Sending…' : isResolved ? 'Reopen with a reply' : 'Send message'}
            </button>
          </form>
        </>
      ) : null}
    </section>
  )
}
