"use client";
import React from 'react';
import Image from 'next/image';
import { QueueEntry } from '../../../lib/player/types';

interface PlaybackStageProps {
  current?: QueueEntry;
  debug?: boolean;
  onMediaError?: (entry: QueueEntry, message: string) => void;
}

// Renders the current media entry. Video/image/iframe support.
export const PlaybackStage: React.FC<PlaybackStageProps> = ({ current, debug, onMediaError }) => {
  if (!current) {
    return <div className="flex flex-1 items-center justify-center text-zinc-400">No content</div>;
  }

  let node: React.ReactNode = null;
  switch (current.type) {
    case 'image':
      node = (
        <Image
          src={current.src}
          alt={current.title}
          unoptimized
          width={1920}
          height={1080}
          className="max-w-full max-h-full object-contain"
          draggable={false}
          onError={() => onMediaError && onMediaError(current, 'Image failed to load')}
        />
      );
      break;
    case 'video':
      node = (
        <video
          key={current.itemId}
          src={current.src}
          autoPlay
          muted={current.mute}
          playsInline
          className="w-full h-full object-contain"
          onError={() => onMediaError && onMediaError(current, 'Video failed to load')}
        />
      );
      break;
  case 'pdf':
  case 'slides':
  case 'html':
  case 'url':
      node = (
        <iframe
          key={current.itemId}
          src={current.src}
          title={current.title}
          sandbox="allow-same-origin allow-scripts"
          className="w-full h-full border-0"
        />
      );
      break;
    default:
      node = <div className="text-zinc-500">Unsupported media type</div>;
  }

  return (
    <div className="relative flex-1 flex items-center justify-center bg-black">
      {node}
      {debug && (
        <div className="absolute top-2 left-2 bg-zinc-800/70 text-xs p-2 rounded">
          <div>Item: {current.itemId}</div>
          <div>Type: {current.type}</div>
          <div>Duration(s): {current.duration}</div>
        </div>
      )}
    </div>
  );
};
