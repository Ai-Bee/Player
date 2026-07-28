"use client";
import { useEffect, useRef, useState, useCallback } from 'react';
import { FullscreenContainer } from './components/FullscreenContainer';
import { PairingScreen } from './components/PairingScreen';
import { PlaybackStage } from './components/PlaybackStage';
import { TickerBar } from './components/TickerBar';
import { DebugOverlay } from './components/DebugOverlay';
import { OfflineBadge } from './components/OfflineBadge';
import { SettingsOverlay } from './components/SettingsOverlay';
import { useSettingsStore, SettingsState } from '../lib/player/settingsStore';
import { generatePairingCode, registerDevice, pollDevicePaired } from '../lib/player/devicePairing';
import { getScreenByCode } from '../lib/player/getScreenByCode';
import { useTVMode } from '../lib/player/hooks/useTVMode';
import { useSpatialNavigation } from '../lib/player/hooks/useSpatialNavigation';
import { saveQueue, loadQueue } from '../lib/player/offlineCache';
import { fetchPlaylist, fetchPlaylistById, fetchMediaBatch, heartbeat, getScreen, fetchEffectiveScreenConfig, fetchEffectiveSideContent, fetchBottomTexts, subscribeToScreenChanges, subscribeToPlaylistChanges } from '../lib/player/apiClient';
import { resolvePlaylistToQueue, hydrateQueueSources } from '../lib/player/playlistResolver';
import { PlaybackController } from '../lib/player/playbackController';
import { TickerConfig, TickerContent, MediaItem, EffectiveSideContentItem } from '../lib/player/types';
import { preload } from '../lib/player/preloader';
import { resolveLayout } from '../lib/player/layoutResolver';
import { resolveMediaSrc } from '../lib/player/assetResolver';
import { MainZone } from './components/MainZone';
import { SidePanel } from './components/SidePanel';
import { OverlayManager } from './components/OverlayManager';
import { usePlayerStore } from '../lib/player/playerStore';

const PAIRING_CODE_KEY = 'player_pairing_code_v1';

async function getOrCreatePairingCode(): Promise<string> {
  const stored = typeof window !== 'undefined' ? localStorage.getItem(PAIRING_CODE_KEY) : null;
  if (stored && stored.length === 6) return stored;
  const code = await generatePairingCode();
  if (typeof window !== 'undefined') localStorage.setItem(PAIRING_CODE_KEY, code);
  return code;
}

