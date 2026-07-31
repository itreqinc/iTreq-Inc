import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const OTP_TTL_MS = 10 * 60 * 1000
const SESSION_TTL_MS = 24 * 60 * 60 * 1000
/** When remaining lifetime is below this, push expires_at out by a full SESSION_TTL. */
const SESSION_SLIDE_REMAINING_MS = 2 * 60 * 60 * 1000
/** Hard idle cutoff: no validate_session activity for this long → session dead. */
const SESSION_IDLE_MS = 8 * 60 * 60 * 1000
const OTP_LENGTH = 6
const PBKDF2_ITERATIONS = 100_000
const DEFAULT_INVITE_PASSWORD = 'password123'
const OPS_TZ = 'Africa/Gaborone'
const OPS_START_HOUR = 7
const OPS_END_HOUR = 18

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function appEnv() {
  return String(Deno.env.get('APP_ENV') || '').trim().toLowerCase()
}

function isProduction() {
  return appEnv() === 'production'
}

function canDevImpersonate() {
  if (isProduction()) return false
  return String(Deno.env.get('ALLOW_DEV_IMPERSONATE') || '').trim().toLowerCase() === 'true'
}

function emailStubEnabled() {
  if (isProduction()) return false
  if (Deno.env.get('RESEND_API_KEY')) return false
  return true
}

function smsStubEnabled() {
  if (isProduction()) return false
  const provider = String(Deno.env.get('SMS_PROVIDER') || '').trim()
  if (provider) return false
  const flag = String(Deno.env.get('AUTH_SMS_STUB') || 'true').trim().toLowerCase()
  return flag !== 'false'
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

function hexToBytes(hex: string) {
  const clean = hex.trim()
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

async function sha256Hex(value: string) {
  const data = new TextEncoder().encode(value)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return bytesToHex(hash)
}

async function hashPassword(password: string, iterations = PBKDF2_ITERATIONS) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    256,
  )
  return `pbkdf2$${iterations}$${bytesToHex(salt)}$${bytesToHex(bits)}`
}

async function verifyPassword(password: string, stored: string) {
  const parts = String(stored || '').split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false
  const iterations = Number(parts[1])
  const salt = hexToBytes(parts[2])
  const expected = parts[3].toLowerCase()
  if (!iterations || !salt.length || !expected) return false

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    256,
  )
  const actual = bytesToHex(bits)
  if (actual.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < actual.length; i++) {
    diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return diff === 0
}

function randomOtp() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000
  return String(n).padStart(OTP_LENGTH, '0')
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return bytesToHex(bytes)
}

function truncateEmail(email: string) {
  const value = String(email || '').trim()
  const at = value.indexOf('@')
  if (at <= 0) return value
  return `${value.slice(0, 1)}***@${value.slice(at + 1)}`
}

function isWithinOpsHours(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: OPS_TZ,
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
    minute: 'numeric',
  })
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((p) => [p.type, p.value]),
  )
  const weekday = parts.weekday
  if (weekday === 'Sat' || weekday === 'Sun') return false
  const hour = Number(parts.hour === '24' ? 0 : parts.hour)
  const minute = Number(parts.minute)
  const mins = hour * 60 + minute
  return mins >= OPS_START_HOUR * 60 && mins < OPS_END_HOUR * 60
}

function computeOpsAccess(user: Record<string, unknown>) {
  const role = String(user.role || '')
  if (role === 'admin') {
    return { allowed: true, reason: 'admin', after_hours_until: user.after_hours_until ?? null }
  }
  if (role !== 'staff') {
    return { allowed: false, reason: 'not_staff', after_hours_until: null }
  }
  const untilRaw = user.after_hours_until ? String(user.after_hours_until) : ''
  if (untilRaw) {
    const until = new Date(untilRaw).getTime()
    if (!Number.isNaN(until) && Date.now() < until) {
      return { allowed: true, reason: 'delegated', after_hours_until: user.after_hours_until }
    }
  }
  if (isWithinOpsHours()) {
    return { allowed: true, reason: 'business_hours', after_hours_until: user.after_hours_until ?? null }
  }
  return {
    allowed: false,
    reason: 'outside_hours',
    after_hours_until: user.after_hours_until ?? null,
  }
}

