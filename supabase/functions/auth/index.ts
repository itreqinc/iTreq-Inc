import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const OTP_TTL_MS = 10 * 60 * 1000
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
const OTP_LENGTH = 6

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

function smsStubEnabled() {
  if (isProduction()) return false
  const provider = String(Deno.env.get('SMS_PROVIDER') || '').trim()
  if (provider) return false
  const flag = String(Deno.env.get('AUTH_SMS_STUB') || 'true').trim().toLowerCase()
  return flag !== 'false'
}

function emailStubEnabled() {
  if (isProduction()) return false
  if (Deno.env.get('RESEND_API_KEY')) return false
  return true
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

function publicUser(row: Record<string, unknown>) {
  return {
    id: row.id,
    role: row.role,
    name: row.name,
    email: row.email ?? null,
    phone: row.phone ?? null,
    client_id: row.client_id ?? null,
  }
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
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()
  const { error } = await supabase.from('auth_sessions').insert({
    user_id: userId,
    token_hash: tokenHash,
    expires_at: expiresAt,
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

async function loadSessionUser(
  supabase: ReturnType<typeof adminClient>,
  token: string,
) {
  if (!token) return null
  const tokenHash = await sha256Hex(token)
  const now = new Date().toISOString()
  const { data: session, error } = await supabase
    .from('auth_sessions')
    .select('id, user_id, expires_at, revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle()
  if (error) throw error
  if (!session || session.revoked_at || session.expires_at < now) return null

  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('*')
    .eq('id', session.user_id)
    .eq('is_active', true)
    .maybeSingle()
  if (userErr) throw userErr
  return user
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
  return json(200, {
    success: true,
    user: publicUser(user),
    session_token: sessionToken,
  })
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
  return json(200, {
    success: true,
    user: publicUser(user),
    session_token: sessionToken,
  })
}

async function handleValidateSession(
  supabase: ReturnType<typeof adminClient>,
  req: Request,
  body: Record<string, unknown>,
) {
  const token =
    bearerToken(req) || String(body.session_token || '').trim()
  const user = await loadSessionUser(supabase, token)
  if (!user) {
    return json(401, { success: false, message: 'Session expired. Please sign in again.' })
  }
  return json(200, { success: true, user: publicUser(user) })
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

async function handleListUsersDev(supabase: ReturnType<typeof adminClient>) {
  if (!canDevImpersonate()) {
    return json(403, { success: false, message: 'Dev user list is disabled.' })
  }
  const { data, error } = await supabase
    .from('users')
    .select('id, name, email, phone, role, client_id, is_active')
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
  return json(200, {
    success: true,
    user: publicUser(user),
    session_token: sessionToken,
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
