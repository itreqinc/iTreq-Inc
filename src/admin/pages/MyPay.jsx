import { useCallback, useEffect, useState } from 'react'
import { payrollApi } from '../../lib/payrollApi'
import { openPayslipPrintWindow } from '../../lib/payslipDocument'
import { paydayLabel } from '../../lib/payrollPayday'
import { useOpsAlert } from '../OpsAlertContext'
import { adminBtnSecondary, adminTableShellClass, formatPula } from '../ui'

export default function MyPayPage() {
  const { showError } = useOpsAlert()
  const [nextPayday, setNextPayday] = useState('')
  const [modeLabel, setModeLabel] = useState('')
  const [slips, setSlips] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [n, p] = await Promise.all([payrollApi.nextPayday(), payrollApi.listPayslips()])
    setLoading(false)
    if (n.error || n.data?.success === false) {
      showError(n.error?.message || n.data?.message || 'Could not load next payday')
    } else {
      setNextPayday(n.data.next_payday || '')
      setModeLabel(
        paydayLabel({
          payroll_payday_mode: n.data.mode,
        }),
      )
    }
    if (p.error || p.data?.success === false) {
      showError(p.error?.message || p.data?.message || 'Could not load payslips')
    } else {
      setSlips(p.data.payslips || [])
    }
  }, [showError])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">My pay</h1>
        <p className="mt-1 text-sm text-ink-300">
          Your salary advice slips and upcoming payday.
        </p>
      </div>

      <div className="rounded-2xl border border-brand-500/30 bg-brand-500/10 px-4 py-4">
        <p className="text-xs uppercase tracking-wide text-brand-200/80">Next payday</p>
        <p className="mt-1 font-display text-2xl font-bold text-white">
          {loading ? '…' : nextPayday || 'Not set'}
        </p>
        {modeLabel ? <p className="mt-1 text-xs text-ink-400">{modeLabel}</p> : null}
      </div>

      <div className={adminTableShellClass}>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/10 text-ink-400">
            <tr>
              <th className="px-3 py-2">Period</th>
              <th className="px-3 py-2">Gross</th>
              <th className="px-3 py-2">Advances</th>
              <th className="px-3 py-2">Net</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {slips.map((s) => (
              <tr key={s.id} className="border-b border-white/5">
                <td className="px-3 py-2 text-ink-200">
                  {s.pay_run?.period_year}-{String(s.pay_run?.period_month || '').padStart(2, '0')}
                  <div className="text-xs text-ink-500">
                    Payday {String(s.pay_run?.payday || '').slice(0, 10)}
                  </div>
                </td>
                <td className="px-3 py-2">{formatPula(s.gross)}</td>
                <td className="px-3 py-2 text-ink-300">{formatPula(s.advances_recovered)}</td>
                <td className="px-3 py-2 font-semibold text-white">{formatPula(s.net)}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    className={adminBtnSecondary}
                    onClick={() => openPayslipPrintWindow(s)}
                  >
                    View / Print
                  </button>
                </td>
              </tr>
            ))}
            {!loading && !slips.length ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-ink-500">
                  No payslips yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}
