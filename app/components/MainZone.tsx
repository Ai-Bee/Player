"use client";
import { Box } from '@/lib/player/layoutResolver';
import React from 'react';

interface MainZoneProps {
    box: Box;
    children: React.ReactNode;
}

export const MainZone: React.FC<MainZoneProps> = ({ box, children }) => {
    return (
        <div
            className="absolute transition-all duration-500 ease-in-out overflow-hidden bg-black"
            style={{
                top: box.top,
                left: box.left,
                width: box.width,
                height: box.height,
            }}
        >
            {children}
        </div>
    );
};
