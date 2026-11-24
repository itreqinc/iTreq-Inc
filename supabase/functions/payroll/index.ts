import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PBKDF2_ITERATIONS = 100_000
const DEFAULT_PASSWORD = 'password123'
const OPS_TZ = 'Africa/Gaborone'
const SESSION_TTL_MS = 24 * 60 * 60 * 1000
const SESSION_SLIDE_REMAINING_MS = 2 * 60 * 60 * 1000
const SESSION_IDLE_MS = 8 * 60 * 60 * 1000

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

async function maybeSlideSession(
  supabase: ReturnType<typeof adminClient>,
  session: { id: string; expires_at: string },
) {
  const remainingMs = new Date(session.expires_at).getTime() - Date.now()
  if (remainingMs >= SESSION_SLIDE_REMAINING_MS) return
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()
  await supabase
    .from('auth_sessions')
    .update({ expires_at: expiresAt })
    .eq('id', session.id)
    .is('revoked_at', null)
}

function isSessionIdle(lastActivityAt: string | null | undefined) {
  const t = lastActivityAt ? new Date(lastActivityAt).getTime() : NaN
  if (!Number.isFinite(t)) return true
  return Date.now() - t > SESSION_IDLE_MS
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
    .select('id, user_id, expires_at, revoked_at, last_activity_at')
    .eq('token_hash', tokenHash)
    .maybeSingle()
  if (error) throw error
  if (!session || session.revoked_at || session.expires_at < now) return null
  if (isSessionIdle(session.last_activity_at)) return null

  await maybeSlideSession(supabase, session)

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

type ExpenseCategoryRow = { id: string; name: string; system_key: string | null }

async function loadExpenseCategoryByKey(
  supabase: ReturnType<typeof adminClient>,
  systemKey: string,
): Promise<ExpenseCategoryRow | null> {
  const { data, error } = await supabase
    .from('expense_categories')
    .select('id, name, system_key')
    .eq('system_key', systemKey)
    .maybeSingle()
  if (error) throw error
  return data
}

async function loadUserDisplayName(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
) {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, first_name, surname, email')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}

function displayFirstName(user: { first_name?: string | null; name?: string | null } | null) {
  const first = String(user?.first_name || '').trim()
  if (first) return first
  const full = String(user?.name || '').trim()
  if (!full) return 'there'
  return full.split(/\s+/)[0] || 'there'
}

function formatPaydayDdMmYyyy(ymd: string) {
  const [y, m, d] = String(ymd).slice(0, 10).split('-')
  if (!y || !m || !d) return ymd
  return `${d}-${m}-${y}`
}

function formatMonthYear(year: number, month: number) {
  const dt = new Date(Date.UTC(year, month - 1, 1))
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(dt)
}

function formatMoney(amount: number, currency = 'BWP') {
  const n = Number(amount) || 0
  try {
    return new Intl.NumberFormat('en-BW', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(n)
  } catch {
    return `${currency} ${n.toFixed(2)}`
  }
}

function simpleEmailHtml(title: string, body: string) {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#333"><h2>${esc(title)}</h2><pre style="white-space:pre-wrap;font-family:inherit">${esc(body)}</pre></body></html>`
}

async function sendViaResend(opts: {
  to: string | string[]
  subject: string
  text: string
  html?: string
}) {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) {
    console.warn('RESEND_API_KEY missing — payroll email skipped')
    return { sent: false, reason: 'missing_resend_key' as const }
  }
  const from =
    Deno.env.get('RESEND_FROM')?.trim() || 'iTreq Inc <no-reply@itreqinc.com>'
  const recipients = (Array.isArray(opts.to) ? opts.to : [opts.to])
    .map((v) => String(v || '').trim())
    .filter(Boolean)
  if (!recipients.length) return { sent: false, reason: 'no_recipients' as const }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: recipients,
      subject: opts.subject,
      html: opts.html || simpleEmailHtml(opts.subject, opts.text),
      text: opts.text,
    }),
  })
  if (!res.ok) {
    const errText = await res.text()
    console.error('Resend error:', errText)
    return { sent: false, reason: 'resend_error' as const }
  }
  return { sent: true as const }
}

