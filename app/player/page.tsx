"use client";
import { useEffect, useRef, useState, useCallback } from 'react';
import { FullscreenContainer } from './components/FullscreenContainer';
import { PairingScreen } from './components/PairingScreen';
import { PlaybackStage } from './components/PlaybackStage';
import { TickerBar } from './components/TickerBar';
import { DebugOverlay } from './components/DebugOverlay';
import { OfflineBadge } from './components/OfflineBadge';
import { SettingsOverlay } from './components/SettingsOverlay';
import { useSettingsStore, SettingsState } from '../../lib/player/settingsStore';
import { generatePairingCode, registerDevice, pollDevicePaired } from '../../lib/player/devicePairing';
import { getScreenByCode } from '../../lib/player/getScreenByCode';

const PAIRING_CODE_KEY = 'player_pairing_code_v1';

async function getOrCreatePairingCode(): Promise<string> {
  const stored = localStorage.getItem(PAIRING_CODE_KEY);
  if (stored && stored.length === 6) return stored;
  const code = await generatePairingCode();
  localStorage.setItem(PAIRING_CODE_KEY, code);
  return code;
}
import { saveQueue, loadQueue } from '../../lib/player/offlineCache';
import { fetchPlaylist, fetchPlaylistById, fetchMediaBatch, heartbeat } from '../../lib/player/apiClient';
import { resolvePlaylistToQueue, hydrateQueueSources } from '../../lib/player/playlistResolver';
import { PlaybackController } from '../../lib/player/playbackController';
// import { TickerController } from '../../lib/player/tickerController';
import { QueueEntry, TickerConfig, TickerContent, MediaItem } from '../../lib/player/types';
import { preload } from '../../lib/player/preloader';

// NOTE: Routes assumed to exist server-side.


// const tickerCtrl = new TickerController();

