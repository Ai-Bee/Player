"use client";
import React, { useEffect, useState } from 'react';
import { OverlayConfig } from '@/lib/player/types';

interface OverlayManagerProps {
    config?: OverlayConfig;
}

export const OverlayManager: React.FC<OverlayManagerProps> = ({ config }) => {
    const [time, setTime] = useState(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

    useEffect(() => {
        const timer = setInterval(() => {
            setTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    if (!config) return null;

    const getPositionClass = (pos?: string) => {
        switch (pos) {
            case 'top-left': return 'top-4 left-4';
            case 'top-right': return 'top-4 right-4';
            case 'bottom-left': return 'bottom-4 left-4';
            case 'bottom-right': return 'bottom-4 right-4';
            default: return 'top-4 right-4';
        }
    };

    return (
        <div className="absolute inset-0 pointer-events-none z-50">
            {/* Fullscreen Override */}
            {config.override?.active && (
                <div className="absolute inset-0 bg-red-600/90 flex items-center justify-center p-12 text-center pointer-events-auto">
                    <h1 className="text-6xl font-black text-white uppercase tracking-tighter animate-pulse">
                        {config.override.message}
                    </h1>
                </div>
            )}

            {/* Logo */}
            {config.logo?.enabled && (
                <div className={`absolute ${getPositionClass(config.logo.position)} w-24 h-24`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={config.logo.url} alt="Logo" className="w-full h-full object-contain drop-shadow-lg" />
                </div>
            )}

            {/* Clock */}
            {config.clock?.enabled && (
                <div className={`absolute ${getPositionClass(config.clock.position)} bg-black/50 backdrop-blur-md px-4 py-2 rounded-lg text-white font-mono text-2xl border border-white/20 shadow-xl`}>
                    {time}
                </div>
            )}
        </div>
    );
};
