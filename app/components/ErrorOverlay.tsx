"use client";
import React from 'react';

interface ErrorOverlayProps {
  error: string;
  onRetry?: () => void;
}

export const ErrorOverlay: React.FC<ErrorOverlayProps> = ({ error, onRetry }) => {
  return (
    <div className="absolute inset-0 bg-red-900/70 flex items-center justify-center">
      <div className="bg-red-800 p-6 rounded shadow max-w-md text-center">
        <h2 className="text-xl font-bold mb-2">Playback Error</h2>
        <p className="mb-4 text-sm whitespace-pre-wrap">{error}</p>
        {onRetry && (
          <button onClick={onRetry} className="px-4 py-2 rounded bg-red-600 hover:bg-red-500">Retry</button>
        )}
      </div>
    </div>
  );
};
