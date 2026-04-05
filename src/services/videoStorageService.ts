import { get, set, del, keys } from 'idb-keyval';

/**
 * Store a video file blob in IndexedDB with a unique versioned key.
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

/**
 * Load a video blob by its exact key.
 */
export async function loadVideoBlob(key: string): Promise<Blob | undefined> {
  return get<Blob>(key);
}

/**
 * Delete a video blob by its exact key.
 */
export async function deleteVideoBlob(key: string): Promise<void> {
  await del(key);
}

/**
 * Delete all video blobs associated with a project.
 */
export async function deleteAllProjectVideo(projectId: string): Promise<void> {
  const prefix = `video:${projectId}:`;
  const allKeys = await keys();
  const toDelete = allKeys.filter((k) => typeof k === 'string' && k.startsWith(prefix));
  await Promise.all(toDelete.map((k) => del(k)));
}

/**
 * Create a temporary object URL for a stored video blob.
 * Caller is responsible for revoking the URL when done.
 */
export async function getVideoObjectURL(key: string): Promise<string | null> {
  const blob = await loadVideoBlob(key);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}
