import { useCallback, useEffect, useState } from 'react'
import { authAction } from '../../lib/authApi'
import { useAuth } from '../../contexts/AuthContext'
import { isAdmin } from '../../lib/authConfig'
import { useOpsAlert } from '../OpsAlertContext'
import { adminBtnPrimary, adminBtnSecondary, adminFieldClass, adminTableShellClass } from '../ui'

export function AfterHoursPanel() {
  const { user } = useAuth()
  const { showError, showSuccess } = useOpsAlert()
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [untilById, setUntilById] = useState({})

  const load = useCallback(async () => {
    if (!isAdmin(user?.role)) {
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
      if (s.after_hours_until) {
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

  return (
    <section className="max-w-3xl rounded-2xl border border-white/10 bg-ink-900/40 p-4 sm:p-5">
      <h2 className="font-display text-lg font-semibold text-white">Staff after-hours access</h2>
      <p className="mt-1 text-sm text-ink-400">
        Staff ops is Mon–Fri 07:00–18:00 (Africa/Gaborone). Grant temporary access beyond that window.
      </p>

      {loading ? (
        <p className="mt-3 text-sm text-ink-400">Loading staff…</p>
      ) : (
        <div className={`${adminTableShellClass} mt-4`}>
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
                  <td className="space-x-2 px-3 py-2 text-right">
                    <button
                      type="button"
                      disabled={busyId === s.id}
                      onClick={() => save(s.id, false)}
                      className={adminBtnPrimary}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      disabled={busyId === s.id}
                      onClick={() => save(s.id, true)}
                      className={adminBtnSecondary}
                    >
                      Clear
                    </button>
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
    </section>
  )
}
