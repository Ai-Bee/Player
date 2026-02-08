"use client";
import React, { useEffect, useRef } from 'react';
import { useSettingsStore } from '../../../lib/player/settingsStore';
import { clearPairing } from '../../../lib/player/pairingManager';

interface SettingsOverlayProps {
  onRefreshPlaylist?: () => void;
}

export const SettingsOverlay: React.FC<SettingsOverlayProps> = ({ onRefreshPlaylist }) => {
  const { debug, setDebug, transition, setTransition, forcePlaylistRefresh, toggleSettings } = useSettingsStore();
  const overlayRef = useRef<HTMLDivElement>(null);

  // Focus trapping and Back button logic
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Backspace') {
        // Only trigger back if we aren't typing in an input (not an issue here yet, but for future-proofing)
        if (document.activeElement?.tagName !== 'INPUT' || (document.activeElement as HTMLInputElement).type !== 'text') {
          toggleSettings();
        }
      }

      // Focus trapping
      if (e.key === 'Tab' && overlayRef.current) {
        const focusables = overlayRef.current.querySelectorAll('button, input, select, [tabindex]:not([tabindex="-1"])');
        const first = focusables[0] as HTMLElement;
        const last = focusables[focusables.length - 1] as HTMLElement;

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSettings]);

  return (
    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
      <div ref={overlayRef} className="bg-zinc-900 p-8 rounded-xl w-[450px] max-h-[90vh] overflow-auto border-2 border-zinc-700">
        <h2 className="text-2xl font-bold mb-6 border-b border-zinc-800 pb-2">Settings</h2>
        <div className="space-y-6 text-lg">
          <div className="flex items-center justify-between">
            <span>Debug Panel</span>
            <input
              autoFocus
              type="checkbox"
              checked={debug}
              onChange={e => setDebug(e.target.checked)}
              className="w-6 h-6 focus:ring-4 focus:ring-yellow-400 focus:outline-none rounded cursor-pointer"
            />
          </div>
          <div>
            <span className="block mb-2">Transition Style</span>
            <select
              value={transition}
              onChange={e => setTransition(e.target.value as 'fade' | 'cut')}
              className="bg-zinc-800 p-3 rounded-lg w-full focus:ring-4 focus:ring-yellow-400 focus:outline-none border border-zinc-700"
            >
              <option value="fade">Fade</option>
              <option value="cut">Cut</option>
            </select>
          </div>
          <div className="flex items-center justify-between">
            <span>Force Playlist Refresh</span>
            <button
              onClick={() => { forcePlaylistRefresh(); onRefreshPlaylist?.(); }}
              className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg focus:ring-4 focus:ring-yellow-400 focus:outline-none"
            >Refresh</button>
          </div>
          <div className="flex items-center justify-between">
            <span>Clear Pairing & Re-Pair</span>
            <button
              onClick={() => { clearPairing(); location.reload(); }}
              className="px-4 py-2 bg-red-700 hover:bg-red-600 rounded-lg focus:ring-4 focus:ring-yellow-400 focus:outline-none"
            >Clear</button>
          </div>
        </div>
        <button
          onClick={toggleSettings}
          className="mt-8 w-full bg-zinc-700 hover:bg-zinc-600 p-4 rounded-xl font-bold focus:ring-4 focus:ring-yellow-400 focus:outline-none"
        >
          Close
        </button>
      </div>
    </div>
  );
};
