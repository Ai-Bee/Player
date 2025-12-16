// Shared type definitions for the Digital Signage Player.
// These mirror backend contracts and add a QueueEntry structure used internally.

export interface MediaItem {
  id: string;
  title?: string | null;
  tags?: string[] | string | null;
  storage_path?: string | null; // path in storage provider (e.g. Supabase)
  url?: string | null; // fully qualified remote URL (external or signed)
  type: "image" | "video" | "pdf" | "html" | "slides" | "url" | "other";
  mime_type?: string | null;
  file_size?: number | null;
  duration?: number | null; // seconds (non-video explicit, video optional override)
  created_at?: string | null;
}

export interface PlaylistItemOverrides {
  duration?: number | null; // override duration (seconds)
  mute?: boolean;
  startTime?: string; // ISO Date string boundary (optional scheduling window)
  endTime?: string;
  allowShort?: boolean; // permit < minimum duration
}

export interface PlaylistItem {
  id: string; // playlist item row id
  mediaId: string; // references MediaItem.id
  order: number; // ascending for playback order
  overrides?: PlaylistItemOverrides;
}

export interface Playlist {
  id: string;
  name: string;
  items: PlaylistItem[];
  updated_at?: string;
}

export interface Screen {
  id: string;
  code: string;
  resolution_id?: string;
  playlistId?: string | null;
  paired_at?: string | null;
}

export interface TickerTheme {
  bg?: string;
  color?: string;
  fontFamily?: string;
  fontSize?: string; // CSS size string
}

export interface TickerConfig {
  enabled: boolean;
  position: "top" | "bottom";
  speed: number; // pixels per second
  theme?: TickerTheme;
}

export interface TickerContent {
  text?: string;
  html?: string; // sanitized HTML snippet
  updated_at?: string;
}

export interface QueueEntry {
  itemId: string; // playlist item id
  mediaId: string;
  title: string;
  type: MediaItem["type"];
  src: string; // resolved absolute URL
  duration: number; // resolved final duration in seconds
  mute: boolean;
  startUnix?: number; // optional schedule window start (epoch seconds)
  endUnix?: number; // optional schedule window end (epoch seconds)
}

export interface PairingInfo {
  screenId: string;
  playlistId?: string | null;
}

export interface HeartbeatPayload {
  screenId: string;
  playlistId?: string | null;
  currentItemId?: string | null;
  uptimeSeconds: number;
  timestamp: string; // ISO string
  online: boolean;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };

export const MIN_DURATION_SECONDS = 2; // enforced minimum unless allowShort
export const DEFAULT_NONVIDEO_DURATION = 10;
export const FALLBACK_VIDEO_DURATION = 30; // corrupt metadata fallback
