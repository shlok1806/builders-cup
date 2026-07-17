import { createClient } from '@supabase/supabase-js'

// Server-side: service role, bypasses RLS (which is off anyway).
export const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })

// Browser: anon key, used for Realtime subscriptions.
export const browser = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
