"use client";
import React, { useState, useEffect } from 'react';
import { Box } from '@/lib/player/layoutResolver';
import { EffectiveSideContentItem } from '@/lib/player/types';

interface SidePanelProps {
    box: Box & { position: "left" | "right" };
    items?: EffectiveSideContentItem[];
}

export const SidePanel: React.FC<SidePanelProps> = ({ box, items }) => {
    const [currentIndex, setCurrentIndex] = useState(0);

    const activeItems = items?.filter(item => item.is_currently_active) || [];

    useEffect(() => {
        if (activeItems.length <= 1) return;

        const currentItem = activeItems[currentIndex];
        const durationMs = (currentItem?.duration_seconds || 10) * 1000;

        const timer = setTimeout(() => {
            setCurrentIndex((prev) => (prev + 1) % activeItems.length);
        }, durationMs);

        return () => clearTimeout(timer);
    }, [currentIndex, activeItems]);

    useEffect(() => {
        if (activeItems.length > 0 && currentIndex >= activeItems.length) {
            setCurrentIndex(0);
        }
    }, [activeItems.length, currentIndex]);

    const currentItem = activeItems.length > 0 ? activeItems[currentIndex] : null;
    let contentUrl = null;
    let contentType = null;

    if (currentItem?.media) {
        contentUrl = currentItem.media.url || currentItem.media.storage_path;
        contentType = currentItem.media.type;
    }

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
                contentType === 'image' ? (
                    <img
                        key={contentUrl}
                        src={contentUrl}
                        className="w-full h-full object-cover"
                        alt="Side Panel Content"
                    />
                ) : contentType === 'video' ? (
                    <video
                        key={contentUrl}
                        src={contentUrl}
                        className="w-full h-full object-cover"
                        autoPlay
                        muted
                        loop
                    />
                ) : (
                    <iframe
                        key={contentUrl}
                        src={contentUrl}
                        className="w-full h-full border-0"
                        title="Side Panel Content"
                    />
                )
            ) : (
                <div className="flex items-center justify-center h-full text-zinc-500 text-sm italic">
                    Side Panel
                </div>
            )}
        </div>
    );
};
