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

    const renderOverride = (position: 'top' | 'bottom') => {
        if (!config?.override?.active || config.override.position !== position) return null;
        return (
            <div className="bg-red-600 animate-pulse-red p-6 text-center shadow-2xl border-y border-red-800 w-full pointer-events-none flex-shrink-0">
                <h1 className="text-4xl font-bold text-white tracking-wide">
                    {config.override.message}
                </h1>
            </div>
        );
    };



    return (
        <div className="absolute inset-0 pointer-events-none z-50">
            {/* Top Stack */}
            <div className="absolute top-0 left-0 right-0 flex flex-col w-full z-50 pointer-events-none">
                {renderOverride('top')}
            </div>

            {/* Bottom Stack */}
            <div className="absolute bottom-0 left-0 right-0 flex flex-col w-full z-50 pointer-events-none">
                {renderOverride('bottom')}
            </div>

            {/* Logo */}
            {config.logo?.enabled && (
                <div className={`absolute ${getPositionClass(config.logo.position)} w-24 h-24 pointer-events-none`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={config.logo.url} alt="Logo" className="w-full h-full object-contain drop-shadow-lg" />
                </div>
            )}

            {/* Clock */}
            {config.clock?.enabled && (
                <div className={`absolute ${getPositionClass(config.clock.position)} bg-black/50 backdrop-blur-md px-4 py-2 rounded-lg text-white font-mono text-2xl border border-white/20 shadow-xl pointer-events-none`}>
                    {time}
                </div>
            )}
        </div>
    );
};
