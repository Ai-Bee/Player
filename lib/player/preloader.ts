import { QueueEntry } from './types';

export interface PreloadResultEntry {
  entry: QueueEntry;
  status: 'ok' | 'error';
  error?: string;
}

export async function preload(queue: QueueEntry[], currentIndex: number, windowSize = 3): Promise<PreloadResultEntry[]> {
  const slice = queue.slice(currentIndex + 1, currentIndex + 1 + windowSize);
  const tasks = slice.map(entry => preloadSingle(entry));
  return Promise.all(tasks);
}

async function preloadSingle(entry: QueueEntry): Promise<PreloadResultEntry> {
  try {
    switch (entry.type) {
      case 'image':
        await preloadImage(entry.src);
        break;
      case 'video':
        await preloadVideoMetadata(entry.src);
        break;
      default:
        // pdf/html/slides/url: light touch (optionally HEAD request later)
        break;
    }
    return { entry, status: 'ok' };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown preload error';
    return { entry, status: 'error', error: message };
  }
}

function preloadImage(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('image preload failed'));
    img.src = src;
  });
}

function preloadVideoMetadata(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      // Release object URL if used
      resolve();
    };
    video.onerror = () => reject(new Error('video metadata preload failed'));
    video.src = src;
  });
}
