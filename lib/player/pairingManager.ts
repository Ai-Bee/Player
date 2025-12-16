import { PairingInfo } from './types';
import { createPairing, getScreen } from './apiClient';

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
}

// Attempts to get existing pairing or create a new one.
export async function getOrCreatePairing(): Promise<PairingInfo> {
  const existing = loadPairing();
  if (existing) {
    // Validate screen still exists & maybe playlist assignment updated.
    const screenRes = await getScreen(existing.screenId);
    if (screenRes.ok) {
      const latest = { screenId: screenRes.data.id, playlistId: screenRes.data.playlistId };
      savePairing(latest);
      return latest;
    } else {
      clearPairing();
    }
  }
  const res = await createPairing();
  if (!res.ok) throw new Error('Failed to pair screen: ' + res.error);
  savePairing(res.data);
  return res.data;
}
