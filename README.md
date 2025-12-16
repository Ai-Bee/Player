## Digital Signage Player (Integrated in Next.js)

This project hosts a kiosk‑style Digital Signage Player at the route `/player` backed by REST endpoints under `/api/*` and Supabase Storage for media assets. It supports pairing, playlist playback (images, video, pdf/slides/url via iframe), ticker content, offline resilience, and telemetry heartbeats.

### High‑Level Architecture
| Layer | Responsibility |
|-------|----------------|
| `/api/*` (backend) | Provides playlist, media, ticker, screen pairing & heartbeat endpoints. |
| Player React route `/player` | Orchestrates pairing, queue building, timers, rendering, ticker. |
| Service Worker `public/sw.js` | Cache First for media assets, Network First for JSON to allow offline playback. |
| LocalStorage | Persists pairing info & last resolved playback queue for offline fallback. |
| Supabase Storage | Source of media assets referenced by `storage_path`. |

### Key Modules
`lib/player/apiClient.ts` – Generic fetch with retry (still uses `/api/*`).
`lib/player/pairingManager.ts` – Pairing persistence (localStorage).
`lib/player/playlistResolver.ts` – Duration + overrides -> queue entries, schedule filtering.
`lib/player/assetResolver.ts` – Supabase public/signed URL resolution for `storage_path`.
`lib/player/playbackController.ts` – Frame‑based timing + drift compensation & skip.
`lib/player/preloader.ts` – Preloads next N items.
`lib/player/tickerController.ts` – Polls ticker config & content, sanitizes HTML.
`lib/player/offlineCache.ts` – Saves/loads queue snapshot.
`lib/player/settingsStore.ts` – Zustand store for local settings & debug flag.

### Environment Variables (Placeholders – set actual values)
Create / update a `.env.local` (Next.js loads automatically) with:

```
NEXT_PUBLIC_API_BASE_URL=/api
NEXT_PUBLIC_PLAYER_SERVICE_KEY=REPLACE_OPTIONAL_SERVICE_KEY   # optional header if backend expects
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET=media                     # bucket containing assets
NEXT_PUBLIC_SUPABASE_STORAGE_SIGNED_TTL=3600                  # seconds for signed URL TTL (optional)
NEXT_PUBLIC_STORAGE_BASE_URL=https://legacy-cdn.example.com   # only if some assets not in Supabase
```

Notes:
1. Because playlists/media/ticker still hit `/api/*`, only storage URL resolution uses Supabase client right now.
2. Use signed URLs for private/video content (set TTL). Public images can rely on `getPublicUrl`.
3. Do NOT expose service role keys in client code; keep to anon key only.

### Pairing Flow
1. Player loads `/player` – attempts `getOrCreatePairing()`.
2. If no existing pairing, backend returns a new screen record with `screenId` (and optionally playlistId).
3. Screen info stored in localStorage; subsequent loads reuse it.
4. Heartbeat posts current item every 60s.

### Playlist & Duration Resolution
Priority for non‑video duration: `override.duration` > `media.duration` > default 10s.
Video: use `media.duration`; if unavailable use override; else fallback 30s. Short overrides (<2s) bumped to min 2s unless `allowShort`.

### Offline Behavior
On failed playlist fetch, player loads cached queue snapshot. Service worker serves cached media assets. Offline badge shows in top corner.

### Asset Resolution
`hydrateQueueSources()` replaces empty `src` fields with public or signed Supabase URLs. Videos request signed URLs if TTL configured.

### Security & Hardening (Initial)
- Iframes sandboxed: `allow-same-origin allow-scripts` (consider narrowing for external slides/html).
- Ticker HTML sanitized via DOMPurify.
- Future CSP additions (example):
	```
	Content-Security-Policy: default-src 'self'; img-src 'self' https: data:; media-src 'self' https:; frame-src 'self' https:; script-src 'self'; style-src 'self' 'unsafe-inline';
	```
Adjust `frame-src` to whitelist slide providers (e.g., Google Slides).

### Edge Cases Implemented / Pending
Handled: duration override 0 (skip), min duration enforcement, offline fallback, per-item error skip after 5s.
Pending: placeholder visual for skipped/unreachable media, video metadata duration refinement after load, ticker size truncation.

### Running Locally
Install deps & start dev:
```bash
npm install
npm run dev
```
Open http://localhost:3000/player

### Kiosk Mode Tips
- Chrome: `chrome.exe --kiosk --app=https://your-host/player`
- Disable context menu & key combos with OS-level kiosk tooling (Electron wrapper optional future work).

### Testing (Planned)
Will add Jest + React Testing Library tests for:
- playlistResolver (duration logic & overrides)
- playbackController (timing & drift)
- preloader (graceful failures)
- tickerController (marquee updates)
- pairingManager (localStorage persistence)

### Future Enhancements
- Multi-playlist scheduling windows & dayparting.
- IndexedDB media blob caching for offline beyond simple SW.
- Remote commands (skip, force refresh) via WebSocket or SSE.
- Enhanced analytics batching.

### Deployment
Standard Next.js build (`npm run build`) & deploy. Ensure env vars set on hosting platform. Service worker (`public/sw.js`) must not be transformed.

### Troubleshooting
| Symptom | Action |
|---------|--------|
| Empty playback | Check `/api/screens/{id}/playlist` response & console errors. |
| Media 404 | Verify storage path & bucket; confirm Supabase public/signed URL function returned value. |
| Stale offline queue | Clear localStorage key `player_queue_cache_v1` or use Settings overlay Clear. |
| Heartbeat not visible server-side | Ensure `/api/screens/:id/heartbeat` accepts JSON and returns 2xx. |

---
This README supersedes the default create-next-app template; adjust as backend evolves.
