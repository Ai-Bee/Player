"use client";
import React from 'react';

interface PairingScreenProps {
  pairingCode?: string;
  screenId?: string;
  status?: 'init' | 'registering' | 'waiting' | 'paired' | 'error';
  error?: string;
  onRetry?: () => void;
}

export const PairingScreen: React.FC<PairingScreenProps> = ({ pairingCode, screenId, status, error, onRetry }) => {
  let content;
  if (status === 'paired' && screenId) {
    content = (
      <p className="text-green-400 text-2xl">Paired! Screen ID: <span className="font-mono bg-zinc-800 px-3 py-1 rounded">{screenId}</span></p>
    );
  } else if (status === 'error') {
    content = (
      <>
        <p className="mb-4 text-red-400 text-2xl font-bold">Pairing failed:</p>
        <div className="mb-6 text-red-300 text-xl max-w-sm mx-auto">{error || 'Unknown error'}</div>
      </>
    );
  } else {
    content = (
      <>
        <p className="mb-6 text-2xl text-zinc-300">Enter this code in the CMS to link this device:</p>
        <div className="text-8xl font-mono tracking-[0.2em] mb-8 font-extrabold text-yellow-400">{pairingCode || '------'}</div>
        <div className="flex items-center justify-center gap-3 text-xl text-zinc-400">
          <div className="w-4 h-4 rounded-full bg-yellow-500 animate-pulse" />
          {status === 'registering' && 'Registering device...'}
          {status === 'waiting' && 'Waiting for pairing in CMS...'}
          {status === 'init' && 'Preparing...'}
        </div>
      </>
    );
  }
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center max-w-2xl p-16 rounded-3xl bg-zinc-900/50 backdrop-blur-md border-4 border-zinc-800 shadow-2xl">
        <h1 className="text-5xl font-black mb-8 tracking-tight">Device Pairing</h1>
        {content}
        <div className="mt-12">
          {status === 'error' && (
            <button
              autoFocus
              onClick={onRetry}
              className="px-8 py-4 rounded-xl text-xl font-bold bg-zinc-700 hover:bg-zinc-600 focus:ring-4 focus:ring-yellow-400 focus:outline-none transition-all"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
