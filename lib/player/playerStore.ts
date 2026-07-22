import { create } from 'zustand';
import { QueueEntry, TickerConfig, TickerContent } from './types';

export interface ScreenLayoutState {
  sidePanel?: any;
  ticker?: TickerConfig;
  overlays?: any;
}

export interface PlayerState {
  queue: QueueEntry[];
  currentEntry: QueueEntry | undefined;
  screenLayout: ScreenLayoutState;
  tickerContent: TickerContent | undefined;
  setQueue: (queue: QueueEntry[]) => void;
  setCurrentEntry: (entry: QueueEntry | undefined) => void;
  setScreenLayout: (layout: ScreenLayoutState) => void;
  setTickerContent: (content: TickerContent | undefined) => void;
}

export const usePlayerStore = create<PlayerState>((set) => ({
  queue: [],
  currentEntry: undefined,
  screenLayout: {},
  tickerContent: undefined,
  setQueue: (queue) => set({ queue }),
  setCurrentEntry: (currentEntry) => set({ currentEntry }),
  setScreenLayout: (screenLayout) => set({ screenLayout }),
  setTickerContent: (tickerContent) => set({ tickerContent }),
}));
