import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PBKDF2_ITERATIONS = 100_000
const DEFAULT_PASSWORD = 'password123'
const OPS_TZ = 'Africa/Gaborone'

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function adminClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, key, { auth: { persistSession: false } })
}

function bytesToHex(buf: ArrayBuffer | Uint8Array) {
  const arr = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function sha256Hex(value: string) {
  const data = new TextEncoder().encode(value)
  return bytesToHex(await crypto.subtle.digest('SHA-256', data))
}

async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256,
  )
  return `pbkdf2$${PBKDF2_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(bits)}`
}

function bearerToken(req: Request) {
  const h = req.headers.get('Authorization') || ''
  const m = /^Bearer\s+(.+)$/i.exec(h)
  return m?.[1]?.trim() || ''
}

async function loadSessionUser(
  supabase: ReturnType<typeof adminClient>,
  token: string,
) {
  if (!token) return null
  const tokenHash = await sha256Hex(token)
  const now = new Date().toISOString()
  const { data: session, error } = await supabase
    .from('auth_sessions')
    .select('user_id, expires_at, revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle()
  if (error) throw error
  if (!session || session.revoked_at || session.expires_at < now) return null
  const { data: user, error: uErr } = await supabase
    .from('users')
    .select('*')
    .eq('id', session.user_id)
    .eq('is_active', true)
    .maybeSingle()
  if (uErr) throw uErr
  return user
}

async function requireAdmin(
  supabase: ReturnType<typeof adminClient>,
  req: Request,
  body: Record<string, unknown>,
) {
  const token = bearerToken(req) || String(body.session_token || '').trim()
  const user = await loadSessionUser(supabase, token)
  if (!user) return { error: json(401, { success: false, message: 'Session expired.' }) }
  if (String(user.role) !== 'admin') {
    return { error: json(403, { success: false, message: 'Admin access required.' }) }
  }
  return { user }
}

async function requireStaffLike(
  supabase: ReturnType<typeof adminClient>,
  req: Request,
  body: Record<string, unknown>,
) {
  const token = bearerToken(req) || String(body.session_token || '').trim()
  const user = await loadSessionUser(supabase, token)
  if (!user) return { error: json(401, { success: false, message: 'Session expired.' }) }
  const role = String(user.role)
  if (role !== 'admin' && role !== 'staff') {
    return { error: json(403, { success: false, message: 'Staff access required.' }) }
  }
  return { user }
}

function ymdInTz(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: OPS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

function weekdayUtc(y: number, m: number, d: number) {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

function lastWeekdayOfMonth(y: number, m: number, weekday: number) {
  let d = daysInMonth(y, m)
  while (d >= 1) {
    if (weekdayUtc(y, m, d) === weekday) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    }
    d -= 1
  }
  return `${y}-${String(m).padStart(2, '0')}-01`
}

function autoPaydayForMonth(y: number, m: number) {
  const tue = lastWeekdayOfMonth(y, m, 2)
  const thu = lastWeekdayOfMonth(y, m, 4)
  return tue >= thu ? tue : thu
}

function clampDom(y: number, m: number, dom: number) {
  const dim = daysInMonth(y, m)
  const d = Math.min(Math.max(1, dom), dim)
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function nextPayrollDate(settings: Record<string, unknown>, fromYmd = ymdInTz()) {
  const [fy, fm] = fromYmd.split('-').map(Number)
  const mode = String(settings.payroll_payday_mode || 'auto_last_tue_thu')

  if (mode === 'override_date' && settings.payroll_payday_override_date) {
    const od = String(settings.payroll_payday_override_date).slice(0, 10)
    if (od >= fromYmd) return od
  }

  if (mode === 'override_day_of_month' && settings.payroll_payday_override_dom) {
    let y = fy
    let m = fm
    let candidate = clampDom(y, m, Number(settings.payroll_payday_override_dom))
    if (candidate < fromYmd) {
      m += 1
      if (m > 12) {
        m = 1
        y += 1
      }
      candidate = clampDom(y, m, Number(settings.payroll_payday_override_dom))
    }
    return candidate
  }

  let y = fy
  let m = fm
  let candidate = autoPaydayForMonth(y, m)
  if (candidate < fromYmd) {
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
    candidate = autoPaydayForMonth(y, m)
  }
  return candidate
}

async function loadSettings(supabase: ReturnType<typeof adminClient>) {
  const { data, error } = await supabase.from('company_settings').select('*').eq('id', 1).maybeSingle()
  if (error) throw error
  return data || {}
}

async function handleNextPayday(
  supabase: ReturnType<typeof adminClient>,
  req: Request,
  body: Record<string, unknown>,
) {
  const gate = await requireStaffLike(supabase, req, body)
  if (gate.error) return gate.error
  const settings = await loadSettings(supabase)
  const next = nextPayrollDate(settings)
  return json(200, {
    success: true,
    next_payday: next,
    mode: settings.payroll_payday_mode || 'auto_last_tue_thu',
    auto_this_month: autoPaydayForMonth(
      Number(ymdInTz().slice(0, 4)),
      Number(ymdInTz().slice(5, 7)),
    ),
  })
}

async function handleListStaffHr(
  supabase: ReturnType<typeof adminClient>,
  req: Request,
  body: Record<string, unknown>,
) {
  const gate = await requireAdmin(supabase, req, body)
  if (gate.error) return gate.error

  const { data: users, error } = await supabase
    .from('users')
    .select(
      'id, name, first_name, middle_name, surname, gender, email, phone, role, is_active, after_hours_until, client_id, created_at',
    )
    .eq('role', 'staff')
    .order('name')
  if (error) throw error

  const ids = (users || []).map((u) => u.id)
  const { data: employment } = await supabase
    .from('staff_employment')
    .select('*')
    .in('user_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])

  const byUser = new Map((employment || []).map((e) => [e.user_id, e]))
  const staff = (users || []).map((u) => ({
    ...u,
    employment: byUser.get(u.id) || null,
  }))
  return json(200, { success: true, staff })
}

async function handleUpsertStaff(
  supabase: ReturnType<typeof adminClient>,
  req: Request,
  body: Record<string, unknown>,
) {
  const gate = await requireAdmin(supabase, req, body)
  if (gate.error) return gate.error

  const first_name = String(body.first_name || '').trim()
  const middle_name = String(body.middle_name || '').trim() || null
  const surname = String(body.surname || '').trim()
  const email = String(body.email || '').trim().toLowerCase()
  const phone = String(body.phone || '').trim() || null
  const genderRaw = String(body.gender || '').trim().toUpperCase()
  const gender = genderRaw === 'M' || genderRaw === 'F' ? genderRaw : null
  const nameFromParts = [first_name, middle_name, surname].filter(Boolean).join(' ')
  const name = nameFromParts || String(body.name || '').trim()
  const jobTitle = String(body.job_title || 'Staff').trim() || 'Staff'
  const baseSalary = Number(body.base_salary) || 0
  const startDate = String(body.start_date || ymdInTz()).slice(0, 10)
  const employmentStatusRaw = String(body.employment_status || 'active').trim().toLowerCase()
  const employmentStatus = ['active', 'on_leave', 'terminated'].includes(employmentStatusRaw)
    ? employmentStatusRaw
    : 'active'
  const bankName = String(body.bank_name || '').trim() || null
  const bankAccount = String(body.bank_account || '').trim() || null
  const notes = String(body.notes || '').trim() || null
  const userId = body.user_id ? String(body.user_id) : ''

  if (!first_name || !surname) {
    return json(400, { success: false, message: 'first name and last name are required' })
  }
  if (!email) {
    return json(400, { success: false, message: 'email is required' })
  }
  if (!phone) {
    return json(400, { success: false, message: 'phone is required for staff login' })
  }
  if (!name) {
    return json(400, { success: false, message: 'name is required' })
  }

  const profileFields = {
    name,
    first_name,
    middle_name,
    surname,
    gender,
    email,
    phone,
  }

  const employmentPayload = {
    job_title: jobTitle,
    base_salary: baseSalary,
    start_date: startDate,
    employment_status: employmentStatus,
    bank_name: bankName,
    bank_account: bankAccount,
    notes,
    updated_at: new Date().toISOString(),
  }

  let user
  if (userId) {
    const { data, error } = await supabase
      .from('users')
      .update({
        ...profileFields,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .eq('role', 'staff')
      .select('*')
      .single()
    if (error) throw error
    user = data

    const { error: eErr } = await supabase.from('staff_employment').upsert(
      {
        user_id: user.id,
        ...employmentPayload,
      },
      { onConflict: 'user_id' },
    )
    if (eErr) throw eErr
  } else {
    const password_hash = await hashPassword(DEFAULT_PASSWORD)
    const { data, error } = await supabase
      .from('users')
      .insert({
        ...profileFields,
        role: 'staff',
        password_hash,
        must_change_password: true,
        is_active: true,
      })
      .select('*')
      .single()
    if (error) throw error
    user = data

    const { error: eErr } = await supabase.from('staff_employment').insert({
      user_id: user.id,
      job_title: jobTitle,
      base_salary: baseSalary,
      start_date: startDate,
      employment_status: employmentStatus,
      bank_name: bankName,
      bank_account: bankAccount,
      notes,
    })
    if (eErr) throw eErr
  }

  const { data: employment } = await supabase
    .from('staff_employment')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  return json(200, {
    success: true,
    staff: { ...user, employment },
    temporary_password: userId ? undefined : DEFAULT_PASSWORD,
  })
}

async function handleSetStaffActive(
  supabase: ReturnType<typeof adminClient>,
  req: Request,
  body: Record<string, unknown>,
) {
  const gate = await requireAdmin(supabase, req, body)
  if (gate.error) return gate.error
  const userId = String(body.user_id || '')
  const isActive = !!body.is_active
  if (!userId) return json(400, { success: false, message: 'user_id required' })

  const { data, error } = await supabase
    .from('users')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .eq('role', 'staff')
    .select('id, name, is_active')
    .single()
  if (error) throw error

  if (!isActive) {
    await supabase
      .from('staff_employment')
      .update({ employment_status: 'terminated', updated_at: new Date().toISOString() })
      .eq('user_id', userId)
  } else {
    await supabase
      .from('staff_employment')
      .update({ employment_status: 'active', updated_at: new Date().toISOString() })
      .eq('user_id', userId)
  }

  return json(200, { success: true, user: data })
}

async function handleDeleteStaff(
  supabase: ReturnType<typeof adminClient>,
  req: Request,
  body: Record<string, unknown>,
) {
  const gate = await requireAdmin(supabase, req, body)
  if (gate.error) return gate.error

  const userId = String(body.user_id || '')
  if (!userId) return json(400, { success: false, message: 'user_id required' })
  if (userId === gate.user!.id) {
    return json(400, { success: false, message: 'You cannot delete your own account.' })
  }

  const { data: target, error: tErr } = await supabase
    .from('users')
    .select('id, name, role')
    .eq('id', userId)
    .eq('role', 'staff')
    .maybeSingle()
  if (tErr) throw tErr
  if (!target) return json(404, { success: false, message: 'Staff member not found.' })

  // Payslips are financial records: keep them and require disabling instead.
  const { count, error: cErr } = await supabase
    .from('payslips')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
  if (cErr) throw cErr
  if ((count || 0) > 0) {
    return json(400, {
      success: false,
      message: `${target.name} has ${count} payslip(s) on record and cannot be deleted. Disable the account instead to block sign-in while keeping payroll history.`,
    })
  }

  const { error } = await supabase.from('users').delete().eq('id', userId).eq('role', 'staff')
  if (error) throw error

  return json(200, { success: true, deleted_id: userId, name: target.name })
}

async function handleResetStaffPassword(
  supabase: ReturnType<typeof adminClient>,
  req: Request,
  body: Record<string, unknown>,
) {
  const gate = await requireAdmin(supabase, req, body)
  if (gate.error) return gate.error

  const userId = String(body.user_id || '')
  if (!userId) return json(400, { success: false, message: 'user_id required' })
  if (userId === gate.user!.id) {
    return json(400, {
      success: false,
      message: 'Use Change password on your profile instead of resetting your own account here.',
    })
  }

  const { data: target, error: tErr } = await supabase
    .from('users')
    .select('id, name, role')
    .eq('id', userId)
    .eq('role', 'staff')
    .maybeSingle()
  if (tErr) throw tErr
  if (!target) return json(404, { success: false, message: 'Staff member not found.' })

  const password_hash = await hashPassword(DEFAULT_PASSWORD)
  const { error } = await supabase
    .from('users')
    .update({
      password_hash,
      must_change_password: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .eq('role', 'staff')
  if (error) throw error

  // Force re-login with the temporary password.
  await supabase
    .from('auth_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('revoked_at', null)

  return json(200, {
    success: true,
    user_id: userId,
    name: target.name,
    temporary_password: DEFAULT_PASSWORD,
  })
}

async function handleListBenefits(
  supabase: ReturnType<typeof adminClient>,
  req: Request,
  body: Record<string, unknown>,
) {
  const gate = await requireAdmin(supabase, req, body)
  if (gate.error) return gate.error
  const { data: types, error } = await supabase
    .from('staff_benefit_types')
    .select('*')
    .order('sort_order')
  if (error) throw error
  const userId = body.user_id ? String(body.user_id) : ''
  let assignments: unknown[] = []
  if (userId) {
    const res = await supabase
      .from('staff_benefit_assignments')
      .select('*, benefit:staff_benefit_types(*)')
      .eq('user_id', userId)
    if (res.error) throw res.error
    assignments = res.data || []
  }
  return json(200, { success: true, types: types || [], assignments })
}

async function handleAssignBenefit(
  supabase: ReturnType<typeof adminClient>,
  req: Request,
  body: Record<string, unknown>,
) {
  const gate = await requireAdmin(supabase, req, body)
  if (gate.error) return gate.error
  const userId = String(body.user_id || '')
  const benefitTypeId = String(body.benefit_type_id || '')
  const amount = Number(body.amount)
  const active = body.active === false ? false : true
  if (!userId || !benefitTypeId) {
    return json(400, { success: false, message: 'user_id and benefit_type_id required' })
  }
  if (active && (!(amount > 0) || Number.isNaN(amount))) {
    return json(400, { success: false, message: 'Benefit amount must be greater than zero' })
  }
  if (!active && (Number.isNaN(amount) || amount < 0)) {
    return json(400, { success: false, message: 'Invalid amount' })
  }
  const { data, error } = await supabase
    .from('staff_benefit_assignments')
    .upsert(
      {
        user_id: userId,
        benefit_type_id: benefitTypeId,
        amount: active ? amount : Math.max(0, amount || 0),
        active,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,benefit_type_id' },
    )
    .select('*, benefit:staff_benefit_types(*)')
    .single()
  if (error) throw error
  return json(200, { success: true, assignment: data })
}

async function handleRemoveBenefit(
  supabase: ReturnType<typeof adminClient>,
  req: Request,
  body: Record<string, unknown>,
) {
  const gate = await requireAdmin(supabase, req, body)
  if (gate.error) return gate.error
  const assignmentId = String(body.assignment_id || '')
  if (!assignmentId) {
    return json(400, { success: false, message: 'assignment_id required' })
  }
  const { data, error } = await supabase
    .from('staff_benefit_assignments')
    .delete()
    .eq('id', assignmentId)
    .select('id, user_id, benefit_type_id')
    .maybeSingle()
  if (error) throw error
  if (!data) return json(404, { success: false, message: 'Benefit assignment not found' })
  return json(200, { success: true, deleted: data })
}

async function handleCreateAdvance(
  supabase: ReturnType<typeof adminClient>,
  req: Request,
  body: Record<string, unknown>,
) {
  const gate = await requireAdmin(supabase, req, body)
  if (gate.error) return gate.error
  const userId = String(body.user_id || '')
  const amount = Number(body.amount)
  const advanceDate = String(body.advance_date || ymdInTz()).slice(0, 10)
  const notes = String(body.notes || '').trim() || null
  if (!userId || !(amount > 0)) {
    return json(400, { success: false, message: 'user_id and positive amount required' })
  }
  const { data, error } = await supabase
    .from('salary_advances')
    .insert({
      user_id: userId,
      amount,
      remaining: amount,
      advance_date: advanceDate,
      notes,
      created_by: gate.user!.id,
    })
    .select('*')
    .single()
  if (error) throw error
  return json(200, { success: true, advance: data })
}

async function handleUpdateAdvance(
  supabase: ReturnType<typeof adminClient>,
  req: Request,
  body: Record<string, unknown>,
) {
  const gate = await requireAdmin(supabase, req, body)
  if (gate.error) return gate.error
  const advanceId = String(body.advance_id || '')
  const amount = Number(body.amount)
  const advanceDate = body.advance_date
    ? String(body.advance_date).slice(0, 10)
    : undefined
  const notes =
    body.notes === undefined ? undefined : String(body.notes || '').trim() || null
  if (!advanceId) return json(400, { success: false, message: 'advance_id required' })
  if (!(amount > 0)) {
    return json(400, { success: false, message: 'Advance amount must be greater than zero' })
  }

  const { data: existing, error: eErr } = await supabase
    .from('salary_advances')
    .select('*')
    .eq('id', advanceId)
    .maybeSingle()
  if (eErr) throw eErr
  if (!existing) return json(404, { success: false, message: 'Advance not found' })
  if (!(Number(existing.remaining) > 0)) {
    return json(400, {
      success: false,
      message: 'Recovered advances cannot be edited. Record a new advance instead.',
    })
  }

  // Keep recovered portion: recovered = amount - remaining; new remaining = max(0, newAmount - recovered)
  const prevAmount = Number(existing.amount) || 0
  const prevRemaining = Number(existing.remaining) || 0
  const recovered = Math.max(0, prevAmount - prevRemaining)
  const nextRemaining = Math.max(0, amount - recovered)
  if (nextRemaining <= 0 && recovered > 0) {
    return json(400, {
      success: false,
      message: `Amount must be greater than already recovered (${recovered}).`,
    })
  }

  const patch: Record<string, unknown> = {
    amount,
    remaining: nextRemaining > 0 ? nextRemaining : amount,
    updated_at: new Date().toISOString(),
  }
  if (advanceDate) patch.advance_date = advanceDate
  if (notes !== undefined) patch.notes = notes

  const { data, error } = await supabase
    .from('salary_advances')
    .update(patch)
    .eq('id', advanceId)
    .select('*')
    .single()
  if (error) throw error
  return json(200, { success: true, advance: data })
}

async function handleDeleteAdvance(
  supabase: ReturnType<typeof adminClient>,
  req: Request,
  body: Record<string, unknown>,
) {
  const gate = await requireAdmin(supabase, req, body)
  if (gate.error) return gate.error
  const advanceId = String(body.advance_id || '')
  if (!advanceId) return json(400, { success: false, message: 'advance_id required' })

  const { data: existing, error: eErr } = await supabase
    .from('salary_advances')
    .select('id, remaining, amount')
    .eq('id', advanceId)
    .maybeSingle()
  if (eErr) throw eErr
  if (!existing) return json(404, { success: false, message: 'Advance not found' })
  if (!(Number(existing.remaining) > 0)) {
    return json(400, {
      success: false,
      message: 'Fully recovered advances cannot be deleted.',
    })
  }

  const { error } = await supabase.from('salary_advances').delete().eq('id', advanceId)
  if (error) throw error
  return json(200, { success: true, deleted_id: advanceId })
}

async function handleListAdvances(
  supabase: ReturnType<typeof adminClient>,
  req: Request,
  body: Record<string, unknown>,
) {
  const gate = await requireAdmin(supabase, req, body)
  if (gate.error) return gate.error
  let q = supabase.from('salary_advances').select('*').order('advance_date', { ascending: false })
  if (body.user_id) q = q.eq('user_id', String(body.user_id))
  if (body.open_only) q = q.gt('remaining', 0)
  const { data, error } = await q
  if (error) throw error
  return json(200, { success: true, advances: data || [] })
}

async function handlePostPayRun(
  supabase: ReturnType<typeof adminClient>,
  req: Request,
  body: Record<string, unknown>,
) {
  const gate = await requireAdmin(supabase, req, body)
  if (gate.error) return gate.error

  const settings = await loadSettings(supabase)
  const payday = String(body.payday || nextPayrollDate(settings)).slice(0, 10)
  const periodYear = Number(body.period_year) || Number(payday.slice(0, 4))
  const periodMonth = Number(body.period_month) || Number(payday.slice(5, 7))
  const notes = String(body.notes || '').trim() || null

  const { data: existing } = await supabase
    .from('pay_runs')
    .select('id, status')
    .eq('period_year', periodYear)
    .eq('period_month', periodMonth)
    .maybeSingle()
  if (existing?.status === 'posted') {
    return json(400, { success: false, message: 'Pay run for this period is already posted.' })
  }

  let runId = existing?.id
  if (!runId) {
    const { data: run, error } = await supabase
      .from('pay_runs')
      .insert({
        period_year: periodYear,
        period_month: periodMonth,
        payday,
        status: 'draft',
        notes,
        created_by: gate.user!.id,
      })
      .select('*')
      .single()
    if (error) throw error
    runId = run.id
  } else {
    await supabase
      .from('pay_runs')
      .update({ payday, notes, updated_at: new Date().toISOString() })
      .eq('id', runId)
  }

  const { data: staffUsers, error: sErr } = await supabase
    .from('users')
    .select('id, name, email, phone')
    .eq('role', 'staff')
    .eq('is_active', true)
  if (sErr) throw sErr

  const company = {
    name: String(settings.company_name || 'iTreq Inc'),
    currency: String(settings.currency || 'BWP'),
  }

  const slips = []
  for (const staff of staffUsers || []) {
    const { data: emp } = await supabase
      .from('staff_employment')
      .select('*')
      .eq('user_id', staff.id)
      .maybeSingle()
    if (!emp || emp.employment_status === 'terminated') continue

    const { data: benefits } = await supabase
      .from('staff_benefit_assignments')
      .select('amount, benefit:staff_benefit_types(name)')
      .eq('user_id', staff.id)
      .eq('active', true)

    const benefitLines = (benefits || []).map((b) => ({
      name: (b.benefit as { name?: string })?.name || 'Benefit',
      amount: Number(b.amount) || 0,
    }))
    const benefitsTotal = benefitLines.reduce((s, l) => s + l.amount, 0)
    const base = Number(emp.base_salary) || 0
    const gross = base + benefitsTotal

    const { data: advances } = await supabase
      .from('salary_advances')
      .select('*')
      .eq('user_id', staff.id)
      .gt('remaining', 0)

    let advancesRecovered = 0
    const advanceLines: { id: string; amount: number; date: string }[] = []
    for (const adv of advances || []) {
      const take = Number(adv.remaining) || 0
      if (take <= 0) continue
      advancesRecovered += take
      advanceLines.push({
        id: adv.id,
        amount: take,
        date: adv.advance_date,
      })
      await supabase
        .from('salary_advances')
        .update({ remaining: 0, updated_at: new Date().toISOString() })
        .eq('id', adv.id)
    }

    const net = Math.max(0, gross - advancesRecovered)
    const snapshot = {
      company_name: company.name,
      currency: company.currency,
      staff_name: staff.name,
      email: staff.email,
      phone: staff.phone || null,
      employee_ref: String(staff.id).slice(0, 8).toUpperCase(),
      job_title: emp.job_title,
      start_date: emp.start_date || null,
      employment_status: emp.employment_status || 'active',
      bank_name: emp.bank_name || null,
      bank_account: emp.bank_account || null,
      period_year: periodYear,
      period_month: periodMonth,
      payday,
      base_salary: base,
      benefits: benefitLines,
      advances: advanceLines,
      benefits_total: benefitsTotal,
      advances_recovered: advancesRecovered,
      gross,
      net,
    }

    await supabase.from('payslips').delete().eq('pay_run_id', runId).eq('user_id', staff.id)
    const { data: slip, error: slipErr } = await supabase
      .from('payslips')
      .insert({
        pay_run_id: runId,
        user_id: staff.id,
        job_title: emp.job_title,
        base_salary: base,
        benefits_total: benefitsTotal,
        advances_recovered: advancesRecovered,
        gross,
        net,
        snapshot,
      })
      .select('*')
      .single()
    if (slipErr) throw slipErr
    slips.push(slip)
  }

  const { data: run, error: postErr } = await supabase
    .from('pay_runs')
    .update({
      status: 'posted',
      posted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', runId)
    .select('*')
    .single()
  if (postErr) throw postErr

  return json(200, { success: true, pay_run: run, payslips: slips })
}

async function handleListPayslips(
  supabase: ReturnType<typeof adminClient>,
  req: Request,
  body: Record<string, unknown>,
) {
  const gate = await requireStaffLike(supabase, req, body)
  if (gate.error) return gate.error

  let q = supabase
    .from('payslips')
    .select('*, pay_run:pay_runs(period_year, period_month, payday, status)')
    .order('created_at', { ascending: false })

  if (String(gate.user!.role) !== 'admin') {
    q = q.eq('user_id', gate.user!.id)
  } else if (body.user_id) {
    q = q.eq('user_id', String(body.user_id))
  }

  const { data, error } = await q
  if (error) throw error
  return json(200, { success: true, payslips: data || [] })
}

async function handleGetPayslip(
  supabase: ReturnType<typeof adminClient>,
  req: Request,
  body: Record<string, unknown>,
) {
  const gate = await requireStaffLike(supabase, req, body)
  if (gate.error) return gate.error
  const id = String(body.payslip_id || '')
  if (!id) return json(400, { success: false, message: 'payslip_id required' })

  const { data, error } = await supabase
    .from('payslips')
    .select('*, pay_run:pay_runs(*)')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return json(404, { success: false, message: 'Payslip not found' })
  if (String(gate.user!.role) !== 'admin' && data.user_id !== gate.user!.id) {
    return json(403, { success: false, message: 'Not your payslip' })
  }
  return json(200, { success: true, payslip: data })
}

async function handleUpdatePaydaySettings(
  supabase: ReturnType<typeof adminClient>,
  req: Request,
  body: Record<string, unknown>,
) {
  const gate = await requireAdmin(supabase, req, body)
  if (gate.error) return gate.error

  const mode = String(body.payroll_payday_mode || 'auto_last_tue_thu')
  if (!['auto_last_tue_thu', 'override_date', 'override_day_of_month'].includes(mode)) {
    return json(400, { success: false, message: 'Invalid payday mode' })
  }

  const patch: Record<string, unknown> = {
    payroll_payday_mode: mode,
    updated_at: new Date().toISOString(),
  }
  if (mode === 'override_date') {
    patch.payroll_payday_override_date = String(body.payroll_payday_override_date || '').slice(0, 10) || null
    patch.payroll_payday_override_dom = null
  } else if (mode === 'override_day_of_month') {
    patch.payroll_payday_override_dom = Number(body.payroll_payday_override_dom) || null
    patch.payroll_payday_override_date = null
  } else {
    patch.payroll_payday_override_date = null
    patch.payroll_payday_override_dom = null
  }

  const { data, error } = await supabase
    .from('company_settings')
    .update(patch)
    .eq('id', 1)
    .select('*')
    .single()
  if (error) throw error

  return json(200, {
    success: true,
    settings: data,
    next_payday: nextPayrollDate(data),
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json(405, { message: 'Method not allowed' })
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const action = String(body.action || '').trim().toLowerCase()
    if (!action) return json(400, { success: false, message: 'action is required' })

    const supabase = adminClient()
    switch (action) {
      case 'next_payday':
        return await handleNextPayday(supabase, req, body)
      case 'list_staff_hr':
        return await handleListStaffHr(supabase, req, body)
      case 'upsert_staff':
        return await handleUpsertStaff(supabase, req, body)
      case 'set_staff_active':
        return await handleSetStaffActive(supabase, req, body)
      case 'delete_staff':
        return await handleDeleteStaff(supabase, req, body)
      case 'reset_staff_password':
        return await handleResetStaffPassword(supabase, req, body)
      case 'list_benefits':
        return await handleListBenefits(supabase, req, body)
      case 'assign_benefit':
        return await handleAssignBenefit(supabase, req, body)
      case 'remove_benefit':
        return await handleRemoveBenefit(supabase, req, body)
      case 'create_advance':
        return await handleCreateAdvance(supabase, req, body)
      case 'update_advance':
        return await handleUpdateAdvance(supabase, req, body)
      case 'delete_advance':
        return await handleDeleteAdvance(supabase, req, body)
      case 'list_advances':
        return await handleListAdvances(supabase, req, body)
      case 'post_pay_run':
        return await handlePostPayRun(supabase, req, body)
      case 'list_payslips':
        return await handleListPayslips(supabase, req, body)
      case 'get_payslip':
        return await handleGetPayslip(supabase, req, body)
      case 'update_payday_settings':
        return await handleUpdatePaydaySettings(supabase, req, body)
      default:
        return json(400, { success: false, message: `Unknown action: ${action}` })
    }
  } catch (err) {
    console.error('payroll error:', err)
    const message = err instanceof Error ? err.message : 'Unexpected error'
    return json(500, { success: false, message })
  }
})
