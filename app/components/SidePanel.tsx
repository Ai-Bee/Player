"use client";
import React from 'react';
import { Box } from '@/lib/player/layoutResolver';

interface SidePanelProps {
    box: Box & { position: "left" | "right" };
    contentUrl?: string;
}

export const SidePanel: React.FC<SidePanelProps> = ({ box, contentUrl }) => {
    return (
        <div
            className="absolute transition-all duration-500 ease-in-out border-zinc-800 bg-zinc-900 overflow-hidden"
            style={{
                top: box.top,
                left: box.left,
                width: box.width,
                height: box.height,
                borderRight: box.position === 'left' ? '1px solid #27272a' : 'none',
                borderLeft: box.position === 'right' ? '1px solid #27272a' : 'none',
            }}
        >
            {contentUrl ? (
                <iframe
                    src={contentUrl}
                    className="w-full h-full border-0"
                    title="Side Panel Content"
                />
            ) : (
                <div className="flex items-center justify-center h-full text-zinc-500 text-sm italic">
                    Side Panel
                </div>
            )}
        </div>
    );
};
