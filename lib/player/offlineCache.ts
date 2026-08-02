import { ScreenConfigPayload } from './types';

const KEY = 'player_config_cache_v2';

export function saveConfig(config: ScreenConfigPayload) {
  try {
    localStorage.setItem(KEY, JSON.stringify(config));
  } catch {
    // ignore serialization errors
  }
}

export function loadConfig(): ScreenConfigPayload | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ScreenConfigPayload;
    return parsed;
  } catch {
    return null;
  }
}