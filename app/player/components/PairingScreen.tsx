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
      <p className="text-green-400">Paired! Screen ID: <span className="font-mono">{screenId}</span></p>
    );
  } else if (status === 'error') {
    content = (
      <>
        <p className="mb-2 text-red-400">Pairing failed:</p>
        <div className="mb-4 text-red-300 text-sm">{error || 'Unknown error'}</div>
      </>
    );
  } else {
    content = (
      <>
        <p className="mb-2">Enter this code in the CMS to link this device:</p>
        <div className="text-5xl font-mono tracking-widest mb-4">{pairingCode || '------'}</div>
        <p className="text-sm text-zinc-400">
          {status === 'registering' && 'Registering device...'}
          {status === 'waiting' && 'Waiting for pairing in CMS...'}
          {status === 'init' && 'Preparing...'}
        </p>
      </>
    );
  }
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center max-w-md p-8 rounded-lg bg-zinc-900 shadow-lg">
        <h1 className="text-3xl font-bold mb-4">Device Pairing</h1>
        {content}
        <div className="mt-6">
          {status === 'error' && (
            <button onClick={onRetry} className="px-4 py-2 rounded bg-zinc-700 hover:bg-zinc-600">Retry</button>
          )}
        </div>
      </div>
    </div>
  );
};
