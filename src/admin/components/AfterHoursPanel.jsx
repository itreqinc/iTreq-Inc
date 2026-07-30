import { useCallback, useEffect, useState } from 'react'
import { authAction } from '../../lib/authApi'
import { useAuth } from '../../contexts/AuthContext'
import { AUTH_BYPASS, isAdmin, isAfterHoursActive } from '../../lib/authConfig'
import { AdminIconAction } from '../AdminIconAction'
import { useOpsAlert } from '../OpsAlertContext'
import { adminFieldClass, adminTableShellClass } from '../ui'

export function AfterHoursPanel({ embedded = false }) {
  const { user } = useAuth()
  const { showError, showSuccess, confirm } = useOpsAlert()
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(!AUTH_BYPASS)
  const [busyId, setBusyId] = useState(null)
  const [untilById, setUntilById] = useState({})

  const load = useCallback(async () => {
    if (!isAdmin(user?.role) || AUTH_BYPASS) {
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error } = await authAction('list_staff', {}, { withAuth: true })
    setLoading(false)
    if (error || data?.success === false) {
      showError(error?.message || data?.message || 'Could not load staff')
      return
    }
    const list = data.staff || []
    setStaff(list)
    const map = {}
    for (const s of list) {
      if (isAfterHoursActive(s.after_hours_until)) {
        const d = new Date(s.after_hours_until)
        const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        map[s.id] = local.toISOString().slice(0, 16)
      } else {
        map[s.id] = ''
      }
    }
    setUntilById(map)
  }, [showError, user?.role])

  useEffect(() => {
    load()
  }, [load])

  if (!isAdmin(user?.role)) return null

  async function save(staffId, clear = false) {
    const person = staff.find((s) => s.id === staffId)
    if (clear) {
      if (!isAfterHoursActive(person?.after_hours_until)) {
        showError('This staff member has no after-hours access to clear.')
        return
      }
      const ok = await confirm({
        title: 'Clear after-hours access?',
        message: `${person?.name || 'This staff member'} will only be able to open ops during normal hours (Mon–Fri 07:00–18:00).`,
        confirmLabel: 'Clear access',
      })
      if (!ok) return
    } else {
      const value = untilById[staffId] || ''
      if (!value) {
        showError('Choose when after-hours access should end.')
        return
      }
      const ok = await confirm({
        title: 'Grant after-hours access?',
        message: `${person?.name || 'This staff member'} will be able to open ops until ${new Date(value).toLocaleString()}.`,
        confirmLabel: 'Grant access',
      })
      if (!ok) return
    }
    setBusyId(staffId)
    try {
      const value = clear ? null : untilById[staffId] || null
      const { data, error } = await authAction(
        'set_after_hours',
        {
          user_id: staffId,
          after_hours_until: value ? new Date(value).toISOString() : null,
        },
        { withAuth: true },
      )
      if (error || data?.success === false) {
        showError(error?.message || data?.message || 'Could not update after-hours access')
        return
      }
      showSuccess(clear ? 'After-hours access cleared.' : 'After-hours access updated.')
      await load()
    } finally {
      setBusyId(null)
    }
  }

  const body = (
    <>
      {AUTH_BYPASS ? (
        <p className="text-sm text-ink-400">
          After-hours controls need a real admin session. Set{' '}
          <code className="text-ink-300">VITE_AUTH_BYPASS=false</code> and sign in.
        </p>
      ) : loading ? (
        <p className="text-sm text-ink-400">Loading staff…</p>
      ) : (
        <div className={adminTableShellClass}>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 text-ink-400">
              <tr>
                <th className="px-3 py-2">Staff</th>
                <th className="px-3 py-2">Until</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id} className="border-b border-white/5">
                  <td className="px-3 py-2 text-white">
                    {s.name}
                    <div className="text-xs text-ink-500">{s.email}</div>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="datetime-local"
                      value={untilById[s.id] || ''}
                      onChange={(e) =>
                        setUntilById((m) => ({ ...m, [s.id]: e.target.value }))
                      }
                      className={adminFieldClass}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex items-center gap-0.5">
                      <AdminIconAction
                        label="Save access window"
                        icon="check"
                        disabled={busyId === s.id}
                        onClick={() => save(s.id, false)}
                      />
                      <AdminIconAction
                        label="Clear access"
                        icon="x"
                        tone="muted"
                        disabled={busyId === s.id || !isAfterHoursActive(s.after_hours_until)}
                        onClick={() => save(s.id, true)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {!staff.length ? (
                <tr>
                  <td colSpan={3} className="px-3 py-4 text-ink-500">
                    No staff users found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </>
  )

  if (embedded) return body

  return (
    <section className="w-full max-w-xl rounded-2xl border border-white/10 bg-ink-900/40 p-4 sm:p-5">
      <h2 className="font-display text-lg font-semibold text-white">Staff after-hours access</h2>
      <p className="mt-1 text-sm text-ink-400">
        Staff ops is Mon–Fri 07:00–18:00 (Africa/Gaborone). Grant temporary access beyond that window.
      </p>
      <div className="mt-4">{body}</div>
    </section>
  )
}
