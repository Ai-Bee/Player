import { MediaItem } from './types';
import { ensureSupabase } from './supabaseClient';
import { getCachedMediaUrl, cacheMediaBlob } from './mediaCache';

// Resolves a media item's usable URL.
// Priority: explicit media.url > Supabase storage public/signed URL from storage_path.
// Assumptions: storage_path does NOT include bucket name; bucket provided in env.
// Env vars:
//   NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET : bucket containing media assets
//   NEXT_PUBLIC_SUPABASE_STORAGE_SIGNED_TTL : optional seconds for signed URL lifetime

const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET;
const SIGNED_TTL = parseInt(process.env.NEXT_PUBLIC_SUPABASE_STORAGE_SIGNED_TTL || '0', 10);

interface ResolveOptions {
  preferSigned?: boolean; // if true, attempt signed URL
}

export async function resolveMediaSrc(media: MediaItem, opts: ResolveOptions = {}): Promise<string> {
  const cachedUrl = await getCachedMediaUrl(media.id);
  if (cachedUrl) return cachedUrl;

  if (media.url) return media.url;
  if (!media.storage_path || !BUCKET) return '';
  try {
    const client = ensureSupabase();
    // Some deployments historically included the bucket as a prefix in storage_path
    // (e.g. "media/folder/file.jpg"). Supabase storage methods expect paths
    // relative to the bucket name, so strip a leading "{BUCKET}/" if present.
    let objectPath = media.storage_path;
    if (objectPath.startsWith(`${BUCKET}/`)) {
      objectPath = objectPath.slice(BUCKET.length + 1);
    }
    if (opts.preferSigned && SIGNED_TTL > 0) {
      const { data, error } = await client.storage.from(BUCKET).createSignedUrl(objectPath, SIGNED_TTL);
      if (error) console.warn('Supabase createSignedUrl error', { bucket: BUCKET, path: objectPath, error });
      if (!error && data?.signedUrl) return data.signedUrl;
    }
    const { data } = client.storage.from(BUCKET).getPublicUrl(objectPath);
    if (!data?.publicUrl) console.warn('Supabase getPublicUrl returned empty publicUrl', { bucket: BUCKET, path: objectPath });
    // data.publicUrl will be an empty string if the bucket/object cannot be found
    return data?.publicUrl || '';
  } catch {
    console.warn('Failed to resolve media src', { media });
    return '';
  }
}

/**
 * Resolves a media ID (UUID) by querying the Supabase media table and generating a usable URL.
 */
export async function resolveMediaId(mediaId: string): Promise<string> {
  if (!mediaId) return '';
  const cachedUrl = await getCachedMediaUrl(mediaId);
  if (cachedUrl) return cachedUrl;

  try {
    const client = ensureSupabase();
    const { data: media, error } = await client
      .from('media')
      .select('id, title, url, storage_path, type')
      .eq('id', mediaId)
      .single();

    if (error || !media) {
      console.warn('Failed to fetch media by ID', { mediaId, error });
      return '';
    }

    const src = await resolveMediaSrc(media);
    if (src) {
      // Cache blob asynchronously for offline support
      cacheMediaBlob(media.id, src).catch(() => {});
    }
    return src;
  } catch (err) {
    console.warn('Error resolving media ID', { mediaId, err });
    return '';
  }
}

