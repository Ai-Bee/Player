
import { ensureSupabase } from './supabaseClient';
import { Screen } from './types';

// Fetch a screen by pairing code directly from Supabase
export async function getScreenByCode(code: string): Promise<Screen | null> {
  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from('screens')
    .select('id, screen_code, resolution_id, assigned_playlist_id, paired_at')
    .eq('pairing_code', code)
    .single();
  if (error) {
    // Gracefully handle 'not found' error (PGRST116)
    if (error.code === 'PGRST116' || error.message?.includes('0 rows')) {
      return null;
    }
    // Optionally, log or rethrow other errors
    // console.error(error);
    return null;
  }
  // Map database column names to Screen type
  return {
    id: data.id,
    code: data.screen_code,
    resolution_id: data.resolution_id,
    playlistId: data.assigned_playlist_id,
    paired_at: data.paired_at,
  };
}
