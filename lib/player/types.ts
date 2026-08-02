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

export interface EffectiveScreenConfig {
  id: string; // screen_id
  overlay_logo_media_id?: string | null;
  overlay_position?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | null;
  overlay_message?: string | null;
  overlay_message_position?: "top" | "bottom" | null;
  rolling_texts?: string[] | null;
  rolling_texts_position?: "top" | "bottom" | null;
  clock_enabled?: boolean | null;
  clock_position?: "top_left" | "top_right" | "bottom_left" | "bottom_right" | null;
  media?: MediaItem | null; // Resolved via relation embedding
}

export interface EffectiveSideContentItem {
  id: string;
  screen_id: string;
  media_id: string;
  order_index: number;
  duration_seconds: number;
  is_currently_active: boolean;
  media?: MediaItem | null; // Resolved via relation embedding
}

export interface SidePanelConfig {
  enabled: boolean;
  position: "left" | "right";
  widthPercent: number; // max 30
  items?: EffectiveSideContentItem[];
}

export interface OverlayConfig {
  logo?: {
    enabled: boolean;
    url: string;
    position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  };
  clock?: {
    enabled: boolean;
    position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  };
  override?: {
    active: boolean;
    message: string;
    position?: "top" | "bottom";
  };
}

export interface ScreenLayout {
  sidePanel?: SidePanelConfig;
  ticker?: TickerConfig;
  overlays?: OverlayConfig;
  
  // New Layout System
  layout_id?: string;
  zones?: Record<string, ZoneConfig>;
}

export type ZoneType = 'playlist' | 'media' | 'iframe' | 'rolling_text';

export interface ZoneConfig {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  allowed_content_types?: string[];
  content: {
    type: ZoneType;
    playlist?: any;
    media?: any;
    rolling_text?: any;
    iframe_source?: any;
  } | null;
}

export interface ScreenConfigPayload {
  screen_id: string;
  name: string;
  layout: {
    id: string;
    name: string;
    zones: ZoneConfig[];
  };
  legacy_overlays: {
    clock_enabled?: boolean;
    clock_position?: "top_left" | "top_right" | "bottom_left" | "bottom_right" | null;
    overlay_logo_media_id?: string | null;
    overlay_message?: string | null;
    overlay_message_position?: "top" | "bottom" | null;
    overlay_position?: "top_left" | "top_right" | "bottom_left" | "bottom_right" | null;
    rolling_texts?: string[] | null;
    rolling_texts_position?: "top" | "bottom" | null;
    logo_url?: string | null;
  };
}

export interface ScreenResolution {
  id: string;
  name: string | null;
  notes?: string | null;
  width: number | null;
  height: number | null;
  created_at?: string | null;
  created_by?: string | null;
  updated_at?: string | null;
  aspect_ratio: string | null;
  refresh_rate: number | null;
}

export interface AssignedPlaylist {
  id: string;
  title?: string;
  name?: string;
}



export interface ScreenData {
  id: string;
  screen_code: string;
  name: string;
  location: string | null;
  status: 'online' | 'offline';
  last_seen_at?: string | null;
  resolution_id?: string | null;
  assigned_playlist_id?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  pairing_code?: string | null;
  paired_at?: string | null;
  device_id?: string | null;

  // Side Content (Split-Screen)
  side_content_type: 'none' | 'image' | 'iframe' | null;
  side_content: { imageUrl?: string; src?: string } | null;

  // Overlays
  logo_url: string | null;
  override_message: string | null;
  organization_id?: string | null;
  location_id?: string | null;
  assigned_playlist?: AssignedPlaylist | null;
  playlist?: AssignedPlaylist | null;
  resolution?: ScreenResolution | null;
  rolling_texts?: string[] | null;
  rolling_texts_position?: "top" | "bottom" | null;
}

export interface ScreenResponse extends ScreenData {}

export interface Screen {
  id: string;
  code: string;
  resolution_id?: string;

  groupId?: string | null;
  paired_at?: string | null;
  layout?: ScreenLayout;
}

export interface PairingInfo {
  screenId: string;
  playlistId?: string | null;
  layout?: ScreenLayout;
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
