import { createClient } from '@supabase/supabase-js'

export const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim()
export const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

/**
 * Browser-safe Supabase client using the anon key.
 * Access is controlled by Row Level Security (RLS) on each table.
 */
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null
