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
        switch (pos?.replace('_', '-')) {
            case 'top-left': return 'top-4 left-4';
            case 'top-right': return 'top-4 right-4';
            case 'bottom-left': return 'bottom-4 left-4';
            case 'bottom-right': return 'bottom-4 right-4';
            default: return 'top-4 right-4';
        }
    };

    return (
        <div className="absolute inset-0 pointer-events-none z-50">
            {/* Message Override */}
            {config.override?.active && (
                <div className="absolute left-0 right-0 bottom-0 bg-red-600 animate-pulse-red p-6 text-center pointer-events-none shadow-2xl border-y border-red-800">
                    <h1 className="text-4xl font-bold text-white tracking-wide">
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
