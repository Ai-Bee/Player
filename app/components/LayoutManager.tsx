"use client";
import React from 'react';
import { ScreenConfigPayload } from '@/lib/player/types';
import { ZoneRenderer, LayoutEventHandlers } from './ZoneRenderer';

interface LayoutManagerProps {
  config: ScreenConfigPayload;
  handlers?: LayoutEventHandlers;
}

export const LayoutManager: React.FC<LayoutManagerProps> = ({ config, handlers }) => {
  const { layout } = config || {};
  const zones = layout?.zones || [];

  return (
    <div className="bg-black w-full h-full relative overflow-hidden">
      {zones.map((zone) => {
        if (!zone.content) {
          // If a zone has no content assigned, render a black box
          return (
            <div 
              key={zone.key} 
              style={{
                position: 'absolute',
                left: `${zone.x}%`,
                top: `${zone.y}%`,
                width: `${zone.w}%`,
                height: `${zone.h}%`,
                zIndex: zone.z
              }}
              className="overflow-hidden bg-black flex items-center justify-center text-zinc-600"
            />
          );
        }

        return (
          <div 
            key={zone.key} 
            style={{
              position: 'absolute',
              left: `${zone.x}%`,
              top: `${zone.y}%`,
              width: `${zone.w}%`,
              height: `${zone.h}%`,
              zIndex: zone.z
            }}
            className="overflow-hidden"
          >
            <ZoneRenderer 
              zone={zone} 
              zoneId={zone.key} 
              handlers={zone.key === 'main' ? handlers : undefined} 
            />
          </div>
        );
      })}
    </div>
  );
};
