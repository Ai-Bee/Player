"use client";
import React from 'react';
import { useSettingsStore } from '../../../lib/player/settingsStore';
import { clearPairing } from '../../../lib/player/pairingManager';

interface SettingsOverlayProps {
  onRefreshPlaylist?: () => void;
}

export const SettingsOverlay: React.FC<SettingsOverlayProps> = ({ onRefreshPlaylist }) => {
  const { debug, setDebug, transition, setTransition, forcePlaylistRefresh, toggleSettings } = useSettingsStore();
  return (
    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-zinc-900 p-6 rounded w-[380px] max-h-[80vh] overflow-auto">
        <h2 className="text-xl font-bold mb-4">Settings</h2>
        <div className="space-y-4 text-sm">
          <div className="flex items-center justify-between">
            <span>Debug Panel</span>
            <input type="checkbox" checked={debug} onChange={e => setDebug(e.target.checked)} />
          </div>
          <div>
            <span className="block mb-1">Transition Style</span>
            <select value={transition} onChange={e => setTransition(e.target.value as 'fade' | 'cut')} className="bg-zinc-800 p-1 rounded w-full">
              <option value="fade">Fade</option>
              <option value="cut">Cut</option>
            </select>
          </div>
          <div className="flex items-center justify-between">
            <span>Force Playlist Refresh</span>
            <button
              onClick={() => { forcePlaylistRefresh(); onRefreshPlaylist?.(); }}
              className="px-2 py-1 bg-zinc-700 rounded"
            >Refresh</button>
          </div>
          <div className="flex items-center justify-between">
            <span>Clear Pairing & Re-Pair</span>
            <button
              onClick={() => { clearPairing(); location.reload(); }}
              className="px-2 py-1 bg-red-700 rounded"
            >Clear</button>
          </div>
        </div>
        <button onClick={toggleSettings} className="mt-6 w-full bg-zinc-700 hover:bg-zinc-600 p-2 rounded">Close</button>
      </div>
    </div>
  );
};