async function listAdminRecipients(supabase: ReturnType<typeof adminClient>) {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, first_name, email')
    .eq('role', 'admin')
    .eq('is_active', true)
  if (error) throw error
  return (data || []).filter((u) => String(u.email || '').trim())
}

function periodBounds(year: number, month: number) {
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const last = daysInMonth(year, month)
  const to = `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`
  return { from, to }
}

/** Auth for scheduled jobs: PAYROLL_CRON_SECRET (or CRON_SECRET) in body.cron_secret. */
async function requireCronOrAdmin(
  supabase: ReturnType<typeof adminClient>,
  req: Request,
  body: Record<string, unknown>,
) {
  const expected =
    Deno.env.get('PAYROLL_CRON_SECRET')?.trim() || Deno.env.get('CRON_SECRET')?.trim() || ''
  const provided = String(body.cron_secret || '').trim()
  if (expected && provided && provided === expected) {
    return { user: null as null, viaCron: true }
  }
  const gate = await requireAdmin(supabase, req, body)
  if (gate.error) return { error: gate.error, viaCron: false }
  return { user: gate.user!, viaCron: false }
}

async function upsertAdvanceExpense(
  supabase: ReturnType<typeof adminClient>,
  opts: {
    expenseId?: string | null
    userId: string
    staffName: string
    amount: number
    advanceDate: string
    notes?: string | null
    method?: string | null
    reference?: string | null
  },
) {
  const cat = await loadExpenseCategoryByKey(supabase, 'salary_advance')
  if (!cat) throw new Error('Salary advance expense category is missing. Apply migrations.')
  const vendor = `Advance - ${opts.staffName}`
  const row = {
    expense_date: opts.advanceDate,
    amount: opts.amount,
    category_id: cat.id,
    vendor,
    method: opts.method || 'eft',
    reference: opts.reference || null,
    notes: opts.notes || null,
    staff_user_id: opts.userId,
    updated_at: new Date().toISOString(),
  }
  if (opts.expenseId) {
    const { data, error } = await supabase
      .from('expenses')
      .update(row)
      .eq('id', opts.expenseId)
      .select('*')
      .single()
    if (error) throw error
    return data
  }
  const { data, error } = await supabase.from('expenses').insert(row).select('*').single()
  if (error) throw error
  return data
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
    .in('role', ['staff', 'admin'])
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

  const allowedRoles = ['staff', 'admin'] as const
  const roleInput =
    body.role !== undefined && body.role !== null && String(body.role).trim() !== ''
      ? String(body.role).trim().toLowerCase()
      : undefined

  // Resolve desired role for inserts/updates.
  // For updates without `body.role`, default to the existing DB role.
  let desiredRole: (typeof allowedRoles)[number] = 'staff'
  if (userId) {
    const { data: existing, error: rErr } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .maybeSingle()
    if (rErr) throw rErr
    const existingRole = String(existing?.role || '')
    const candidate = roleInput || (existingRole === 'admin' ? 'admin' : 'staff')
    if (!allowedRoles.includes(candidate as (typeof allowedRoles)[number])) {
      return json(400, { success: false, message: 'Invalid role.' })
    }
    desiredRole = candidate as (typeof allowedRoles)[number]

    // Prevent admins from changing their own privilege role.
    if (userId === gate.user!.id && desiredRole !== String(gate.user!.role)) {
      return json(400, { success: false, message: 'You cannot change your own role.' })
    }
  } else {
    const candidate = roleInput || 'staff'
    if (!allowedRoles.includes(candidate as (typeof allowedRoles)[number])) {
      return json(400, { success: false, message: 'Invalid role.' })
    }
    desiredRole = candidate as (typeof allowedRoles)[number]
  }

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
        role: desiredRole,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
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
        role: desiredRole,
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

  // Prevent admins from disabling themselves (would lock access).
  if (userId === gate.user!.id) {
    return json(400, { success: false, message: 'You cannot disable your own account.' })
  }

  const { data, error } = await supabase
    .from('users')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .in('role', ['staff', 'admin'])
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
    .in('role', ['staff', 'admin'])
    .maybeSingle()
  if (tErr) throw tErr
  if (!target) return json(404, { success: false, message: 'User not found.' })

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

  const { error } = await supabase
    .from('users')
    .delete()
    .eq('id', userId)
    .in('role', ['staff', 'admin'])
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
    .in('role', ['staff', 'admin'])
    .maybeSingle()
  if (tErr) throw tErr
  if (!target) return json(404, { success: false, message: 'User not found.' })

  const password_hash = await hashPassword(DEFAULT_PASSWORD)
  const { error } = await supabase
    .from('users')
    .update({
      password_hash,
      must_change_password: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .in('role', ['staff', 'admin'])
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
  const method = String(body.method || 'eft').trim() || 'eft'
  const reference = String(body.reference || '').trim() || null
  if (!userId || !(amount > 0)) {
    return json(400, { success: false, message: 'user_id and positive amount required' })
  }
  const staff = await loadUserDisplayName(supabase, userId)
  if (!staff) return json(404, { success: false, message: 'Staff member not found' })
  const staffName = String(staff.name || 'Staff').trim() || 'Staff'

  const expense = await upsertAdvanceExpense(supabase, {
    userId,
    staffName,
    amount,
    advanceDate,
    notes,
    method,
    reference,
  })

  const { data, error } = await supabase
    .from('salary_advances')
    .insert({
      user_id: userId,
      amount,
      remaining: amount,
      advance_date: advanceDate,
      notes,
      created_by: gate.user!.id,
      expense_id: expense.id,
    })
    .select('*')
    .single()
  if (error) {
    await supabase.from('expenses').delete().eq('id', expense.id)
    throw error
  }
  return json(200, { success: true, advance: data, expense })
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
  const method =
    body.method === undefined ? undefined : String(body.method || 'eft').trim() || 'eft'
  const reference =
    body.reference === undefined
      ? undefined
      : String(body.reference || '').trim() || null
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

  const staff = await loadUserDisplayName(supabase, String(existing.user_id))
  const staffName = String(staff?.name || 'Staff').trim() || 'Staff'
  const nextDate = advanceDate || String(existing.advance_date).slice(0, 10)
  const nextNotes = notes !== undefined ? notes : existing.notes
  let expense = null
  try {
    expense = await upsertAdvanceExpense(supabase, {
      expenseId: existing.expense_id || null,
      userId: String(existing.user_id),
      staffName,
      amount,
      advanceDate: nextDate,
      notes: nextNotes,
      method: method || 'eft',
      reference: reference === undefined ? null : reference,
    })
    if (!existing.expense_id && expense?.id) {
      await supabase
        .from('salary_advances')
        .update({ expense_id: expense.id, updated_at: new Date().toISOString() })
        .eq('id', advanceId)
      data.expense_id = expense.id
    }
  } catch (err) {
    console.error('advance expense sync failed on update:', err)
  }

  return json(200, { success: true, advance: data, expense })
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
    .select('id, remaining, amount, expense_id')
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

  const expenseId = existing.expense_id ? String(existing.expense_id) : null
  const { error } = await supabase.from('salary_advances').delete().eq('id', advanceId)
  if (error) throw error
  if (expenseId) {
    const { error: xErr } = await supabase.from('expenses').delete().eq('id', expenseId)
    if (xErr) console.error('failed deleting linked advance expense:', xErr)
  }
  return json(200, { success: true, deleted_id: advanceId, deleted_expense_id: expenseId })
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
  const gate = await requireCronOrAdmin(supabase, req, body)
  if (gate.error) return gate.error

  const settings = await loadSettings(supabase)
  const payday = String(body.payday || nextPayrollDate(settings)).slice(0, 10)
  const periodYear = Number(body.period_year) || Number(payday.slice(0, 4))
  const periodMonth = Number(body.period_month) || Number(payday.slice(5, 7))
  const notes = String(body.notes || '').trim() || null
  const createdBy = gate.user?.id || null

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
        created_by: createdBy,
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

  // Staff always (if employed & not terminated). Admins only when base salary > 0.
  const { data: staffUsers, error: sErr } = await supabase
    .from('users')
    .select('id, name, email, phone, role')
    .in('role', ['staff', 'admin'])
    .eq('is_active', true)
  if (sErr) throw sErr

  const company = {
    name: String(settings.company_name || 'iTreq Inc'),
    currency: String(settings.currency || 'BWP'),
  }

  const remCat = await loadExpenseCategoryByKey(supabase, 'staff_rem_benefits')
  const salaryCat = await loadExpenseCategoryByKey(supabase, 'salary')
  if (!salaryCat) {
    return json(500, {
      success: false,
      message: 'Salary expense category is missing. Apply migrations.',
    })
  }
  const { from: periodFrom, to: periodTo } = periodBounds(periodYear, periodMonth)

  // Clear prior salary expense lines if re-posting a draft / after reverse recreate
  await supabase.from('expenses').delete().eq('pay_run_id', runId)

  const slips = []
  let totalNet = 0
  for (const staff of staffUsers || []) {
    const { data: emp } = await supabase
      .from('staff_employment')
      .select('*')
      .eq('user_id', staff.id)
      .maybeSingle()
    if (!emp || emp.employment_status === 'terminated') continue
    const base = Number(emp.base_salary) || 0
    if (String(staff.role) === 'admin' && !(base > 0)) continue

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

    // Mid-month rem/benefit expenses already paid → earning + matching deduction
    const linkedExpenseLines: {
      id: string
      name: string
      amount: number
      date: string
    }[] = []
    let linkedExpensesTotal = 0
    if (remCat) {
      const { data: linkedRows, error: lErr } = await supabase
        .from('expenses')
        .select('id, amount, expense_date, vendor, notes')
        .eq('staff_user_id', staff.id)
        .eq('category_id', remCat.id)
        .is('pay_run_id', null)
        .gte('expense_date', periodFrom)
        .lte('expense_date', periodTo)
      if (lErr) throw lErr
      for (const row of linkedRows || []) {
        const amt = Number(row.amount) || 0
        if (!(amt > 0)) continue
        linkedExpensesTotal += amt
        linkedExpenseLines.push({
          id: row.id,
          name: String(row.vendor || row.notes || 'Staff remuneration / benefits').trim(),
          amount: amt,
          date: String(row.expense_date).slice(0, 10),
        })
      }
    }

    const gross = base + benefitsTotal + linkedExpensesTotal

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

    const deductionsTotal = advancesRecovered + linkedExpensesTotal
    const net = Math.max(0, gross - deductionsTotal)
    totalNet += net
    const staffName = String(staff.name || 'Staff').trim() || 'Staff'
    const snapshot = {
      company_name: company.name,
      currency: company.currency,
      staff_name: staffName,
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
      linked_expenses: linkedExpenseLines,
      linked_expenses_total: linkedExpensesTotal,
      advances: advanceLines,
      benefits_total: benefitsTotal,
      advances_recovered: advancesRecovered,
      deductions_total: deductionsTotal,
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
        benefits_total: benefitsTotal + linkedExpensesTotal,
        advances_recovered: deductionsTotal,
        gross,
        net,
        snapshot,
      })
      .select('*')
      .single()
    if (slipErr) throw slipErr
    slips.push(slip)

    // Payday net → Expenses as Salary - {Name}
    if (net > 0) {
      const { error: salErr } = await supabase.from('expenses').insert({
        expense_date: payday,
        amount: net,
        category_id: salaryCat.id,
        vendor: `Salary - ${staffName}`,
        method: 'eft',
        reference: null,
        notes: `Pay run ${periodYear}-${String(periodMonth).padStart(2, '0')}`,
        staff_user_id: staff.id,
        pay_run_id: runId,
      })
      if (salErr) throw salErr
    }
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

  return json(200, {
    success: true,
    pay_run: run,
    payslips: slips,
    staff_paid: slips.length,
    total_net: totalNet,
  })
}

async function handleLatestPayRun(
  supabase: ReturnType<typeof adminClient>,
  req: Request,
  body: Record<string, unknown>,
) {
  const gate = await requireAdmin(supabase, req, body)
  if (gate.error) return gate.error

  const { data: run, error } = await supabase
    .from('pay_runs')
    .select('*')
    .eq('status', 'posted')
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!run) return json(200, { success: true, pay_run: null, payslip_count: 0 })

  const { count, error: cErr } = await supabase
    .from('payslips')
    .select('id', { count: 'exact', head: true })
    .eq('pay_run_id', run.id)
  if (cErr) throw cErr

  return json(200, {
    success: true,
    pay_run: run,
    payslip_count: count || 0,
  })
}

/**
 * Undo the most recent posted pay run: restore advance balances from slip
 * snapshots, then delete the run (payslips cascade). Period can be re-posted.
 */
async function handleReverseLatestPayRun(
  supabase: ReturnType<typeof adminClient>,
  req: Request,
  body: Record<string, unknown>,
) {
  const gate = await requireAdmin(supabase, req, body)
  if (gate.error) return gate.error

  const { data: run, error: rErr } = await supabase
    .from('pay_runs')
    .select('*')
    .eq('status', 'posted')
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (rErr) throw rErr
  if (!run) {
    return json(400, { success: false, message: 'No posted pay run to reverse.' })
  }

  const { data: slips, error: sErr } = await supabase
    .from('payslips')
    .select('id, user_id, snapshot, advances_recovered')
    .eq('pay_run_id', run.id)
  if (sErr) throw sErr

  let advancesRestored = 0
  for (const slip of slips || []) {
    const snap = (slip.snapshot || {}) as {
      advances?: { id?: string; amount?: number }[]
    }
    const lines = Array.isArray(snap.advances) ? snap.advances : []
    for (const line of lines) {
      const advanceId = String(line?.id || '')
      const amount = Number(line?.amount) || 0
      if (!advanceId || !(amount > 0)) continue
      const { data: adv, error: aErr } = await supabase
        .from('salary_advances')
        .select('id, remaining')
        .eq('id', advanceId)
        .maybeSingle()
      if (aErr) throw aErr
      if (!adv) continue
      const nextRemaining = (Number(adv.remaining) || 0) + amount
      const { error: uErr } = await supabase
        .from('salary_advances')
        .update({ remaining: nextRemaining, updated_at: new Date().toISOString() })
        .eq('id', advanceId)
      if (uErr) throw uErr
      advancesRestored += amount
    }
  }

  // Remove payday Salary - Name expense lines; keep mid-month rem/benefit + Advance expenses.
  const { data: salaryExpenses, error: seErr } = await supabase
    .from('expenses')
    .select('id')
    .eq('pay_run_id', run.id)
  if (seErr) throw seErr
  const salaryExpenseCount = (salaryExpenses || []).length
  if (salaryExpenseCount > 0) {
    const { error: delExpErr } = await supabase.from('expenses').delete().eq('pay_run_id', run.id)
    if (delExpErr) throw delExpErr
  }

  const { error: dErr } = await supabase.from('pay_runs').delete().eq('id', run.id)
  if (dErr) throw dErr

  return json(200, {
    success: true,
    reversed: {
      id: run.id,
      period_year: run.period_year,
      period_month: run.period_month,
      payday: run.payday,
    },
    payslips_removed: (slips || []).length,
    advances_restored: advancesRestored,
    salary_expenses_removed: salaryExpenseCount,
  })
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

async function handlePaydayMorningReminder(
  supabase: ReturnType<typeof adminClient>,
  req: Request,
  body: Record<string, unknown>,
) {
  const gate = await requireCronOrAdmin(supabase, req, body)
  if (gate.error) return gate.error

  const settings = await loadSettings(supabase)
  const today = ymdInTz()
  const payday = nextPayrollDate(settings, today)
  if (payday !== today) {
    return json(200, { success: true, skipped: true, reason: 'not_payday', today, next_payday: payday })
  }

  const periodYear = Number(payday.slice(0, 4))
  const periodMonth = Number(payday.slice(5, 7))
  const { data: existing } = await supabase
    .from('pay_runs')
    .select('id, status')
    .eq('period_year', periodYear)
    .eq('period_month', periodMonth)
    .maybeSingle()
  if (existing?.status === 'posted') {
    return json(200, { success: true, skipped: true, reason: 'already_posted' })
  }

  const already = settings.payroll_reminder_sent_for
    ? String(settings.payroll_reminder_sent_for).slice(0, 10)
    : ''
  if (already === today) {
    return json(200, { success: true, skipped: true, reason: 'reminder_already_sent' })
  }

  const monthYear = formatMonthYear(periodYear, periodMonth)
  const paydayLabel = formatPaydayDdMmYyyy(payday)
  const admins = await listAdminRecipients(supabase)
  let sent = 0
  for (const admin of admins) {
    const name = displayFirstName(admin)
    const text = [
      `Good morning ${name},`,
      '',
      `Today is the scheduled payroll date for ${monthYear} (payday ${paydayLabel}).`,
      '',
      'Please review and update all relevant records before end of business today so the run stays accurate and organised:',
      '',
      'Staff salaries and benefits',
      'Salary advances',
      'Staff-linked remuneration / benefit expenses already paid',
      "Any other adjustments that should appear on this month's payslips",
      '',
      'You can post payroll manually at any time before the automatic run. Once posted, the automatic run for this period will be skipped.',
      '',
      'Kind regards,',
      'iTreq Inc Payroll',
    ].join('\n')
    const result = await sendViaResend({
      to: String(admin.email),
      subject: 'Reminder: Payroll will run today — please finalise staff records',
      text,
    })
    if (result.sent) sent += 1
  }

  await supabase
    .from('company_settings')
    .update({ payroll_reminder_sent_for: today })
    .eq('id', 1)

  return json(200, {
    success: true,
    payday,
    emails_sent: sent,
    recipients: admins.length,
  })
}

async function handleAutoPostPayRunIfDue(
  supabase: ReturnType<typeof adminClient>,
  req: Request,
  body: Record<string, unknown>,
) {
  const gate = await requireCronOrAdmin(supabase, req, body)
  if (gate.error) return gate.error

  const settings = await loadSettings(supabase)
  const today = ymdInTz()
  const payday = nextPayrollDate(settings, today)
  if (payday !== today) {
    return json(200, { success: true, skipped: true, reason: 'not_payday', today, next_payday: payday })
  }

  const periodYear = Number(payday.slice(0, 4))
  const periodMonth = Number(payday.slice(5, 7))
  const monthYear = formatMonthYear(periodYear, periodMonth)
  const paydayLabel = formatPaydayDdMmYyyy(payday)
  const currency = String(settings.currency || 'BWP')

  const { data: existing } = await supabase
    .from('pay_runs')
    .select('id, status')
    .eq('period_year', periodYear)
    .eq('period_month', periodMonth)
    .maybeSingle()
  if (existing?.status === 'posted') {
    return json(200, { success: true, skipped: true, reason: 'already_posted' })
  }

  const admins = await listAdminRecipients(supabase)

  try {
    const postRes = await handlePostPayRun(supabase, req, {
      ...body,
      payday,
      period_year: periodYear,
      period_month: periodMonth,
      notes: body.notes || 'Automatic end-of-day payroll run',
    })
    const postBody = await postRes.json() as {
      success?: boolean
      message?: string
      staff_paid?: number
      total_net?: number
      payslips?: unknown[]
    }
    if (!postRes.ok || postBody.success === false) {
      const errMsg = postBody.message || `HTTP ${postRes.status}`
      for (const admin of admins) {
        const text = [
          `Hello ${displayFirstName(admin)},`,
          '',
          `The automatic payroll run for ${monthYear} (payday ${paydayLabel}) did not complete successfully.`,
          '',
          `Error: ${errMsg}`,
          '',
          'Please review staff and payroll records, then post payroll manually from Staff / Payroll. If the problem continues, check server logs for the payroll function.',
          '',
          'Kind regards,',
          'iTreq Inc Payroll',
        ].join('\n')
        await sendViaResend({
          to: String(admin.email),
          subject: `Payroll auto-run failed — ${monthYear}`,
          text,
        })
      }
      return json(postRes.status, { ...postBody, emails_notified: admins.length })
    }

    const staffPaid = Number(postBody.staff_paid ?? postBody.payslips?.length) || 0
    const totalNet = Number(postBody.total_net) || 0
    for (const admin of admins) {
      const text = [
        `Hello ${displayFirstName(admin)},`,
        '',
        `Payroll for ${monthYear} (payday ${paydayLabel}) has been posted successfully.`,
        '',
        `Staff paid: ${staffPaid}`,
        `Total net pay recorded: ${formatMoney(totalNet, currency)}`,
        '',
        "Each person's net pay is listed under Expenses. You can review the run and payslips in Staff / Payroll.",
        '',
        'Kind regards,',
        'iTreq Inc Payroll',
      ].join('\n')
      await sendViaResend({
        to: String(admin.email),
        subject: `Payroll completed — ${monthYear}`,
        text,
      })
    }

    return json(200, {
      ...postBody,
      auto: true,
      emails_notified: admins.length,
    })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unexpected error'
    for (const admin of admins) {
      const text = [
        `Hello ${displayFirstName(admin)},`,
        '',
        `The automatic payroll run for ${monthYear} (payday ${paydayLabel}) did not complete successfully.`,
        '',
        `Error: ${errMsg}`,
        '',
        'Please review staff and payroll records, then post payroll manually from Staff / Payroll. If the problem continues, check server logs for the payroll function.',
        '',
        'Kind regards,',
        'iTreq Inc Payroll',
      ].join('\n')
      await sendViaResend({
        to: String(admin.email),
        subject: `Payroll auto-run failed — ${monthYear}`,
        text,
      })
    }
    throw err
  }
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
      case 'latest_pay_run':
        return await handleLatestPayRun(supabase, req, body)
      case 'reverse_latest_pay_run':
        return await handleReverseLatestPayRun(supabase, req, body)
      case 'list_payslips':
        return await handleListPayslips(supabase, req, body)
      case 'get_payslip':
        return await handleGetPayslip(supabase, req, body)
      case 'update_payday_settings':
        return await handleUpdatePaydaySettings(supabase, req, body)
      case 'payday_morning_reminder':
        return await handlePaydayMorningReminder(supabase, req, body)
      case 'auto_post_pay_run_if_due':
        return await handleAutoPostPayRunIfDue(supabase, req, body)
      default:
        return json(400, { success: false, message: `Unknown action: ${action}` })
    }
  } catch (err) {
    console.error('payroll error:', err)
    const message = err instanceof Error ? err.message : 'Unexpected error'
    return json(500, { success: false, message })
  }
})
