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
        switch (pos?.replace(/_/g, '-')) {
            case 'top-left': return 'top-6 left-6';
            case 'top-right': return 'top-6 right-6';
            case 'bottom-left': return 'bottom-6 left-6';
            case 'bottom-right': return 'bottom-6 right-6';
            default: return 'top-6 right-6';
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
            {config.logo?.enabled && config.logo.url && (
                <div className={`absolute ${getPositionClass(config.logo.position)} max-w-[12rem] max-h-[6rem] pointer-events-none z-50 flex items-center justify-center`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img 
                        src={config.logo.url} 
                        alt="Logo" 
                        className="w-auto h-auto max-w-full max-h-24 object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)]"
                        onError={(e) => {
                            console.warn('Overlay logo failed to load', config.logo?.url);
                            (e.target as HTMLElement).style.display = 'none';
                        }}
                    />
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
