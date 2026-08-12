import { PairingInfo } from './types';
import { fetchScreenConfig } from './apiClient';
import { clearConfig } from './offlineCache';

const STORAGE_KEY = 'player_pairing_v1';

interface StoredPairing extends PairingInfo {
  pairedAt: number; // epoch ms
}

export function loadPairing(): PairingInfo | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: StoredPairing = JSON.parse(raw);
    return { screenId: parsed.screenId, playlistId: parsed.playlistId };
  } catch {
    return null;
  }
}

export function savePairing(info: PairingInfo) {
  const stored: StoredPairing = { ...info, pairedAt: Date.now() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
}

export function clearPairing() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem('player_device_token');
  localStorage.removeItem('player_pairing_code_v1');
  localStorage.removeItem('player_queue_cache_v1');
  clearConfig();
}

// Attempts to get existing pairing or create a new one.
export async function getOrCreatePairing(): Promise<PairingInfo> {
  const existing = loadPairing();
  if (existing) {
    // Validate screen still exists & maybe playlist assignment updated.
    try {
      const configRes = await fetchScreenConfig();
      if (configRes.ok) {
        return existing;
      } else {
        clearPairing();
      }
    } catch {
      clearPairing();
    }
  }
  throw new Error('Pairing via API not implemented - use device pairing flow');
}
