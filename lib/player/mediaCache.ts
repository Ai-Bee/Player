import localforage from 'localforage';

// Configure localforage to prefer IndexedDB
localforage.config({
  name: 'DigitalSignagePlayer',
  storeName: 'media_cache',
  description: 'Offline caching for media assets (images, videos)'
});

/**
 * Downloads a URL as a Blob and stores it in IndexedDB.
 */
export async function cacheMediaBlob(mediaId: string, url: string): Promise<void> {
  try {
    const existingBlob = await localforage.getItem<Blob>(mediaId);
    if (existingBlob) {
      return; // Already cached
    }

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch media for cache: ${response.statusText}`);
    
    const blob = await response.blob();
    await localforage.setItem(mediaId, blob);
  } catch (error) {
    console.error(`Error caching media blob ${mediaId}:`, error);
  }
}

/**
 * Retrieves a locally cached Blob as an Object URL, or null if not cached.
 */
export async function getCachedMediaUrl(mediaId: string): Promise<string | null> {
  try {
    const blob = await localforage.getItem<Blob>(mediaId);
    if (!blob) return null;
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error(`Error retrieving cached media ${mediaId}:`, error);
    return null;
  }
}

/**
 * Clears all cached media
 */
export async function clearMediaCache(): Promise<void> {
  await localforage.clear();
}
