export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, accept, prefer',
  'Access-Control-Max-Age': '86400',
}

export function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function okData(data: unknown) {
  return json(200, { success: true, data })
}

export function fail(status: number, message: string, extra: Record<string, unknown> = {}) {
  return json(status, { success: false, message, ...extra })
}