function publicUser(row: Record<string, unknown>) {
  return {
    id: row.id,
    role: row.role,
    name: row.name,
    first_name: row.first_name ?? null,
    middle_name: row.middle_name ?? null,
    surname: row.surname ?? null,
    gender: row.gender ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    client_id: row.client_id ?? null,
    must_change_password: !!row.must_change_password,
    invited_at: row.invited_at ?? null,
    first_login_at: row.first_login_at ?? null,
    after_hours_until: row.after_hours_until ?? null,
    job_title: row.job_title ?? null,
  }
}

/** Attach organizational job title from staff_employment (not users.role). */
async function publicUserWithEmployment(
  supabase: ReturnType<typeof adminClient>,
  row: Record<string, unknown>,
) {
  const role = String(row.role || '')
  if (role !== 'staff' && role !== 'admin') return publicUser(row)
  const { data: emp, error } = await supabase
    .from('staff_employment')
    .select('job_title')
    .eq('user_id', row.id)
    .maybeSingle()
  if (error) throw error
  if (!emp?.job_title) return publicUser(row)
  return publicUser({ ...row, job_title: emp.job_title })
}

function buildDisplayName(parts: {
  first_name?: unknown
  middle_name?: unknown
  surname?: unknown
  name?: unknown
}) {
  const joined = [parts.first_name, parts.middle_name, parts.surname]
    .map((p) => String(p || '').trim())
    .filter(Boolean)
    .join(' ')
  return joined || String(parts.name || '').trim() || 'User'
}

function normalizeGender(value: unknown) {
  const g = String(value || '').trim().toUpperCase()
  return g === 'M' || g === 'F' ? g : null
}

function bearerToken(req: Request) {
  const h = req.headers.get('Authorization') || ''
  const m = /^Bearer\s+(.+)$/i.exec(h)
  return m?.[1]?.trim() || ''
}

async function sendViaResend(
  apiKey: string,
  from: string,
  to: string,
  subject: string,
  html: string,
  text: string,
) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
      text,
    }),
  })
  if (!res.ok) {
    const errText = await res.text()
    console.error('Resend error:', errText)
    throw new Error('Could not send email. Check Resend configuration.')
  }
}

async function findUserByDestination(
  supabase: ReturnType<typeof adminClient>,
  channel: string,
  destination: string,
) {
  if (channel === 'email') {
    const email = destination.trim().toLowerCase()
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .ilike('email', email)
      .eq('is_active', true)
      .maybeSingle()
    if (error) throw error
    return data
  }

  const phone = destination.trim()
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('phone', phone)
    .eq('is_active', true)
    .maybeSingle()
  if (error) throw error
  return data
}

async function findUserByLogin(
  supabase: ReturnType<typeof adminClient>,
  login: string,
) {
  const value = login.trim()
  if (!value) return null
  if (value.includes('@')) {
    return findUserByDestination(supabase, 'email', value)
  }
  return findUserByDestination(supabase, 'sms', value)
}

async function createSession(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
) {
  const token = randomToken()
  const tokenHash = await sha256Hex(token)
  const nowIso = new Date().toISOString()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()
  const { error } = await supabase.from('auth_sessions').insert({
    user_id: userId,
    token_hash: tokenHash,
    expires_at: expiresAt,
    last_activity_at: nowIso,
  })
  if (error) throw error
  return token
}

