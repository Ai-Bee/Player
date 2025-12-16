import { QueueEntry } from './types';

const KEY = 'player_queue_cache_v1';

export function saveQueue(entries: QueueEntry[]) {
  try {
    const payload = entries.map(e => ({
      itemId: e.itemId,
      mediaId: e.mediaId,
      title: e.title,
      type: e.type,
      src: e.src,
      duration: e.duration,
      mute: e.mute,
      startUnix: e.startUnix,
      endUnix: e.endUnix,
    }));
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // ignore serialization errors
  }
}

export function loadQueue(): QueueEntry[] | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as QueueEntry[];
    return parsed;
  } catch {
    return null;
  }
}