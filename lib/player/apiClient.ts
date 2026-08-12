import { ApiResult, TickerConfig, TickerContent, PairingInfo, HeartbeatPayload, ScreenConfigPayload } from './types';
import { ensureSupabase } from './supabaseClient';
import { axiosInstance } from './axiosInstance';

// API client using Supabase directly instead of REST endpoints
// Fetches data from Supabase tables with proper RLS policies

interface RequestOptions {
  signal?: AbortSignal;
  retries?: number;
  retryDelayMs?: number;
}

async function withRetry<T>(
  fn: () => Promise<{ data: T | null; error: unknown }>,
  opts: RequestOptions = {}
): Promise<ApiResult<T>> {
  const { retries = 2, retryDelayMs = 500, signal } = opts;

  let attempt = 0;
  while (attempt <= retries) {
    if (signal?.aborted) {
      return { ok: false, error: 'aborted' };
    }

    try {
      const { data, error } = await fn();

      if (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (attempt === retries) {
          return { ok: false, error: message };
        }
        await new Promise(r => setTimeout(r, retryDelayMs * Math.pow(2, attempt)));
        attempt++;
        continue;
      }

      if (!data) {
        return { ok: false, error: 'No data returned' };
      }

      return { ok: true, data };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { ok: false, error: 'aborted' };
      }
      // 401 Unauthorized (screen unpaired) — bail immediately, do not retry
      if ((err as any)?.isUnpaired) {
        return { ok: false, error: 'SCREEN_UNPAIRED' };
      }
      if (attempt === retries) {
        const message = err instanceof Error ? err.message : 'network error';
        return { ok: false, error: message };
      }
      await new Promise(r => setTimeout(r, retryDelayMs * Math.pow(2, attempt)));
      attempt++;
    }
  }
  return { ok: false, error: 'unreachable' };
}


// Fetch ticker content for current user
export async function fetchTicker(signal?: AbortSignal): Promise<ApiResult<TickerContent>> {
  const supabase = ensureSupabase();

  return withRetry(async () => {
    const { data, error } = await supabase
      .from('ticker_quotes')
      .select('*')
      .order('symbol');

    if (error) throw error;

    // Build HTML content from quotes
    const quotes = data || [];
    const html = quotes.map((q: {
      symbol: string;
      price: number;
      change: number;
      change_percent: number;
    }) => {
      const changeSign = q.change >= 0 ? '+' : '';
      return `<span class="ticker-item">${q.symbol}: $${q.price} (${changeSign}${q.change_percent}%)</span>`;
    }).join(' • ');

    return { data: { html }, error: null };
  }, { signal });
}

// Fetch ticker config for current user
export async function fetchTickerConfig(signal?: AbortSignal): Promise<ApiResult<TickerConfig>> {
  const supabase = ensureSupabase();

  return withRetry(async () => {
    const { data, error } = await supabase
      .from('ticker_configs')
      .select('*')
      .single();

    if (error) {
      // If no config exists, return default
      if (error.code === 'PGRST116') {
        return {
          data: {
            enabled: false,
            position: 'bottom' as const,
            speed: 50,
          },
          error: null
        };
      }
      throw error;
    }

    return {
      data: {
        enabled: data.enabled,
        position: 'bottom' as const, // Would need a column in DB for this
        speed: 50, // Would need a column in DB for this
      },
      error: null
    };
  }, { signal });
}

// Create pairing - would need implementation based on your pairing flow
export async function createPairing(): Promise<ApiResult<PairingInfo>> {
  // This would need to create a device and potentially a screen
  // For now, return a placeholder
  return { ok: false, error: 'Pairing via API not implemented - use device pairing flow' };
}

export async function fetchScreenConfig(signal?: AbortSignal): Promise<ApiResult<ScreenConfigPayload>> {
  return withRetry(async () => {
    try {
      const response = await axiosInstance.get<ScreenConfigPayload>('/api/player/screen-config', { signal });
      return { data: response.data, error: null };
    } catch (err: any) {
      // 401 means the screen was unpaired — throw a sentinel so withRetry skips retries
      if (err?.response?.status === 401) {
        throw Object.assign(new Error('SCREEN_UNPAIRED'), { isUnpaired: true });
      }
      if (err.response?.data?.message) {
        throw new Error(err.response.data.message);
      }
      throw err;
    }
  }, { signal });
}



// Heartbeat - update screen status
export async function heartbeat(screenId: string, payload: HeartbeatPayload, signal?: AbortSignal): Promise<ApiResult<{ ok: boolean }>> {
  const supabase = ensureSupabase();

  return withRetry(async () => {
    const { error } = await supabase
      .from('screens')
      .update({
        status: payload.online ? 'online' : 'offline',
        last_seen_at: new Date().toISOString(),
      })
      .eq('id', screenId);

    if (error) throw error;

    return { data: { ok: true }, error: null };
  }, { signal });
}

export function abortableTimeout(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(id);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
}

export function subscribeToScreenInvalidations(
  screenId: string,
  groupId: string | null,
  onInvalidate: () => void
) {
  const supabase = ensureSupabase();
  
  const channels = [
    supabase.channel(`public:screens:${screenId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'screens', filter: `id=eq.${screenId}` }, () => onInvalidate())
      .subscribe(),
    
    supabase.channel(`public:screen_zone_content:${screenId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'screen_zone_content', filter: `screen_id=eq.${screenId}` }, () => onInvalidate())
      .subscribe()
  ];

  if (groupId) {
    channels.push(
      supabase.channel(`public:screen_groups:${groupId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'screen_groups', filter: `id=eq.${groupId}` }, () => onInvalidate())
        .subscribe(),
      
      supabase.channel(`public:group_zone_content:${groupId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'group_zone_content', filter: `group_id=eq.${groupId}` }, () => onInvalidate())
        .subscribe()
    );
  }

  return () => {
    channels.forEach(ch => supabase.removeChannel(ch));
  };
}

