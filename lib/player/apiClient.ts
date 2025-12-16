import { ApiResult, MediaItem, Playlist, TickerConfig, TickerContent, PairingInfo, HeartbeatPayload } from './types';
import { ensureSupabase } from './supabaseClient';

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

// Fetch playlist assigned to a screen
export async function fetchPlaylist(screenId: string, signal?: AbortSignal): Promise<ApiResult<Playlist>> {
  const supabase = ensureSupabase();
  
  return withRetry(async () => {
    // Get the screen with its assigned playlist
    const { data: screen, error: screenError } = await supabase
      .from('screens')
      .select('assigned_playlist_id')
      .eq('id', screenId)
      .single();
    
    if (screenError) throw screenError;
    if (!screen?.assigned_playlist_id) {
      throw new Error('Screen has no assigned playlist');
    }
    
    const playlistResult = await fetchPlaylistById(screen.assigned_playlist_id, signal);
    if (!playlistResult.ok) throw new Error(playlistResult.error);
    
    return { data: playlistResult.data, error: null };
  }, { signal });
}

// Fetch playlist by ID with its items and media
export async function fetchPlaylistById(playlistId: string, signal?: AbortSignal): Promise<ApiResult<Playlist>> {
  const supabase = ensureSupabase();
  
  return withRetry(async () => {
    // Fetch playlist with items (joined with media for order)
    const { data: playlist, error: playlistError } = await supabase
      .from('playlists')
      .select(`
        id,
        name,
        description,
        playlist_items (
          id,
          media_id,
          order_index,
          added_at
        )
      `)
      .eq('id', playlistId)
      .single();
    
    if (playlistError) {
      // Check if it's a "no rows found" error
      if (playlistError.code === 'PGRST116') {
        throw new Error(`Playlist not found: ${playlistId}`);
      }
      throw playlistError;
    }
    if (!playlist) throw new Error('Playlist not found');
    
    // Transform to expected Playlist format
    const items = (playlist.playlist_items || []).map((item: {
      id: string;
      media_id: string;
      order_index: number | null;
      added_at: string;
    }) => ({
      id: item.id,
      mediaId: item.media_id,
      order: item.order_index || 0,
      overrides: {} // Overrides would come from a separate column if implemented
    }));
    
    // Sort by order
    items.sort((a, b) => a.order - b.order);
    
    return {
      data: {
        id: playlist.id,
        name: playlist.name,
        description: playlist.description || '',
        items,
      },
      error: null
    };
  }, { signal });
}

// Fetch multiple media items by IDs
export async function fetchMediaBatch(ids: string[], signal?: AbortSignal): Promise<ApiResult<MediaItem[]>> {
  const supabase = ensureSupabase();
  
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('media')
      .select('*')
      .in('id', ids);
    
    if (error) throw error;
    
    // MediaItem uses snake_case matching DB schema
    return { data: data || [], error: null };
  }, { signal });
}

// Fetch single media item
export async function fetchMedia(id: string, signal?: AbortSignal): Promise<ApiResult<MediaItem>> {
  const result = await fetchMediaBatch([id], signal);
  if (!result.ok) return result;
  if (result.data.length === 0) {
    return { ok: false, error: 'Media not found' };
  }
  return { ok: true, data: result.data[0] };
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

// Get screen by ID
export async function getScreen(screenId: string, signal?: AbortSignal): Promise<ApiResult<{ id: string; playlistId?: string | null }>> {
  const supabase = ensureSupabase();
  
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('screens')
      .select('id, assigned_playlist_id')
      .eq('id', screenId)
      .single();
    
    if (error) throw error;
    
    return {
      data: {
        id: data.id,
        playlistId: data.assigned_playlist_id,
      },
      error: null
    };
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