async function revokeSessionToken(
  supabase: ReturnType<typeof adminClient>,
  token: string,
) {
  if (!token) return
  const tokenHash = await sha256Hex(token)
  await supabase
    .from('auth_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('token_hash', tokenHash)
    .is('revoked_at', null)
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

async function touchSessionActivity(
  supabase: ReturnType<typeof adminClient>,
  sessionId: string,
) {
  await supabase
    .from('auth_sessions')
    .update({ last_activity_at: new Date().toISOString() })
    .eq('id', sessionId)
    .is('revoked_at', null)
}

async function loadSessionUser(
  supabase: ReturnType<typeof adminClient>,
  token: string,
  opts: { recordActivity?: boolean } = {},
) {
  if (!token) return null
  const tokenHash = await sha256Hex(token)
  const nowIso = new Date().toISOString()
  const { data: session, error } = await supabase
    .from('auth_sessions')
    .select('id, user_id, expires_at, revoked_at, last_activity_at')
    .eq('token_hash', tokenHash)
    .maybeSingle()
  if (error) throw error
  if (!session || session.revoked_at || session.expires_at < nowIso) return null
  if (isSessionIdle(session.last_activity_at)) return null

  if (opts.recordActivity) {
    await touchSessionActivity(supabase, session.id)
  }

  await maybeSlideSession(supabase, session)

  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('*')
    .eq('id', session.user_id)
    .eq('is_active', true)
    .maybeSingle()
  if (userErr) throw userErr
  return user
}

async function requireStaffOps(
  supabase: ReturnType<typeof adminClient>,
  req: Request,
  body: Record<string, unknown>,
) {
  const token = bearerToken(req) || String(body.session_token || '').trim()
  const user = await loadSessionUser(supabase, token)
  if (!user) {
    return { error: json(401, { success: false, message: 'Session expired. Please sign in again.' }) }
  }
  const role = String(user.role)
  if (role !== 'staff' && role !== 'admin') {
    return { error: json(403, { success: false, message: 'Staff access required.' }) }
  }
  const ops = computeOpsAccess(user)
  if (!ops.allowed) {
    return {
      error: json(403, {
        success: false,
        message:
          'Ops is available Monday–Friday 07:00–18:00 (Africa/Gaborone), unless an admin grants after-hours access.',
        ops_access: ops,
      }),
    }
  }
  return { user, ops }
}

async function markFirstLogin(
  supabase: ReturnType<typeof adminClient>,
  user: Record<string, unknown>,
) {
  if (user.first_login_at) return user
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('users')
    .update({ first_login_at: now, updated_at: now })
    .eq('id', user.id)
    .select('*')
    .single()
  if (error) throw error
  return data
}

async function authSuccessPayload(
  supabase: ReturnType<typeof adminClient>,
  userRow: Record<string, unknown>,
  sessionToken: string,
) {
  const user = await markFirstLogin(supabase, userRow)
  const ops_access = computeOpsAccess(user)
  return json(200, {
    success: true,
    user: await publicUserWithEmployment(supabase, user),
    session_token: sessionToken,
    ops_access,
  })
}

async function handleRequestOtp(
  supabase: ReturnType<typeof adminClient>,
  body: Record<string, unknown>,
) {
  const channel = String(body.channel || '').trim().toLowerCase()
  const destination = String(body.destination || '').trim()
  if (channel !== 'email' && channel !== 'sms') {
    return json(400, { success: false, message: 'channel must be email or sms' })
  }
  if (!destination) {
    return json(400, { success: false, message: 'destination is required' })
  }
  if (channel === 'email') {
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRe.test(destination)) {
      return json(400, { success: false, message: 'Invalid email address.' })
    }
  }

  const user = await findUserByDestination(supabase, channel, destination)
  if (!user) {
    return json(200, {
      success: true,
      message: 'If that account exists, a code was sent.',
    })
  }

  const code = randomOtp()
  const codeHash = await sha256Hex(code)
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString()

  await supabase
    .from('auth_otps')
    .update({ consumed_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('channel', channel)
    .is('consumed_at', null)

  const { error: insertErr } = await supabase.from('auth_otps').insert({
    user_id: user.id,
    channel,
    destination: channel === 'email' ? destination.toLowerCase() : destination,
    code_hash: codeHash,
    expires_at: expiresAt,
  })
  if (insertErr) throw insertErr

  let stubbed = false
  if (channel === 'email') {
    if (emailStubEnabled()) {
      stubbed = true
      console.log(`[auth] EMAIL OTP stub for ${destination}: ${code}`)
    } else {
      const apiKey = Deno.env.get('RESEND_API_KEY')!
      const from =
        Deno.env.get('OPS_EMAIL_FROM')?.trim() ||
        Deno.env.get('RESEND_FROM')?.trim() ||
        'iTreq Inc <no-reply@itreqinc.com>'
      await sendViaResend(
        apiKey,
        from,
        destination,
        'Your iTreq Inc login code',
        `<p>Your login code is <strong>${code}</strong>.</p><p>It expires in 10 minutes.</p>`,
        `Your login code is ${code}. It expires in 10 minutes.`,
      )
    }
  } else {
    if (!smsStubEnabled()) {
      return json(503, {
        success: false,
        message: 'SMS login is not available yet. Use email OTP or password.',
      })
    }
    stubbed = true
    console.log(`[auth] SMS OTP stub for ${destination}: ${code}`)
  }

  const payload: Record<string, unknown> = {
    success: true,
    message: stubbed
      ? 'Code generated (delivery stubbed for local/dev).'
      : 'If that account exists, a code was sent.',
    stub: stubbed,
  }
  if (stubbed && !isProduction()) {
    payload.dev_otp = code
  }
  return json(200, payload)
}

async function handleVerifyOtp(
  supabase: ReturnType<typeof adminClient>,
  body: Record<string, unknown>,
  req: Request,
) {
  const channel = String(body.channel || '').trim().toLowerCase()
  const destination = String(body.destination || '').trim()
  const code = String(body.code || '').trim()
  if (channel !== 'email' && channel !== 'sms') {
    return json(400, { success: false, message: 'channel must be email or sms' })
  }
  if (!destination || !code) {
    return json(400, { success: false, message: 'destination and code are required' })
  }

  const user = await findUserByDestination(supabase, channel, destination)
  if (!user) {
    return json(401, { success: false, message: 'Invalid or expired code.' })
  }

  const codeHash = await sha256Hex(code)
  const now = new Date().toISOString()
  const dest = channel === 'email' ? destination.toLowerCase() : destination

  const { data: otp, error } = await supabase
    .from('auth_otps')
    .select('*')
    .eq('user_id', user.id)
    .eq('channel', channel)
    .eq('destination', dest)
    .eq('code_hash', codeHash)
    .is('consumed_at', null)
    .gt('expires_at', now)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!otp) {
    return json(401, { success: false, message: 'Invalid or expired code.' })
  }

  await supabase
    .from('auth_otps')
    .update({ consumed_at: now })
    .eq('id', otp.id)

  const prev = bearerToken(req) || String(body.session_token || '').trim()
  if (prev) await revokeSessionToken(supabase, prev)

  const sessionToken = await createSession(supabase, user.id)
  return authSuccessPayload(supabase, user, sessionToken)
}

async function handleLoginPassword(
  supabase: ReturnType<typeof adminClient>,
  body: Record<string, unknown>,
  req: Request,
) {
  const login = String(body.login || body.email || body.phone || '').trim()
  const password = String(body.password || '')
  if (!login || !password) {
    return json(400, { success: false, message: 'login and password are required' })
  }

  const user = await findUserByLogin(supabase, login)
  if (!user || !user.password_hash) {
    return json(401, { success: false, message: 'Invalid login or password.' })
  }

  const ok = await verifyPassword(password, String(user.password_hash))
  if (!ok) {
    return json(401, { success: false, message: 'Invalid login or password.' })
  }

  const prev = bearerToken(req) || String(body.session_token || '').trim()
  if (prev) await revokeSessionToken(supabase, prev)

  const sessionToken = await createSession(supabase, user.id)
  return authSuccessPayload(supabase, user, sessionToken)
}

async function handleValidateSession(
  supabase: ReturnType<typeof adminClient>,
  req: Request,
  body: Record<string, unknown>,
) {
  const token =
    bearerToken(req) || String(body.session_token || '').trim()
  const user = await loadSessionUser(supabase, token, { recordActivity: true })
  if (!user) {
    return json(401, { success: false, message: 'Session expired. Please sign in again.' })
  }
  return json(200, {
    success: true,
    user: await publicUserWithEmployment(supabase, user),
    ops_access: computeOpsAccess(user),
  })
}

async function handleLogout(
  supabase: ReturnType<typeof adminClient>,
  req: Request,
  body: Record<string, unknown>,
) {
  const token =
    bearerToken(req) || String(body.session_token || '').trim()
  await revokeSessionToken(supabase, token)
  return json(200, { success: true })
}

async function handleChangePassword(
  supabase: ReturnType<typeof adminClient>,
  body: Record<string, unknown>,
  req: Request,
) {
  const token = bearerToken(req) || String(body.session_token || '').trim()
  const user = await loadSessionUser(supabase, token)
  if (!user) {
    return json(401, { success: false, message: 'Session expired. Please sign in again.' })
  }

  const currentPassword = String(body.current_password || '')
  const newPassword = String(body.new_password || '')
  if (newPassword.length < 8) {
    return json(400, { success: false, message: 'New password must be at least 8 characters.' })
  }

  if (!user.must_change_password) {
    if (!currentPassword || !user.password_hash) {
      return json(400, { success: false, message: 'Current password is required.' })
    }
    const ok = await verifyPassword(currentPassword, String(user.password_hash))
    if (!ok) {
      return json(401, { success: false, message: 'Current password is incorrect.' })
    }
  }

  const password_hash = await hashPassword(newPassword)
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('users')
    .update({
      password_hash,
      must_change_password: false,
      updated_at: now,
    })
    .eq('id', user.id)
    .select('*')
    .single()
  if (error) throw error

  return json(200, {
    success: true,
    user: await publicUserWithEmployment(supabase, data),
    ops_access: computeOpsAccess(data),
  })
}

async function handleUpdateProfile(
  supabase: ReturnType<typeof adminClient>,
  body: Record<string, unknown>,
  req: Request,
) {
  const token = bearerToken(req) || String(body.session_token || '').trim()
  const user = await loadSessionUser(supabase, token)
  if (!user) {
    return json(401, { success: false, message: 'Session expired. Please sign in again.' })
  }

  const first_name = String(body.first_name || '').trim()
  const middle_name = String(body.middle_name || '').trim() || null
  const surname = String(body.surname || '').trim()
  const phone = String(body.phone || '').trim() || null
  const gender = normalizeGender(body.gender)

  if (!first_name || !surname) {
    return json(400, { success: false, message: 'First name and last name are required.' })
  }
  if (!phone) {
    return json(400, { success: false, message: 'Phone number is required.' })
  }

  const name = buildDisplayName({ first_name, middle_name, surname })
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('users')
    .update({
      first_name,
      middle_name,
      surname,
      name,
      phone,
      gender,
      updated_at: now,
    })
    .eq('id', user.id)
    .select('*')
    .single()
  if (error) throw error

  return json(200, {
    success: true,
    user: await publicUserWithEmployment(supabase, data),
    ops_access: computeOpsAccess(data),
  })
}

async function handleInviteClient(
  supabase: ReturnType<typeof adminClient>,
  body: Record<string, unknown>,
  req: Request,
) {
  const gate = await requireStaffOps(supabase, req, body)
  if (gate.error) return gate.error

  const clientId = String(body.client_id || '').trim()
  if (!clientId) {
    return json(400, { success: false, message: 'client_id is required' })
  }

  const { data: client, error: clientErr } = await supabase
    .from('clients')
    .select('id, name, email, phone, cellphone, first_name, middle_name, surname, gender')
    .eq('id', clientId)
    .maybeSingle()
  if (clientErr) throw clientErr
  if (!client) {
    return json(404, { success: false, message: 'Client not found.' })
  }

  const email = String(client.email || '').trim().toLowerCase()
  if (!email) {
    return json(400, { success: false, message: 'Client needs an email before invite.' })
  }
  if (email === 'info@itreqinc.com') {
    return json(400, {
      success: false,
      message:
        'This client uses the office email placeholder and cannot receive a portal invite. Add their real email first.',
    })
  }
  const phone = String(client.cellphone || client.phone || '').trim() || null
  const first_name = String(client.first_name || '').trim() || null
  const middle_name = String(client.middle_name || '').trim() || null
  const surname = String(client.surname || '').trim() || null
  const gender = normalizeGender(client.gender)
  const name =
    buildDisplayName({ first_name, middle_name, surname, name: client.name }) || 'Client'
  const now = new Date().toISOString()
  const password_hash = await hashPassword(DEFAULT_INVITE_PASSWORD)

  const profileFields = {
    name,
    first_name,
    middle_name,
    surname,
    gender,
    email,
    phone,
  }

  const { data: existing } = await supabase
    .from('users')
    .select('*')
    .eq('client_id', clientId)
    .eq('role', 'client')
    .maybeSingle()

  let userRow
  if (existing) {
    if (existing.first_login_at && !existing.must_change_password) {
      return json(400, {
        success: false,
        message: 'This client already activated their portal login.',
      })
    }
    const { data, error } = await supabase
      .from('users')
      .update({
        ...profileFields,
        password_hash,
        must_change_password: true,
        invited_at: now,
        updated_at: now,
        is_active: true,
      })
      .eq('id', existing.id)
      .select('*')
      .single()
    if (error) throw error
    userRow = data
  } else {
    const { data, error } = await supabase
      .from('users')
      .insert({
        ...profileFields,
        password_hash,
        role: 'client',
        client_id: clientId,
        must_change_password: true,
        invited_at: now,
        is_active: true,
      })
      .select('*')
      .single()
    if (error) throw error
    userRow = data
  }

  const maskedEmail = truncateEmail(email)
  const phoneLine = phone || 'Not on file'
  const siteOrigin = (
    Deno.env.get('PUBLIC_SITE_URL') ||
    Deno.env.get('APP_PUBLIC_URL') ||
    'https://www.itreqinc.com'
  )
    .trim()
    .replace(/\/$/, '')
  const portalLoginUrl = `${siteOrigin}/login`
  const whatsappUrl = 'https://wa.me/26771573094'
  const whatsappDisplay = '+267 71 573 094'

  const subject = 'Your iTreq Inc client portal access'
  const text =
    `Hello ${name},\n\n` +
    `You now have access to the iTreq Inc client portal, where you can view your invoices, ` +
    `payments, and account balance online.\n\n` +
    `Sign in here: ${portalLoginUrl}\n\n` +
    `Your login details:\n` +
    `• Email: ${maskedEmail}\n` +
    `• Phone on file: ${phoneLine}\n` +
    `• Temporary password: ${DEFAULT_INVITE_PASSWORD}\n\n` +
    `Please sign in and change your password when prompted.\n\n` +
    `A note about your account: billing on this portal begins with your August invoice. ` +
    `Any balance brought forward from our previous system is reflected on your account. ` +
    `iTreq Inc retains full records from the previous system — if you would like access to ` +
    `those earlier statements or documents, please let us know.\n\n` +
    `Questions or need help getting started? Message us on WhatsApp: ${whatsappDisplay}\n` +
    `${whatsappUrl}\n\n` +
    `Thank you for trusting iTreq Inc.\n\n` +
    `— iTreq Inc`
  const html =
    `<p>Hello ${name},</p>` +
    `<p>You now have access to the <strong>iTreq Inc client portal</strong>, where you can view your invoices, payments, and account balance online.</p>` +
    `<p><a href="${portalLoginUrl}">Sign in to the portal</a><br/>` +
    `<span style="color:#666;font-size:13px">${portalLoginUrl}</span></p>` +
    `<p><strong>Your login details</strong></p>` +
    `<ul>` +
    `<li>Email: <strong>${maskedEmail}</strong></li>` +
    `<li>Phone on file: <strong>${phoneLine}</strong></li>` +
    `<li>Temporary password: <strong>${DEFAULT_INVITE_PASSWORD}</strong></li>` +
    `</ul>` +
    `<p>Please sign in and change your password when prompted.</p>` +
    `<p><strong>About your account</strong><br/>` +
    `Billing on this portal begins with your <strong>August invoice</strong>. ` +
    `Any balance brought forward from our previous system is reflected on your account. ` +
    `iTreq Inc retains full records from the previous system — if you would like access to those earlier statements or documents, please let us know.</p>` +
    `<p>Questions or need help getting started? Message us on WhatsApp: ` +
    `<a href="${whatsappUrl}">${whatsappDisplay}</a></p>` +
    `<p>Thank you for trusting iTreq Inc.</p>` +
    `<p>— iTreq Inc</p>`

  let stubbed = false
  if (emailStubEnabled()) {
    stubbed = true
    console.log(`[auth] INVITE EMAIL stub to ${email}:\n${text}`)
  } else {
    const apiKey = Deno.env.get('RESEND_API_KEY')!
    const from =
      Deno.env.get('OPS_EMAIL_FROM')?.trim() ||
      Deno.env.get('RESEND_FROM')?.trim() ||
      'iTreq Inc <no-reply@itreqinc.com>'
    await sendViaResend(apiKey, from, email, subject, html, text)
  }

  return json(200, {
    success: true,
    user: publicUser(userRow),
    stub: stubbed,
    message: stubbed
      ? 'Invite saved (email delivery stubbed for local/dev).'
      : 'Invite email sent.',
  })
}

async function handleListPortalInvites(
  supabase: ReturnType<typeof adminClient>,
  body: Record<string, unknown>,
  req: Request,
) {
  const gate = await requireStaffOps(supabase, req, body)
  if (gate.error) return gate.error

  const { data: clients, error: cErr } = await supabase
    .from('clients')
    .select('id, name, email, phone, cellphone, is_active')
    .order('name')
  if (cErr) throw cErr

  const activeClients = (clients || []).filter((c) => c.is_active !== false)
  const activeClientIds = new Set(activeClients.map((c) => String(c.id)))

  const { data: portalUsers, error: uErr } = await supabase
    .from('users')
    .select('id, client_id, email, phone, invited_at, first_login_at, must_change_password, name')
    .eq('role', 'client')
    .eq('is_active', true)
  if (uErr) throw uErr

  // Deactivate portal logins left behind after client delete / deactivate.
  const orphanIds = (portalUsers || [])
    .filter((u) => !u.client_id || !activeClientIds.has(String(u.client_id)))
    .map((u) => u.id)
  if (orphanIds.length) {
    await supabase
      .from('users')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .in('id', orphanIds)
  }

  const byClient = new Map(
    (portalUsers || [])
      .filter((u) => u.client_id && activeClientIds.has(String(u.client_id)))
      .map((u) => [u.client_id, u]),
  )

  const pending: Record<string, unknown>[] = []
  const notified: Record<string, unknown>[] = []

  for (const c of activeClients) {
    const email = String(c.email || '').trim()
    if (!email) continue
    const u = byClient.get(c.id)
    if (!u) {
      pending.push({
        client_id: c.id,
        client_name: c.name,
        email: c.email,
        phone: c.cellphone || c.phone || null,
      })
      continue
    }
    if (u.first_login_at) continue
    if (!u.invited_at) {
      pending.push({
        client_id: c.id,
        client_name: c.name,
        email: c.email,
        phone: c.cellphone || c.phone || null,
        user_id: u.id,
      })
    } else {
      notified.push({
        client_id: c.id,
        client_name: c.name,
        email: c.email,
        phone: c.cellphone || c.phone || null,
        user_id: u.id,
        invited_at: u.invited_at,
      })
    }
  }

  notified.sort((a, b) => String(b.invited_at).localeCompare(String(a.invited_at)))

  return json(200, { success: true, pending, notified })
}

async function handleSetAfterHours(
  supabase: ReturnType<typeof adminClient>,
  body: Record<string, unknown>,
  req: Request,
) {
  const token = bearerToken(req) || String(body.session_token || '').trim()
  const admin = await loadSessionUser(supabase, token)
  if (!admin || String(admin.role) !== 'admin') {
    return json(403, { success: false, message: 'Admin access required.' })
  }

  const userId = String(body.user_id || '').trim()
  if (!userId) {
    return json(400, { success: false, message: 'user_id is required' })
  }

  let afterHoursUntil: string | null = null
  if (body.after_hours_until !== null && body.after_hours_until !== undefined && body.after_hours_until !== '') {
    const d = new Date(String(body.after_hours_until))
    if (Number.isNaN(d.getTime())) {
      return json(400, { success: false, message: 'Invalid after_hours_until datetime.' })
    }
    afterHoursUntil = d.toISOString()
  }

  const { data: target, error: tErr } = await supabase
    .from('users')
    .select('id, role')
    .eq('id', userId)
    .maybeSingle()
  if (tErr) throw tErr
  if (!target || String(target.role) !== 'staff') {
    return json(400, { success: false, message: 'After-hours delegation applies to staff only.' })
  }

  const { data, error } = await supabase
    .from('users')
    .update({
      after_hours_until: afterHoursUntil,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select('id, name, email, role, after_hours_until')
    .single()
  if (error) throw error

  return json(200, { success: true, user: data })
}

async function handleListStaff(
  supabase: ReturnType<typeof adminClient>,
  body: Record<string, unknown>,
  req: Request,
) {
  const token = bearerToken(req) || String(body.session_token || '').trim()
  const admin = await loadSessionUser(supabase, token)
  if (!admin || String(admin.role) !== 'admin') {
    return json(403, { success: false, message: 'Admin access required.' })
  }

  const { data, error } = await supabase
    .from('users')
    .select('id, name, email, phone, role, client_id, after_hours_until, is_active')
    .eq('role', 'staff')
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  return json(200, { success: true, staff: data || [] })
}

async function handleListUsersDev(supabase: ReturnType<typeof adminClient>) {
  if (!canDevImpersonate()) {
    return json(403, { success: false, message: 'Dev user list is disabled.' })
  }
  const { data, error } = await supabase
    .from('users')
    .select('id, name, email, phone, role, client_id, is_active, must_change_password')
    .eq('is_active', true)
    .order('role')
    .order('name')
  if (error) throw error
  return json(200, { success: true, users: data || [] })
}

async function handleDevImpersonate(
  supabase: ReturnType<typeof adminClient>,
  body: Record<string, unknown>,
  req: Request,
) {
  if (!canDevImpersonate()) {
    return json(403, { success: false, message: 'Dev impersonation is disabled.' })
  }
  const userId = String(body.user_id || '').trim()
  if (!userId) {
    return json(400, { success: false, message: 'user_id is required' })
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .eq('is_active', true)
    .maybeSingle()
  if (error) throw error
  if (!user) {
    return json(404, { success: false, message: 'User not found.' })
  }

  const prev = bearerToken(req) || String(body.session_token || '').trim()
  if (prev) await revokeSessionToken(supabase, prev)

  const sessionToken = await createSession(supabase, user.id)
  return authSuccessPayload(supabase, user, sessionToken)
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
    if (!action) {
      return json(400, { success: false, message: 'action is required' })
    }

    const supabase = adminClient()

    switch (action) {
      case 'request_otp':
        return await handleRequestOtp(supabase, body)
      case 'verify_otp':
        return await handleVerifyOtp(supabase, body, req)
      case 'login_password':
        return await handleLoginPassword(supabase, body, req)
      case 'validate_session':
        return await handleValidateSession(supabase, req, body)
      case 'logout':
        return await handleLogout(supabase, req, body)
      case 'change_password':
        return await handleChangePassword(supabase, body, req)
      case 'update_profile':
        return await handleUpdateProfile(supabase, body, req)
      case 'invite_client':
        return await handleInviteClient(supabase, body, req)
      case 'list_portal_invites':
        return await handleListPortalInvites(supabase, body, req)
      case 'set_after_hours':
        return await handleSetAfterHours(supabase, body, req)
      case 'list_staff':
        return await handleListStaff(supabase, body, req)
      case 'list_users_dev':
        return await handleListUsersDev(supabase)
      case 'dev_impersonate':
        return await handleDevImpersonate(supabase, body, req)
      default:
        return json(400, { success: false, message: `Unknown action: ${action}` })
    }
  } catch (err) {
    console.error('auth error:', err)
    const message = err instanceof Error ? err.message : 'Unexpected error'
    return json(500, { success: false, message })
  }
})
