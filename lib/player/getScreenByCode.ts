import { ensureSupabase } from './supabaseClient';
import { Screen } from './types';

// Simple JWT decoder
function parseJwt(token: string) {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch (e) {
    return null;
  }
}

// Fetch the paired screen securely using the device token
export async function getScreenByCode(_code: string): Promise<Screen | null> {
  let token;
  if (typeof window !== 'undefined') {
    token = localStorage.getItem('player_device_token');
  }
  if (!token) return null;
  
  const decoded = parseJwt(token);
  if (!decoded || !decoded.screen_id) return null;

  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from('screens')
    .select('id, screen_code, resolution_id, assigned_playlist_id, paired_at')
    .eq('id', decoded.screen_id)
    .single();

  // If no data, or if paired_at is null (meaning it was unpaired), return null
  if (error || !data || !data.paired_at) {
    return null;
  }
  
  return {
    id: data.id,
    code: data.screen_code,
    resolution_id: data.resolution_id,
    playlistId: data.assigned_playlist_id,
    paired_at: data.paired_at,
  };
}