export default function PlayerPage() {
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingStatus, setPairingStatus] = useState<'init' | 'registering' | 'waiting' | 'paired' | 'error'>("init");
  const [screenId, setScreenId] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [current, setCurrent] = useState<QueueEntry | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [consecutiveErrors, setConsecutiveErrors] = useState(0);
  const debug = useSettingsStore((s: SettingsState) => s.debug);
  const showSettings = useSettingsStore((s: SettingsState) => s.showSettings);
  const toggleSettings = useSettingsStore((s: SettingsState) => s.toggleSettings);
  const [tickerState, ] = useState<{ config?: TickerConfig; content?: TickerContent }>({});
  const [online, setOnline] = useState(true);
  const playbackCtrlRef = useRef<PlaybackController | null>(null);

  // Self-Healing Watchdog
  useEffect(() => {
    const interval = setInterval(() => {
      // Reload if offline for too long (e.g. 1 hour) or too many errors
      if (consecutiveErrors > 10) {
        console.warn('Watchdog: Too many consecutive errors. Reloading...');
        window.location.reload();
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [consecutiveErrors]);

  useEffect(() => {
    function handleOnline() { setOnline(true); }
    function handleOffline() { setOnline(false); }
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
  }, []);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(err => console.warn('SW registration failed', err));
    }
  }, []);

  const startHeartbeat = useCallback((screenId: string, playlistId?: string) => {
    const start = performance.now();
    const send = () => {
      const uptimeSeconds = Math.floor((performance.now() - start) / 1000);
      heartbeat(screenId, {
        screenId,
        playlistId,
        currentItemId: playbackCtrlRef.current?.getCurrent()?.itemId || null,
        uptimeSeconds,
        timestamp: new Date().toISOString(),
        online: navigator.onLine,
      });
    };
    send();
    const id = setInterval(send, 60000);
    return () => clearInterval(id);
  }, []);

  const loadPlaylist = useCallback(async (p: { screenId: string; playlistId?: string | null }) => {
    const playlistRes = p.playlistId ? await fetchPlaylistById(p.playlistId) : await fetchPlaylist(p.screenId);
    if (!playlistRes.ok) {
      const cached = loadQueue();
      if (cached && cached.length > 0) {
        setQueue(cached);
        if (!playbackCtrlRef.current) {
          playbackCtrlRef.current = new PlaybackController({ onItemStart: (entry) => setCurrent(entry) });
        }
        playbackCtrlRef.current.start(cached, 0);
        setError('Using cached playlist (offline)');
        return;
      }
      setError(playlistRes.error);
      return;
    }
    const playlist = playlistRes.data;
    const mediaIds = Array.from(new Set(playlist.items.map(i => i.mediaId)));
    const mediaRes = await fetchMediaBatch(mediaIds);
    if (!mediaRes.ok) { setError(mediaRes.error); return; }
  const mediaMap = new Map<string, MediaItem>(mediaRes.data.map((m: MediaItem) => [m.id, m]));
  const queueEntries = resolvePlaylistToQueue(playlist, mediaMap);
    if (queueEntries.length === 0) { setError('Playlist empty or no playable items.'); return; }
    // Hydrate signed/public URLs before starting playback
    await hydrateQueueSources(queueEntries, mediaMap);
    setQueue(queueEntries);
    if (!playbackCtrlRef.current) {
      playbackCtrlRef.current = new PlaybackController({ onItemStart: (entry) => setCurrent(entry) });
    }
    playbackCtrlRef.current.start(queueEntries, 0);
    preload(queueEntries, 0).catch(err => console.warn('Preload error', err));
    saveQueue(queueEntries);
    setError(null);
    setConsecutiveErrors(0);
  }, []);

  // Pairing flow: generate code, register device, poll for pairing, then fetch playlist
  useEffect(() => {
    async function doPairing() {
      setPairingStatus('init');
      try {
        // 1. Get or create persistent code
        const code = await getOrCreatePairingCode();
        setPairingCode(code);
        setPairingStatus('registering');
        // 2. Register device (ignore error if already exists)
        try {
          await registerDevice({ code, name: 'Player Device' });
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (e) {
          // Device may already exist, that's fine
        }
        setPairingStatus('waiting');
        // 3. Poll for pairing (increase timeout to 15 min)
        const paired = await pollDevicePaired(code, 3000, 15 * 60 * 1000); // 15 min timeout
        if (!paired) throw new Error('Pairing timed out.');
        // 4. Fetch screen info by code
        const screen = await getScreenByCode(code);
        if (!screen) throw new Error('Paired, but could not fetch screen info.');
  setScreenId(screen.id);
        setPairingStatus('paired');
        // Optionally, load playlist for this screen
        if (screen.playlistId) {
          await loadPlaylist({ screenId: screen.id, playlistId: screen.playlistId });
          startHeartbeat(screen.id, screen.playlistId);
        } else {
          await loadPlaylist({ screenId: screen.id });
          startHeartbeat(screen.id);
        }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (e: any) {
        setPairingStatus('error');
        setError(e.message || 'Pairing failed');
      }
    }
    doPairing();
    return undefined;
  }, [loadPlaylist, startHeartbeat]);

  // Removed earlier function declarations (now handled with useCallback above)

  return (
    <FullscreenContainer>
      {pairingStatus !== 'paired' && (
        <PairingScreen pairingCode={pairingCode || undefined} status={pairingStatus} error={error || undefined} />
      )}
      {pairingStatus === 'paired' && (
        <PlaybackStage 
          current={current} 
          debug={debug}
          onMediaError={(entry, message) => {
            console.error('Media error:', message, entry);
            setError(`Media error: ${message}`);
          }}
        />
      )}
      <TickerBar config={tickerState.config} content={tickerState.content} />
      {debug && <DebugOverlay queue={queue} currentIndex={current ? queue.findIndex(q => q.itemId === current.itemId) : -1} online={online} />}
      <OfflineBadge online={online} />
      <button
        onClick={toggleSettings}
        className="absolute top-2 right-2 bg-zinc-800 text-xs px-2 py-1 rounded"
      >Settings</button>
      {showSettings && <SettingsOverlay onRefreshPlaylist={() => screenId && loadPlaylist({ screenId })} />}
    </FullscreenContainer>
  );
}
