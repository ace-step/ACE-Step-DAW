import { get, set, del, keys } from 'idb-keyval';

function makeKey(projectId: string, clipId: string, type: 'cumulative' | 'isolated'): string {
  return `audio:${projectId}:${clipId}:${type}`;
}

/**
 * Save an audio blob with a unique versioned key so that previous generations
 * are not overwritten (needed for clip version navigation).
 */
export async function saveAudioBlob(
  projectId: string,
  clipId: string,
  type: 'cumulative' | 'isolated',
  blob: Blob,
): Promise<string> {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const key = `audio:${projectId}:${clipId}:${type}:${suffix}`;
  await set(key, blob);
  return key;
}

export async function loadAudioBlob(
  projectId: string,
  clipId: string,
  type: 'cumulative' | 'isolated',
): Promise<Blob | undefined> {
  const key = makeKey(projectId, clipId, type);
  return get<Blob>(key);
}

export async function loadAudioBlobByKey(key: string): Promise<Blob | undefined> {
  return get<Blob>(key);
}

export async function deleteAudioBlob(
  projectId: string,
  clipId: string,
  type: 'cumulative' | 'isolated',
): Promise<void> {
  const key = makeKey(projectId, clipId, type);
  await del(key);
}

/** Store an audio blob under an arbitrary key (returns the key). */
export async function storeAudioBlob(blob: Blob, key?: string): Promise<string> {
  const k = key ?? `audio:${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await set(k, blob);
  return k;
}

/** Delete an audio blob by its storage key. */
export async function deleteAudioBlobByKey(key: string): Promise<void> {
  await del(key);
}

export async function deleteAllProjectAudio(projectId: string): Promise<void> {
  const prefix = `audio:${projectId}:`;
  const allKeys = await keys();
  const toDelete = allKeys.filter((k) => typeof k === 'string' && k.startsWith(prefix));
  await Promise.all(toDelete.map((k) => del(k)));
}
