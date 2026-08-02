"use client";
import { useEffect, useRef, useState, useCallback } from 'react';
import { FullscreenContainer } from './components/FullscreenContainer';
import { PairingScreen } from './components/PairingScreen';
import { OfflineBadge } from './components/OfflineBadge';
import { SettingsOverlay } from './components/SettingsOverlay';
import { useSettingsStore, SettingsState } from '../lib/player/settingsStore';
import { generatePairingCode, registerDevice, pollDevicePaired } from '../lib/player/devicePairing';
import { getScreenByCode } from '../lib/player/getScreenByCode';
import { useTVMode } from '../lib/player/hooks/useTVMode';
import { useSpatialNavigation } from '../lib/player/hooks/useSpatialNavigation';
import { saveConfig, loadConfig } from '../lib/player/offlineCache';
import { heartbeat, fetchScreenConfig, subscribeToScreenInvalidations } from '../lib/player/apiClient';
import { ScreenConfigPayload } from '../lib/player/types';
import { LayoutManager } from './components/LayoutManager';
import { OverlayManager } from './components/OverlayManager';
import { usePlayerStore } from '../lib/player/playerStore';

const PAIRING_CODE_KEY = 'player_pairing_code_v1';

async function getOrCreatePairingCode(): Promise<string> {
  const stored = typeof window !== 'undefined' ? localStorage.getItem(PAIRING_CODE_KEY) : null;
  if (stored && /^[A-Z0-9]{6}$/.test(stored)) return stored;
  const code = await generatePairingCode();
  if (typeof window !== 'undefined') localStorage.setItem(PAIRING_CODE_KEY, code);
  return code;
}

export default function Home() {
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingStatus, setPairingStatus] = useState<'init' | 'registering' | 'waiting' | 'paired' | 'error'>("init");
  const [screenId, setScreenId] = useState<string | null>(null);
  const { screenLayout, setScreenLayout, tickerContent, setTickerContent } = usePlayerStore();
  const [error, setError] = useState<string | null>(null);
  const [consecutiveErrors, ] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const showSettings = useSettingsStore((s: SettingsState) => s.showSettings);
  const [configPayload, setConfigPayload] = useState<ScreenConfigPayload | null>(null);
  const [online, setOnline] = useState(true);
  const currentMainItemIdRef = useRef<string | null>(null);

  const isTV = useTVMode();
  const isPlaybackActive = pairingStatus === 'paired';
  const navEnabled = isTV && (!isPlaybackActive || showSettings);
  useSpatialNavigation(navEnabled);



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

  const startConfigPolling = useCallback((screenId: string, groupId?: string | null, currentPlaylistId?: string | null) => {
    const fetch = async () => {
      try {
        const configRes = await fetchScreenConfig();
        if (configRes.ok) {
          setConfigPayload(configRes.data);
          saveConfig(configRes.data);
          
          const apiOverlays = configRes.data.legacy_overlays || {};
          setScreenLayout({
            overlays: {
              logo: apiOverlays.logo_url ? { 
                enabled: true, 
                url: apiOverlays.logo_url, 
                position: (apiOverlays.overlay_position?.replace('_', '-') as any) || 'top-right' 
              } : undefined,
              override: apiOverlays.overlay_message ? { 
                active: true, 
                message: apiOverlays.overlay_message, 
                position: apiOverlays.overlay_message_position === 'top' ? 'top' : 'bottom' 
              } : undefined,
              clock: { 
                enabled: [true, 'true', 1, '1'].includes(apiOverlays.clock_enabled || false), 
                position: (apiOverlays.clock_position?.replace('_', '-') as any) || 'top-left' 
              }
            }
          });
          setTickerContent(undefined);
          setError(null);
        } else {
          // If offline or network error, fallback to cache
          const cached = loadConfig();
          if (cached) {
            setConfigPayload(cached);
            setError('Using cached configuration (offline)');
          } else {
            setError(configRes.error);
          }
        }
      } catch (err: any) {
        const cached = loadConfig();
        if (cached) {
          setConfigPayload(cached);
          setError('Using cached configuration (offline)');
        } else {
          setError(err.message || 'Failed to fetch config');
        }
      }
    };
    fetch();
    const unsubscribe = subscribeToScreenInvalidations(screenId, groupId || null, () => {
      console.log('Realtime update received. Refetching layout...');
      fetch();
    });
    return () => unsubscribe();
  }, []);

  const startHeartbeat = useCallback((screenId: string) => {
    const start = performance.now();
    const send = () => {
      const uptimeSeconds = Math.floor((performance.now() - start) / 1000);
      heartbeat(screenId, {
        screenId,
        currentItemId: currentMainItemIdRef.current,
        uptimeSeconds,
        timestamp: new Date().toISOString(),
        online: navigator.onLine,
      });
    };
    send();
    const id = setInterval(send, 60000);
    return () => clearInterval(id);
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
        const stopPolling = startConfigPolling(screen.id, screen.groupId);
        cleanupFns.push(stopPolling);

        const stopHeartbeat = startHeartbeat(screen.id);
        cleanupFns.push(stopHeartbeat);
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
  }, [startHeartbeat, startConfigPolling, retryCount]);

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
          {configPayload ? (
            <>
              <LayoutManager 
                config={configPayload} 
                handlers={{
                  onMainZoneItemChange: (entry) => {
                    currentMainItemIdRef.current = entry.itemId;
                  }
                }} 
              />
            </>
          ) : (
            <div className="w-full h-full bg-black flex items-center justify-center text-white">Loading configuration...</div>
          )}

          <OverlayManager config={screenLayout.overlays} />
        </>
      )}



      <OfflineBadge online={online} />
      {showSettings && <SettingsOverlay onRefreshPlaylist={() => screenId && startConfigPolling(screenId)} />}
    </FullscreenContainer>
  );
}
