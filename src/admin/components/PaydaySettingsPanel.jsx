import { useCallback, useEffect, useState } from 'react'
import { payrollApi } from '../../lib/payrollApi'
import { paydayLabel, nextPayrollDate, autoPaydayForMonth, ymdInTz } from '../../lib/payrollPayday'
import { useAuth } from '../../contexts/AuthContext'
import { isAdmin } from '../../lib/authConfig'
import { useOpsAlert } from '../OpsAlertContext'
import { adminBtnPrimary, adminBtnSecondary, adminFieldClass } from '../ui'
import { opsApi } from '../../lib/opsApi'
import { YearMonthDaySelect } from '../../components/YearMonthDaySelect'

export function PaydaySettingsPanel({ embedded = false }) {
  const { user } = useAuth()
  const { showError, showSuccess, confirm } = useOpsAlert()
  const [mode, setMode] = useState('auto_last_tue_thu')
  const [overrideDate, setOverrideDate] = useState('')
  const [overrideDom, setOverrideDom] = useState('25')
  const [next, setNext] = useState('')
  const [autoThisMonth, setAutoThisMonth] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!isAdmin(user?.role)) return
    const settingsRes = await opsApi.getSettings()
    if (settingsRes.error) {
      showError(settingsRes.error.message)
      return
    }
    const s = settingsRes.data || {}
    setMode(s.payroll_payday_mode || 'auto_last_tue_thu')
    setOverrideDate(s.payroll_payday_override_date || '')
    setOverrideDom(String(s.payroll_payday_override_dom || 25))
    const today = ymdInTz()
    setNext(nextPayrollDate(s, today))
    setAutoThisMonth(
      autoPaydayForMonth(Number(today.slice(0, 4)), Number(today.slice(5, 7))),
    )
  }, [showError, user?.role])

  useEffect(() => {
    load()
  }, [load])

  if (!isAdmin(user?.role)) return null

  async function save(e) {
    e.preventDefault()
    const ok = await confirm({
      title: 'Save payday settings?',
      message:
        mode === 'override_date'
          ? `Override payday to ${overrideDate || 'the chosen date'}?`
          : mode === 'override_day_of_month'
            ? `Override payday to day ${overrideDom} of each month?`
            : 'Use the auto last-Tuesday/Thursday payday rule?',
      confirmLabel: 'Save payday',
    })
    if (!ok) return
    setSaving(true)
    const { data, error } = await payrollApi.updatePaydaySettings({
      payroll_payday_mode: mode,
      payroll_payday_override_date: mode === 'override_date' ? overrideDate : null,
      payroll_payday_override_dom:
        mode === 'override_day_of_month' ? Number(overrideDom) : null,
    })
    setSaving(false)
    if (error || data?.success === false) {
      showError(error?.message || data?.message || 'Could not save payday settings')
      return
    }
    showSuccess('Payday settings updated.')
    setNext(data.next_payday || '')
    await load()
  }

  async function resetAuto() {
    const ok = await confirm({
      title: 'Reset payday to auto?',
      message: 'Clear any override and use the later of the month’s last Tuesday and last Thursday.',
      confirmLabel: 'Reset to auto',
    })
    if (!ok) return
    setMode('auto_last_tue_thu')
    setSaving(true)
    const { data, error } = await payrollApi.updatePaydaySettings({
      payroll_payday_mode: 'auto_last_tue_thu',
    })
    setSaving(false)
    if (error || data?.success === false) {
      showError(error?.message || data?.message || 'Could not reset payday')
      return
    }
    showSuccess('Restored auto Tuesday/Thursday rule.')
    setNext(data.next_payday || '')
    await load()
  }

  const body = (
    <>
      <p className="text-sm text-ink-200">
        Auto this month: <span className="text-white">{autoThisMonth || '—'}</span>
      </p>
      <p className="text-sm text-ink-200">
        Next payday: <span className="text-white">{next || '—'}</span>
        <span className="ml-2 text-xs text-ink-500">({paydayLabel({ payroll_payday_mode: mode })})</span>
      </p>

      <form onSubmit={save} className="mt-3 space-y-3">
        <label className="block text-sm text-ink-300">
          Mode
          <select
            className={`${adminFieldClass} mt-1`}
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="auto_last_tue_thu">Auto (last Tue/Thu, whichever later)</option>
            <option value="override_date">Override specific date</option>
            <option value="override_day_of_month">Override day of month</option>
          </select>
        </label>

        {mode === 'override_date' ? (
          <div className="text-sm text-ink-300">
            Override date
            <div className="mt-1">
              <YearMonthDaySelect value={overrideDate} onChange={setOverrideDate} />
            </div>
          </div>
        ) : null}

        {mode === 'override_day_of_month' ? (
          <label className="block text-sm text-ink-300">
            Day of month (1–31)
            <input
              type="number"
              min="1"
              max="31"
              className={`${adminFieldClass} mt-1`}
              value={overrideDom}
              onChange={(e) => setOverrideDom(e.target.value)}
            />
          </label>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={saving} className={adminBtnPrimary}>
            {saving ? 'Saving…' : 'Save payday'}
          </button>
          <button type="button" disabled={saving} className={adminBtnSecondary} onClick={resetAuto}>
            Reset to auto
          </button>
        </div>
      </form>
    </>
  )

  if (embedded) return body

  return (
    <section className="w-full max-w-xl rounded-2xl border border-white/10 bg-ink-900/90 p-4 sm:p-5">
      <h2 className="font-display text-lg font-semibold text-white">Payroll payday</h2>
      <p className="mt-1 text-sm text-ink-400">
        Default: later of the month’s last Tuesday and last Thursday. An admin override replaces
        that rule until reset.
      </p>
      <div className="mt-3">{body}</div>
    </section>
  )
}
