"use client";
import React, { useEffect, useState } from 'react';
import { ZoneConfig } from '@/lib/player/types';
import { PlaybackStage } from './PlaybackStage';
import { QueueEntry } from '@/lib/player/types';
import { PlaybackController } from '@/lib/player/playbackController';
import { preload } from '@/lib/player/preloader';

export interface LayoutEventHandlers {
  onMainZoneItemChange?: (entry: QueueEntry) => void;
}

interface ZoneRendererProps {
  zone: ZoneConfig;
  zoneId: string;
  handlers?: LayoutEventHandlers;
}

export const ZoneRenderer: React.FC<ZoneRendererProps> = ({ zone, zoneId, handlers }) => {
  const [iframeKey, setIframeKey] = useState(0);

  useEffect(() => {
    if (zone.content?.type === 'iframe' && zone.content.iframe_source?.refresh_interval_seconds) {
      const interval = setInterval(() => {
        setIframeKey(k => k + 1);
      }, zone.content.iframe_source.refresh_interval_seconds * 1000);
      return () => clearInterval(interval);
    }
  }, [zone.content]);

  const { content } = zone;

  if (!content || !content.type) {
    return <div className="w-full h-full bg-black"></div>;
  }

  if (content.type === 'playlist') {
    return (
      <PlaylistZone 
        items={content.playlist?.items || []} 
        onItemChange={zoneId === 'main' ? handlers?.onMainZoneItemChange : undefined} 
      />
    );
  }

  if (content.type === 'media') {
    const url = content.media?.url;
    if (!url) return <div className="w-full h-full bg-black"></div>;

    const isVideo = url.match(/\.(mp4|webm|ogg)$/i);
    return (
      <div className="relative w-full h-full overflow-hidden bg-black flex items-center justify-center">
        {isVideo ? (
          <video src={url} className="w-full" style={{ height: 'auto' }} autoPlay muted loop />
        ) : (
          <img src={url} className="w-full" style={{ height: 'auto' }} alt="Media Zone" />
        )}
      </div>
    );
  }

  if (content.type === 'iframe') {
    const url = content.iframe_source?.url;
    if (!url) return <div className="w-full h-full bg-transparent"></div>;
    return (
      <iframe
        key={iframeKey}
        src={url}
        style={{ backgroundColor: 'transparent' }}
        className="w-full h-full border-0 bg-transparent"
        title={`Iframe Zone ${zoneId}`}
      />
    );
  }

  if (content.type === 'rolling_text') {
    return <RollingTextZone config={content.rolling_text} />;
  }

  // Fallback to black box
  return <div className="w-full h-full bg-black"></div>;
};

const PlaylistZone = ({ items, onItemChange }: { items: any[], onItemChange?: (entry: QueueEntry) => void }) => {
  const [current, setCurrent] = useState<QueueEntry | undefined>(undefined);
  const playbackCtrlRef = React.useRef<PlaybackController | null>(null);

  useEffect(() => {
    const queueEntries: QueueEntry[] = items.map((item: any, idx: number) => {
      const media = item.media || item;
      const src = media.url || media.src || '';
      return {
        itemId: item.id || `item-${idx}`,
        mediaId: media.id || `media-${idx}`,
        title: media.title || media.name || `Item ${idx}`,
        type: (media.type || (src.match(/\.(mp4|webm|ogg)$/i) ? 'video' : 'image')).toLowerCase(),
        src,
        duration: media.duration || 10,
        mute: item.mute || false,
      };
    });

    if (!playbackCtrlRef.current) {
      playbackCtrlRef.current = new PlaybackController({ 
        onItemStart: (entry) => {
          setCurrent(entry);
          onItemChange?.(entry);
        }
      });
    }

    if (queueEntries.length > 0) {
      playbackCtrlRef.current.start(queueEntries, 0);
      preload(queueEntries, 0).catch(err => console.warn('Preload error', err));
    } else {
      playbackCtrlRef.current.stop();
      setCurrent(undefined);
    }

    // Cleanup on unmount
    return () => {
      playbackCtrlRef.current?.stop();
      playbackCtrlRef.current = null;
    };
  }, [JSON.stringify(items)]); // Serialize items to avoid unnecessary re-runs

  return (
    <PlaybackStage
      current={current}
      error={null}
      debug={false}
      onMediaError={(entry, msg) => console.error(msg)}
      onVideoEnded={() => playbackCtrlRef.current?.skipCurrent()}
      onVideoWaiting={() => playbackCtrlRef.current?.pauseTimer()}
      onVideoPlaying={() => playbackCtrlRef.current?.resumeTimer()}
    />
  );
};

export function extractRollingTextItems(config: any): string[] {
  if (!config) return [];

  let rawList: any[] = [];
  if (Array.isArray(config)) {
    rawList = config;
  } else if (Array.isArray(config.items)) {
    rawList = config.items;
  } else if (Array.isArray(config.texts)) {
    rawList = config.texts;
  } else if (Array.isArray(config.messages)) {
    rawList = config.messages;
  } else if (typeof config.text === 'string' && config.text.trim()) {
    return [config.text.trim()];
  } else if (typeof config === 'string' && config.trim()) {
    return [config.trim()];
  }

  return rawList
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (typeof item === 'number') return String(item);
      if (item && typeof item === 'object') {
        const textVal = item.text ?? item.message ?? item.content ?? item.title ?? item.name ?? item.value;
        if (typeof textVal === 'string') return textVal.trim();
        if (typeof textVal === 'number') return String(textVal);
      }
      return '';
    })
    .filter((text): text is string => Boolean(text && text.length > 0));
}

const RollingTextZone = ({ config }: { config: any }) => {
  const items = extractRollingTextItems(config);

  if (items.length === 0) {
    return <div className="w-full h-full bg-zinc-900" />;
  }

  const speedSeconds = Number(config?.speed_seconds ?? config?.speed ?? (typeof config?.duration === 'number' ? config.duration : 25));
  const duration = Math.max(5, isNaN(speedSeconds) || speedSeconds <= 0 ? 25 : speedSeconds);
  const bgColor = config?.bg || config?.bg_color || '#18181b';
  const textColor = config?.color || config?.text_color || '#ffffff';
  const fontSize = config?.fontSize || config?.font_size || '1.25rem';
  const separator = config?.separator || '•';
  const direction = (config?.direction || 'rtl').toLowerCase() === 'ltr' ? 'ltr' : 'rtl';
  const animationClass = direction === 'rtl' ? 'animate-marquee-rtl' : 'animate-marquee-ltr';

  return (
    <div
      className="w-full h-full relative overflow-hidden flex items-center whitespace-nowrap select-none"
      style={{ backgroundColor: bgColor, color: textColor, fontSize }}
    >
      <div
        className={`${animationClass} flex items-center h-full`}
        style={{ animationDuration: `${duration}s` }}
      >
        {items.map((item, i) => (
          <React.Fragment key={i}>
            <span className="mx-6 font-semibold tracking-wide flex-shrink-0">{item}</span>
            {i < items.length - 1 && (
              <span className="opacity-60 text-sm flex-shrink-0">{separator}</span>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};
