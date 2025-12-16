import { MediaItem, Playlist, QueueEntry, MIN_DURATION_SECONDS, DEFAULT_NONVIDEO_DURATION, FALLBACK_VIDEO_DURATION } from './types';
import { resolveMediaSrc } from './assetResolver';

export interface ResolveOptions {
  enforceMin?: boolean; // default true
  now?: number; // epoch ms for schedule boundary interpretation
}

export function resolvePlaylistToQueue(playlist: Playlist, mediaMap: Map<string, MediaItem>, opts: ResolveOptions = {}): QueueEntry[] {
  const { enforceMin = true, now = Date.now() } = opts;
  const entries: QueueEntry[] = [];

  const sortedItems = [...playlist.items].sort((a, b) => a.order - b.order);

  for (const item of sortedItems) {
    const media = mediaMap.get(item.mediaId);
    if (!media) {
      // Unknown media id; skip but could push placeholder
      continue;
    }

    // Resolve duration
    let duration: number | null = null;
    const overrideDuration = item.overrides?.duration ?? null;

    if (media.type === 'video') {
      if (media.duration && media.duration > 0) {
        duration = media.duration;
      } else if (overrideDuration && overrideDuration > 0) {
        duration = overrideDuration;
      } else {
        // video metadata unknown; will be refined later by playback controller
        duration = FALLBACK_VIDEO_DURATION;
      }
      if (overrideDuration && overrideDuration > 0 && overrideDuration < duration) {
        // If override shorter than natural duration, respect override (early cutoff)
        duration = overrideDuration;
      }
    } else {
      if (overrideDuration && overrideDuration > 0) {
        duration = overrideDuration;
      } else if (media.duration && media.duration > 0) {
        duration = media.duration;
      } else {
        duration = DEFAULT_NONVIDEO_DURATION;
      }
    }

    // Skip if override explicitly sets duration 0 (treat as skip)
    if (overrideDuration === 0) {
      continue;
    }

    if (enforceMin && duration < MIN_DURATION_SECONDS && !item.overrides?.allowShort) {
      duration = MIN_DURATION_SECONDS;
    }

    // Schedule boundaries
    let startUnix: number | undefined;
    let endUnix: number | undefined;
    if (item.overrides?.startTime) {
      const start = Date.parse(item.overrides.startTime);
      if (!Number.isNaN(start)) startUnix = Math.floor(start / 1000);
    }
    if (item.overrides?.endTime) {
      const end = Date.parse(item.overrides.endTime);
      if (!Number.isNaN(end)) endUnix = Math.floor(end / 1000);
    }

    // If out of schedule window, skip for now (could make dynamic filtering later)
    if (startUnix && now / 1000 < startUnix) continue;
    if (endUnix && now / 1000 > endUnix) continue;

    entries.push({
      itemId: item.id,
      mediaId: media.id,
      title: media.title || '',
      type: media.type,
      src: '', // placeholder, filled asynchronously if storage path requires signed/public URL
      duration: duration,
      mute: !!item.overrides?.mute,
      startUnix,
      endUnix,
    });
  }

  return entries;
}

// Post-resolution enrichment to fill src asynchronously (e.g., for signed URLs)
export async function hydrateQueueSources(entries: QueueEntry[], mediaMap: Map<string, MediaItem>) {
  for (const e of entries) {
    if (!e.src || e.src === '') {
      const media = mediaMap.get(e.mediaId);
      if (media) {
        e.src = await resolveMediaSrc(media, { preferSigned: media.type === 'video' });
      }
    }
  }
  return entries;
}
