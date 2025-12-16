import { QueueEntry, FALLBACK_VIDEO_DURATION } from './types';

export interface PlaybackEvents {
  onItemStart?: (entry: QueueEntry, index: number) => void;
  onItemEnd?: (entry: QueueEntry, index: number) => void;
  onError?: (error: Error, entry?: QueueEntry) => void;
}

export interface PlaybackControllerOptions {
  driftGraceMs?: number; // allowed drift before resync
  rafIntervalMs?: number; // frame check cadence (lower for precision)
}

export class PlaybackController {
  private queue: QueueEntry[] = [];
  private index = 0;
  private deadline = 0; // performance.now() target
  private running = false;
  private events: PlaybackEvents;
  private driftGrace: number;
  private rafInterval: number;
  private lastFrameCheck = 0;
  private visibilityHandler = () => this.handleVisibilityChange();

  constructor(events: PlaybackEvents = {}, opts: PlaybackControllerOptions = {}) {
    this.events = events;
    this.driftGrace = opts.driftGraceMs ?? 1500;
    this.rafInterval = opts.rafIntervalMs ?? 100; // check roughly every 100ms
  }

  start(queue: QueueEntry[], startIndex = 0) {
    this.queue = queue;
    this.index = startIndex;
    this.running = true;
    this.startCurrent();
    document.addEventListener('visibilitychange', this.visibilityHandler);
    this.loop();
  }

  stop() {
    this.running = false;
    document.removeEventListener('visibilitychange', this.visibilityHandler);
  }

  next() {
    if (!this.running) return;
    const ended = this.queue[this.index];
    if (this.events.onItemEnd) this.events.onItemEnd(ended, this.index);
    this.index = (this.index + 1) % this.queue.length;
    this.startCurrent();
  }

  skipCurrent() {
    // Force advance regardless of deadline.
    this.next();
  }

  getCurrent(): QueueEntry | undefined {
    return this.queue[this.index];
  }

  getIndex(): number { return this.index; }

  private startCurrent() {
    const current = this.queue[this.index];
    if (!current) return;
    // Determine final duration (video may adjust once metadata known externally)
    let durationMs = current.duration * 1000;
    if (current.type === 'video' && (!current.duration || current.duration <= 0)) {
      durationMs = FALLBACK_VIDEO_DURATION * 1000;
    }
    this.deadline = performance.now() + durationMs;
    if (this.events.onItemStart) this.events.onItemStart(current, this.index);
  }

  private loop() {
    if (!this.running) return;
    const now = performance.now();
    if (now - this.lastFrameCheck >= this.rafInterval) {
      this.lastFrameCheck = now;
      if (now >= this.deadline) {
        this.next();
      }
    }
    requestAnimationFrame(() => this.loop());
  }

  private handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
      const remaining = this.deadline - performance.now();
      if (remaining < -this.driftGrace) {
        // We overshot significantly while hidden; resync
        this.next();
      }
    }
  }
}
