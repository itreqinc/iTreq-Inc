import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { corsHeaders, fail, json } from '../_shared/http.ts'
import { adminClient, requireStaffOps } from '../_shared/session.ts'

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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json(405, { message: 'Method not allowed' })
  }

  try {
    const supabase = adminClient()
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const gate = await requireStaffOps(supabase, req, body)
    if (gate.error) return gate.error

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    const FROM =
      Deno.env.get('OPS_EMAIL_FROM')?.trim() ||
      Deno.env.get('RESEND_FROM')?.trim() ||
      'iTreq Inc <no-reply@itreqinc.com>'

    if (!RESEND_API_KEY) {
      return fail(
        503,
        'Email is not configured yet (missing RESEND_API_KEY on the server). Use Print / Save PDF or configure Resend in Supabase.',
      )
    }

    const to = String(body?.to || '').trim()
    const subject = String(body?.subject || '').trim()
    const html = String(body?.html || '')
    const text = String(body?.text || '')

    if (!to || !subject || !html) {
      return fail(400, 'Missing to, subject, or html.')
    }

    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRe.test(to)) {
      return fail(400, 'Invalid recipient email.')
    }

    await sendViaResend(RESEND_API_KEY, FROM, to, subject, html, text || subject)
    return json(200, { ok: true, success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    return fail(500, message)
  }
})
