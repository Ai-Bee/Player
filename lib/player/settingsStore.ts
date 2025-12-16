import { create } from 'zustand';

export interface SettingsState {
  debug: boolean;
  showSettings: boolean;
  transition: 'fade' | 'cut';
  playlistForceRefreshCounter: number;
  setDebug(v: boolean): void;
  toggleSettings(): void;
  setTransition(t: 'fade' | 'cut'): void;
  forcePlaylistRefresh(): void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  debug: false,
  showSettings: false,
  transition: 'fade',
  playlistForceRefreshCounter: 0,
  setDebug: (v) => set({ debug: v }),
  toggleSettings: () => set(s => ({ showSettings: !s.showSettings })),
  setTransition: (t) => set({ transition: t }),
  forcePlaylistRefresh: () => set(s => ({ playlistForceRefreshCounter: s.playlistForceRefreshCounter + 1 })),
}));
