/**
 * IndexedDB storage for video file blobs.
 * Follows the same pattern as audioFileManager.ts.
 * Phase 2 of the video track epic (#1144).
 */

import { get, set, del, keys } from 'idb-keyval';

/**
 * Save a video blob to IndexedDB with a unique versioned key.
 * Returns the storage key for reference in VideoClipData.indexedDbKey.
 */
export async function saveVideoBlob(
  projectId: string,
  clipId: string,
  blob: Blob,
): Promise<string> {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const key = `video:${projectId}:${clipId}:${suffix}`;
  await set(key, blob);
  return key;
}

/** Load a video blob by its storage key. */
export async function loadVideoBlob(key: string): Promise<Blob | undefined> {
  return get<Blob>(key);
}

/** Delete a video blob by its storage key. */
export async function deleteVideoBlob(key: string): Promise<void> {
  await del(key);
}

/** Delete all video blobs for a given project. */
export async function deleteAllProjectVideos(projectId: string): Promise<void> {
  const prefix = `video:${projectId}:`;
  const allKeys = await keys();
  const toDelete = allKeys.filter((k) => typeof k === 'string' && k.startsWith(prefix));
  await Promise.all(toDelete.map((k) => del(k)));
}
