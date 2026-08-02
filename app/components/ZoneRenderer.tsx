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
    return isVideo ? (
      <video src={url} className="w-full h-full object-cover" autoPlay muted loop />
    ) : (
      <img src={url} className="w-full h-full object-cover" alt="Media Zone" />
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
    const items = content.rolling_text?.items || [];
    return (
      <div className="w-full h-16 bg-zinc-900 text-white flex items-center overflow-hidden whitespace-nowrap">
        <div className="animate-[marquee_20s_linear_infinite] inline-block">
          {items.map((item: string, i: number) => (
            <span key={i} className="mx-8 text-xl font-bold">{item}</span>
          ))}
        </div>
      </div>
    );
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
