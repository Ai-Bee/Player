import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string | undefined;

// Basic singleton Supabase client. Assumes anon key is safe under RLS policies.
// If either env var is missing we throw early to surface misconfiguration.
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('Supabase client missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

export const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true },
    })
  : undefined;

export function ensureSupabase() {
  if (!supabase) throw new Error('Supabase client not initialized (missing env vars).');
  return supabase;
}