export default function Home() {
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingStatus, setPairingStatus] = useState<'init' | 'registering' | 'waiting' | 'paired' | 'error'>("init");
  const [screenId, setScreenId] = useState<string | null>(null);
  const { queue, setQueue, currentEntry: current, setCurrentEntry: setCurrent, screenLayout, setScreenLayout, tickerContent, setTickerContent } = usePlayerStore();
  const [error, setError] = useState<string | null>(null);
  const [consecutiveErrors, setConsecutiveErrors] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const debug = useSettingsStore((s: SettingsState) => s.debug);
  const showSettings = useSettingsStore((s: SettingsState) => s.showSettings);
  const toggleSettings = useSettingsStore((s: SettingsState) => s.toggleSettings);
  const [tickerState,] = useState<{ config?: TickerConfig; content?: TickerContent }>({});
  const [layout, setLayout] = useState<TickerConfig | undefined>(undefined); // Placeholder for future layout sync
  const [online, setOnline] = useState(true);
  const playbackCtrlRef = useRef<PlaybackController | null>(null);

  const isTV = useTVMode();
  const isPlaybackActive = pairingStatus === 'paired' && current !== undefined;
  const navEnabled = isTV && (!isPlaybackActive || showSettings);
  useSpatialNavigation(navEnabled);

  const resolved = resolveLayout({
    sidePanel: screenLayout.sidePanel,
    ticker: tickerState.config || screenLayout.ticker,
    overlays: screenLayout.overlays,
  });

  useEffect(() => {
    const interval = setInterval(() => {
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

  const startConfigPolling = useCallback((screenId: string, currentPlaylistId?: string | null) => {
    const fetch = async () => {
      const [screenRes, configRes, sideRes, tickerRes] = await Promise.all([
        getScreen(screenId),
        fetchEffectiveScreenConfig(screenId),
        fetchEffectiveSideContent(screenId),
        fetchBottomTexts(screenId)
      ]);

      if (screenRes.ok) {
        const screenData = screenRes.data;
        const configData = configRes.ok ? configRes.data : null;
        const sideData = sideRes.ok ? sideRes.data : [];
        const bottom_texts = tickerRes.ok ? tickerRes.data : [];
        
        console.log("DEBUG_CONFIG", configData);
        console.log("DEBUG_SIDE", sideData);
        console.log("DEBUG_BOTTOM_TEXTS", bottom_texts);

        // If the assigned playlist has changed in the CMS, reload the player to re-initialize
        if (currentPlaylistId !== undefined && screenData.playlistId !== currentPlaylistId) {
          window.location.reload();
          return;
        }

        let logoUrl = null;
        if (configData?.media) {
            logoUrl = await resolveMediaSrc(configData.media);
        } else if (configData?.overlay_logo_media_id) {
            const mediaRes = await fetchMediaBatch([configData.overlay_logo_media_id]);
            if (mediaRes.ok && mediaRes.data.length > 0) {
                logoUrl = await resolveMediaSrc(mediaRes.data[0]);
            }
        }
        
        const activeSideData = sideData ? sideData.filter((i: EffectiveSideContentItem) => i.is_currently_active) : [];

        if (activeSideData.length > 0) {
            const sideMediaIds = Array.from(new Set(activeSideData.map((i: EffectiveSideContentItem) => i.media_id)));
            const sideMediaRes = await fetchMediaBatch(sideMediaIds as string[]);
            console.log("DEBUG_SIDE_MEDIA_RES", sideMediaRes);
            if (sideMediaRes.ok) {
                const sideMediaMap = new Map();
                for (const m of sideMediaRes.data) {
                    const resolvedUrl = await resolveMediaSrc(m);
                    sideMediaMap.set(m.id, { ...m, url: resolvedUrl });
                }
                activeSideData.forEach((item: EffectiveSideContentItem) => {
                    item.media = sideMediaMap.get(item.media_id);
                });
            }
        }

        // Check if any active side content items exist to determine if side panel should be enabled
        const hasSideContent = activeSideData.length > 0;

        setScreenLayout({
          sidePanel: hasSideContent ? {
            enabled: true,
            position: 'right',
            widthPercent: 30,
            items: activeSideData
          } : undefined,
          overlays: {
            logo: logoUrl ? { enabled: true, url: logoUrl, position: configData?.overlay_position || 'top-right' } : undefined,
            override: configData?.overlay_message ? { active: true, message: configData.overlay_message, position: configData.overlay_message_position || 'bottom' } : undefined,
            clock: { 
              enabled: [true, 'true', 1, '1'].includes(configData?.clock_enabled || false), 
              position: (configData?.clock_position?.replace('_', '-') as any) || 'top-left' 
            }
          },
          ticker: bottom_texts.length > 0 ? {
            enabled: true,
            position: 'bottom',
            speed: 50
          } : undefined
        });
        if (bottom_texts.length > 0) {
          const html = bottom_texts
            .sort((a, b) => a.sort_order - b.sort_order)
            .map(t => `<span class="ticker-item">${t.content}</span>`)
            .join(' • ');
          setTickerContent({ html });
        } else {
          setTickerContent(undefined);
        }
      }
    };
    fetch();
    const unsubscribe = subscribeToScreenChanges(screenId, (payload: any) => {
      console.log('Realtime update received. Refetching layout...');
      if (payload && payload.paired_at === null) {
        console.log('Device unpaired. Reloading...');
        localStorage.removeItem('player_device_token');
        window.location.reload();
        return;
      }
      fetch();
    });
    return () => unsubscribe();
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
      const isNoPlaylistError = 
        playlistRes.error === 'Screen has no assigned playlist' || 
        (typeof playlistRes.error === 'string' && playlistRes.error.startsWith('Playlist not found'));

      if (isNoPlaylistError) {
        setQueue([]);
        setCurrent(undefined);
        if (playbackCtrlRef.current) playbackCtrlRef.current.stop();
        if (typeof window !== 'undefined') localStorage.removeItem('player_queue_v1');
        setError('NO PLAYLIST ASSIGNED YET, CONTACT ADMIN.');
        setConsecutiveErrors(0);
        return;
      }

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

  useEffect(() => {
    let active = true;
    let cleanupFns: (() => void)[] = [];

    async function doPairing() {
      setPairingStatus('init');
      try {
        // Try fetching screen with existing token first
        let screen = await getScreenByCode('');
        
        if (!screen) {
          // No valid token, start pairing flow
          const code = await getOrCreatePairingCode();
          setPairingCode(code);
          setPairingStatus('registering');
          try {
            await registerDevice({ code, name: 'Player Device' });
          } catch (e: any) {
            // Ignore 409 Conflict if the session already exists
            if (e?.response?.status !== 409) {
              throw new Error(e?.response?.data?.message || e.message || 'Failed to register device session');
            }
          }
          setPairingStatus('waiting');
          
          // Waits via SSE until admin approves
          const paired = await pollDevicePaired(code, 3000, 15 * 60 * 1000);
          if (!paired) throw new Error('Pairing timed out.');
          
          // Now fetch the screen using the newly acquired token
          screen = await getScreenByCode('');
          if (!screen) throw new Error('Paired, but could not fetch screen info.');
        }

        setScreenId(screen.id);
        setPairingStatus('paired');

        if (!active) return;

        // Start polling for screen details (layout, ticker, overlays)
        const stopPolling = startConfigPolling(screen.id, screen.playlistId);
        cleanupFns.push(stopPolling);

        if (screen.playlistId) {
          await loadPlaylist({ screenId: screen.id, playlistId: screen.playlistId });
          if (!active) return;

          const stopHeartbeat = startHeartbeat(screen.id, screen.playlistId);
          cleanupFns.push(stopHeartbeat);
          const stopPlaylistSync = subscribeToPlaylistChanges(screen.playlistId, () => {
            if (!active) return;
            console.log('Realtime playlist update received. Reloading playlist...');
            
            // Show temporary visual indicator for debugging
            const toast = document.createElement('div');
            toast.textContent = '🔄 Realtime Update Received!';
            toast.style.cssText = 'position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: #10B981; color: white; padding: 10px 20px; border-radius: 8px; z-index: 9999; font-weight: bold; box-shadow: 0 4px 6px rgba(0,0,0,0.1); transition: opacity 0.5s;';
            document.body.appendChild(toast);
            setTimeout(() => {
              toast.style.opacity = '0';
              setTimeout(() => toast.remove(), 500);
            }, 3000);

            loadPlaylist({ screenId: screen.id, playlistId: screen.playlistId });
          });
          cleanupFns.push(stopPlaylistSync);
        } else {
          await loadPlaylist({ screenId: screen.id });
          const stopHeartbeat = startHeartbeat(screen.id);
          cleanupFns.push(stopHeartbeat);
        }
      } catch (e: any) {
        if (!active) return;
        
        // Auto-regenerate code ONLY if the 15-minute pairing session expired naturally
        if (e.message === 'Pairing timed out') {
          console.log('Pairing session expired. Regenerating code...');
          if (typeof window !== 'undefined') {
            localStorage.removeItem(PAIRING_CODE_KEY);
          }
          setTimeout(() => { if (active) doPairing(); }, 1000);
          return;
        }

        setPairingStatus('error');
        setError(e.message || 'Pairing failed');
      }
    }
    doPairing();
    return () => {
      active = false;
      cleanupFns.forEach(fn => fn());
    };
  }, [loadPlaylist, startHeartbeat, startConfigPolling, retryCount]);

  const handleRetry = () => {
    setError(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(PAIRING_CODE_KEY);
    }
    setRetryCount(c => c + 1);
  };

  return (
    <FullscreenContainer>
      {pairingStatus !== 'paired' && (
        <PairingScreen 
          pairingCode={pairingCode || undefined} 
          status={pairingStatus} 
          error={error || undefined} 
          onRetry={handleRetry} 
        />
      )}

      {pairingStatus === 'paired' && (
        <>
          <MainZone box={resolved.main}>
            <PlaybackStage
              current={current}
              error={error}
              debug={debug}
              onMediaError={(entry, message) => {
                console.error('Media error:', message, entry);
                setError(`Media error: ${message}`);
              }}
              onVideoEnded={() => playbackCtrlRef.current?.skipCurrent()}
              onVideoWaiting={() => playbackCtrlRef.current?.pauseTimer()}
              onVideoPlaying={() => playbackCtrlRef.current?.resumeTimer()}
            />
          </MainZone>

          {resolved.sidePanel && (
            <SidePanel
              box={resolved.sidePanel}
              items={screenLayout.sidePanel?.items}
            />
          )}

          {resolved.ticker && (
            <TickerBar
              config={tickerState.config || screenLayout.ticker}
              content={tickerState.content || tickerContent}
              style={{
                top: resolved.ticker.top,
                left: resolved.ticker.left,
                width: resolved.ticker.width,
                height: resolved.ticker.height,
              }}
            />
          )}

          <OverlayManager config={screenLayout.overlays} />
        </>
      )}



      {debug && <DebugOverlay queue={queue} currentIndex={current ? queue.findIndex(q => q.itemId === current.itemId) : -1} online={online} />}
      <OfflineBadge online={online} />

      {showSettings && <SettingsOverlay onRefreshPlaylist={() => screenId && loadPlaylist({ screenId })} />}
    </FullscreenContainer>
  );
}
