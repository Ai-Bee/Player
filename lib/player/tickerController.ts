import DOMPurify from 'dompurify';
import { TickerConfig, TickerContent } from './types';
import { fetchTicker, fetchTickerConfig } from './apiClient';

export interface TickerState {
  config?: TickerConfig;
  content?: TickerContent;
  error?: string;
}

export class TickerController {
  private state: TickerState = {};
  private intervalId: number | null = null;
  private listeners: ((s: TickerState) => void)[] = [];

  constructor(private pollMs = 30000) {}

  subscribe(fn: (s: TickerState) => void) {
    this.listeners.push(fn);
    fn(this.state);
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn);
    };
  }

  private emit() {
    for (const l of this.listeners) l(this.state);
  }

  async refresh() {
    const [cfg, cnt] = await Promise.all([fetchTickerConfig(), fetchTicker()]);
    if (cfg.ok) this.state.config = cfg.data; else this.state.error = cfg.error;
    if (cnt.ok) this.state.content = sanitizeContent(cnt.data); else this.state.error = cnt.error;
    this.emit();
  }

  start() {
    this.stop();
    this.refresh();
    this.intervalId = window.setInterval(() => this.refresh(), this.pollMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

function sanitizeContent(content: TickerContent): TickerContent {
  if (content.html) {
    const cleaned = DOMPurify.sanitize(content.html, { USE_PROFILES: { html: true } });
    return { ...content, html: cleaned };
  }
  return content;
}
