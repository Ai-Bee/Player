"use client";
import React from 'react';
import { QueueEntry } from '../../lib/player/types';

interface DebugOverlayProps {
  queue: QueueEntry[];
  currentIndex: number;
  online: boolean;
}

export const DebugOverlay: React.FC<DebugOverlayProps> = ({ queue, currentIndex, online }) => {
  return (
    <div className="absolute top-0 right-0 m-2 p-2 bg-zinc-800/80 text-xs rounded max-w-xs">
      <div className="font-bold mb-1">Debug</div>
      <div>Status: {online ? 'online' : 'offline'}</div>
      <div>Queue length: {queue.length}</div>
      <div>Index: {currentIndex}</div>
      <div className="mt-1 max-h-32 overflow-auto">
        {queue.map((q, i) => (
          <div key={q.itemId} className={i === currentIndex ? 'text-green-400' : ''}>{i}: {q.type} {q.duration}s</div>
        ))}
      </div>
    </div>
  );
};
