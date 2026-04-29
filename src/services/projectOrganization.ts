/**
 * Project Organization — folders, tags, search, and favorites.
 *
 * Stores lightweight project metadata alongside existing IndexedDB project data.
 * Keys: `meta:{projectId}`
 *
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/974
 */

import { createStore, get, set, del, keys } from 'idb-keyval';

const META_PREFIX = 'meta:';
const metaStore = createStore('ace-step-project-organization', 'project-meta');

export interface ProjectMeta {
  projectId: string;
  folder: string | null;
  tags: string[];
  isFavorite: boolean;
  color: string | null;
  notes: string;
}

export interface ProjectSearchFilter {
  folder?: string;
  tag?: string;
  favoritesOnly?: boolean;
}

function metaKey(projectId: string): string {
  return `${META_PREFIX}${projectId}`;
}

function defaultMeta(projectId: string): ProjectMeta {
  return {
    projectId,
    folder: null,
    tags: [],
    isFavorite: false,
    color: null,
    notes: '',
  };
}

export async function getProjectMeta(projectId: string): Promise<ProjectMeta> {
  const data = await get<ProjectMeta>(metaKey(projectId), metaStore);
  return data ?? defaultMeta(projectId);
}

export async function setProjectMeta(meta: ProjectMeta): Promise<void> {
  await set(metaKey(meta.projectId), meta, metaStore);
}

export async function deleteProjectMeta(projectId: string): Promise<void> {
  await del(metaKey(projectId), metaStore);
}

export async function listProjectMetas(): Promise<ProjectMeta[]> {
  const allKeys = await keys(metaStore);
  const metaKeys = allKeys.filter(
    (k) => typeof k === 'string' && k.startsWith(META_PREFIX),
  ) as string[];

  const metas: ProjectMeta[] = [];
  for (const key of metaKeys) {
    const data = await get<ProjectMeta>(key, metaStore);
    if (data) metas.push(data);
  }
  return metas;
}

export async function toggleFavorite(projectId: string): Promise<ProjectMeta> {
  const meta = await getProjectMeta(projectId);
  meta.isFavorite = !meta.isFavorite;
  await setProjectMeta(meta);
  return meta;
}

export async function setProjectFolder(projectId: string, folder: string | null): Promise<ProjectMeta> {
  const meta = await getProjectMeta(projectId);
  meta.folder = folder;
  await setProjectMeta(meta);
  return meta;
}

export async function addProjectTag(projectId: string, tag: string): Promise<ProjectMeta> {
  const meta = await getProjectMeta(projectId);
  if (!meta.tags.includes(tag)) {
    meta.tags.push(tag);
  }
  await setProjectMeta(meta);
  return meta;
}

export async function removeProjectTag(projectId: string, tag: string): Promise<ProjectMeta> {
  const meta = await getProjectMeta(projectId);
  meta.tags = meta.tags.filter((t) => t !== tag);
  await setProjectMeta(meta);
  return meta;
}

export function searchProjects(
  metas: ProjectMeta[],
  filter: ProjectSearchFilter,
): ProjectMeta[] {
  return metas.filter((meta) => {
    if (filter.folder && meta.folder !== filter.folder) return false;
    if (filter.tag && !meta.tags.includes(filter.tag)) return false;
    if (filter.favoritesOnly && !meta.isFavorite) return false;
    return true;
  });
}
