import { invokeFn } from './invokeFn'
import { AUTH_BYPASS } from './authConfig'
import { nextPayrollDate, paydayLabel, autoPaydayForMonth, ymdInTz } from './payrollPayday'
import { supabase } from './supabase'

async function payrollAction(action, body = {}) {
  if (AUTH_BYPASS) {
    return bypassPayroll(action, body)
  }
  return invokeFn('payroll', { body: { action, ...body } }, { withAuth: true })
}

/**
 * Dev bypass: limited local helpers via direct DB (TEMP RLS).
 * Prefer Edge Function when auth bypass is off.
 */
async function bypassPayroll(action, body) {
  try {
    switch (action) {
      case 'next_payday': {
        const { data: settings } = await supabase
          .from('company_settings')
          .select('*')
          .eq('id', 1)
          .maybeSingle()
        const s = settings || {}
        const today = ymdInTz()
        return {
          data: {
            success: true,
            next_payday: nextPayrollDate(s, today),
            mode: s.payroll_payday_mode || 'auto_last_tue_thu',
            auto_this_month: autoPaydayForMonth(
              Number(today.slice(0, 4)),
              Number(today.slice(5, 7)),
            ),
            label: paydayLabel(s),
          },
          error: null,
        }
      }
      default:
        return {
          data: null,
          error: {
            message:
              'This payroll action needs a real admin session. Set VITE_AUTH_BYPASS=false and sign in as admin.',
          },
        }
    }
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Payroll request failed' },
    }
  }
}

export const payrollApi = {
  nextPayday: () => payrollAction('next_payday'),
  listStaffHr: () => payrollAction('list_staff_hr'),
  upsertStaff: (payload) => payrollAction('upsert_staff', payload),
  setStaffActive: (userId, isActive) =>
    payrollAction('set_staff_active', { user_id: userId, is_active: isActive }),
  deleteStaff: (userId) => payrollAction('delete_staff', { user_id: userId }),
  resetStaffPassword: (userId) =>
    payrollAction('reset_staff_password', { user_id: userId }),
  listBenefits: (userId) =>
    payrollAction('list_benefits', userId ? { user_id: userId } : {}),
  assignBenefit: (payload) => payrollAction('assign_benefit', payload),
  removeBenefit: (assignmentId) =>
    payrollAction('remove_benefit', { assignment_id: assignmentId }),
  createAdvance: (payload) => payrollAction('create_advance', payload),
  updateAdvance: (payload) => payrollAction('update_advance', payload),
  deleteAdvance: (advanceId) =>
    payrollAction('delete_advance', { advance_id: advanceId }),
  listAdvances: (userId, openOnly = false) =>
    payrollAction('list_advances', {
      ...(userId ? { user_id: userId } : {}),
      open_only: openOnly,
    }),
  postPayRun: (payload = {}) => payrollAction('post_pay_run', payload),
  listPayslips: (userId) =>
    payrollAction('list_payslips', userId ? { user_id: userId } : {}),
  getPayslip: (payslipId) => payrollAction('get_payslip', { payslip_id: payslipId }),
  updatePaydaySettings: (payload) => payrollAction('update_payday_settings', payload),
}
