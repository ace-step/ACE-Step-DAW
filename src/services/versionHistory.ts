/**
 * Version History Service — persistent auto-save snapshots in IndexedDB.
 *
 * Each version stores a full Project snapshot with metadata for quick listing.
 * Keys: `version:{projectId}:{versionId}`
 *
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/974
 */

import { createStore, get, set, del, keys } from 'idb-keyval';
import type { Project } from '../types/project';

const VERSION_PREFIX = 'version:';
const versionStore = createStore('ace-step-version-history', 'versions');

export interface VersionSnapshot {
  id: string;
  projectId: string;
  savedAt: number;
  label: string;
  kind: 'auto' | 'manual';
  trackCount: number;
  bpm: number;
  project: Project;
}

export type VersionMetadata = Omit<VersionSnapshot, 'project'>;

function versionKey(projectId: string, versionId: string): string {
  return `${VERSION_PREFIX}${projectId}:${versionId}`;
}

function generateVersionId(): string {
  return `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function cloneProject(project: Project): Project {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(project);
  }
  return JSON.parse(JSON.stringify(project)) as Project;
}

function toVersionMetadata(snapshot: VersionSnapshot): VersionMetadata {
  const { project: _project, ...metadata } = snapshot;
  return metadata;
}

export async function saveVersion(
  project: Project,
  label = 'Auto-save',
  kind: 'auto' | 'manual' = label === 'Auto-save' ? 'auto' : 'manual',
): Promise<VersionSnapshot> {
  const id = generateVersionId();
  const snapshot: VersionSnapshot = {
    id,
    projectId: project.id,
    savedAt: Date.now(),
    label,
    kind,
    trackCount: project.tracks.length,
    bpm: project.bpm,
    project: cloneProject(project),
  };

  await set(versionKey(project.id, id), snapshot, versionStore);
  return snapshot;
}

export async function listVersions(projectId: string): Promise<VersionSnapshot[]> {
  const allKeys = await keys(versionStore);
  const prefix = `${VERSION_PREFIX}${projectId}:`;
  const versionKeys = allKeys.filter(
    (k) => typeof k === 'string' && k.startsWith(prefix),
  ) as string[];

  const snapshots: VersionSnapshot[] = [];
  for (const key of versionKeys) {
    const data = await get<VersionSnapshot>(key, versionStore);
    if (data) snapshots.push(data);
  }

  return snapshots.sort((a, b) => b.savedAt - a.savedAt);
}

export async function listVersionMetadata(projectId: string): Promise<VersionMetadata[]> {
  return (await listVersions(projectId)).map(toVersionMetadata);
}

export async function loadVersion(
  projectId: string,
  versionId: string,
): Promise<VersionSnapshot | null> {
  const data = await get<VersionSnapshot>(versionKey(projectId, versionId), versionStore);
  return data ?? null;
}

export async function deleteVersion(
  projectId: string,
  versionId: string,
): Promise<void> {
  await del(versionKey(projectId, versionId), versionStore);
}

export async function deleteAllVersions(projectId: string): Promise<number> {
  const versions = await listVersions(projectId);
  for (const version of versions) {
    await deleteVersion(projectId, version.id);
  }
  return versions.length;
}

export async function pruneVersions(
  projectId: string,
  keepCount: number,
): Promise<number> {
  const versions = (await listVersions(projectId)).filter((version) => version.kind === 'auto');
  if (versions.length <= keepCount) return 0;

  // versions is already sorted newest-first
  const toDelete = versions.slice(keepCount);
  for (const v of toDelete) {
    await del(versionKey(projectId, v.id), versionStore);
  }
  return toDelete.length;
}
