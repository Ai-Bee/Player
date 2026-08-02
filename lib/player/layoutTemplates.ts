import { ScreenConfigPayload, ZoneConfig, ZoneType } from './types';

export interface LayoutTemplateZoneDefinition {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  allowed_content_types: ZoneType[];
}

export interface LayoutTemplateDefinition {
  id: string;
  name: string;
  description?: string;
  zones: LayoutTemplateZoneDefinition[];
}

export const LAYOUT_TEMPLATES: Record<string, LayoutTemplateDefinition> = {
  'full-screen': {
    id: 'full-screen',
    name: 'Full Screen',
    description: 'Single full-width/height primary zone for video, playlist, or media playback.',
    zones: [
      {
        key: 'main',
        x: 0,
        y: 0,
        w: 100,
        h: 100,
        z: 0,
        allowed_content_types: ['playlist', 'media', 'iframe'],
      },
    ],
  },
  'split-65-35-ticker-banner': {
    id: 'split-65-35-ticker-banner',
    name: 'Split 65/35 with Ticker & Banner',
    description: 'Financial branches, corporate lobbies, and rate boards with primary video, live ticker, promo banner, and dynamic sidebar.',
    zones: [
      {
        key: 'main',
        x: 0,
        y: 0,
        w: 65,
        h: 72,
        z: 0,
        allowed_content_types: ['playlist', 'media', 'iframe'],
      },
      {
        key: 'ticker',
        x: 0,
        y: 72,
        w: 65,
        h: 8,
        z: 0,
        allowed_content_types: ['rolling_text'],
      },
      {
        key: 'banner',
        x: 0,
        y: 80,
        w: 65,
        h: 20,
        z: 0,
        allowed_content_types: ['playlist', 'media', 'iframe'],
      },
      {
        key: 'side',
        x: 65,
        y: 0,
        w: 35,
        h: 100,
        z: 0,
        allowed_content_types: ['playlist', 'media', 'iframe'],
      },
    ],
  },
  'stacked-main-ticker-banner': {
    id: 'stacked-main-ticker-banner',
    name: 'Stacked with Ticker & Banner',
    description: 'Full-width displays requiring primary media on top, live scrolling news in the middle, and promotional banner on the bottom.',
    zones: [
      {
        key: 'main',
        x: 0,
        y: 0,
        w: 100,
        h: 72,
        z: 0,
        allowed_content_types: ['playlist', 'media', 'iframe'],
      },
      {
        key: 'ticker',
        x: 0,
        y: 72,
        w: 100,
        h: 8,
        z: 0,
        allowed_content_types: ['rolling_text'],
      },
      {
        key: 'banner',
        x: 0,
        y: 80,
        w: 100,
        h: 20,
        z: 0,
        allowed_content_types: ['playlist', 'media', 'iframe'],
      },
    ],
  },
};

/**
 * Creates a default full-screen config payload for offline fallback or unconfigured screens.
 */
export function createDefaultFullscreenConfig(screenId: string = 'offline-screen', screenName: string = 'Digital Signage'): ScreenConfigPayload {
  const template = LAYOUT_TEMPLATES['full-screen'];
  const zones: ZoneConfig[] = template.zones.map((z) => ({
    key: z.key,
    x: z.x,
    y: z.y,
    w: z.w,
    h: z.h,
    z: z.z,
    allowed_content_types: z.allowed_content_types,
    content: null,
  }));

  return {
    screen_id: screenId,
    name: screenName,
    layout: {
      id: template.id,
      name: template.name,
      zones,
    },
    legacy_overlays: {
      clock_enabled: false,
      clock_position: null,
      overlay_logo_media_id: null,
      overlay_message: null,
      overlay_message_position: null,
      overlay_position: null,
      rolling_texts: null,
      rolling_texts_position: null,
      logo_url: null,
    },
  };
}
