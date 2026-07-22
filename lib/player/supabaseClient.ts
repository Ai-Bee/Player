import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string | undefined;

let supabaseInstance: SupabaseClient | undefined;

export function initializeSupabase(token?: string) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase client missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
  
  const customFetch = (url: RequestInfo | URL, init?: RequestInit) => {
    return fetch(url, { ...init, cache: 'no-store' });
  };

  const options: any = {
    auth: { persistSession: false },
    global: {
      fetch: customFetch
    }
  };

  if (token) {
    options.global.headers = {
      Authorization: `Bearer ${token}`
    };
  }

  supabaseInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, options);
  
  if (token) {
    supabaseInstance.realtime.setAuth(token);
  }
  
  return supabaseInstance;
}

export function ensureSupabase() {
  if (!supabaseInstance) {
    let token;
    if (typeof window !== 'undefined') {
      token = localStorage.getItem('player_device_token') || undefined;
    }
    initializeSupabase(token);
  }
  return supabaseInstance!;
}
