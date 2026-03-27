import { get, set, del, keys } from 'idb-keyval';
import type { Project, ProjectTemplate } from '../types/project';
import { downloadBlob } from './browserDownload';
import { buildClipLayout, type ClipLayoutItem } from '../utils/clipLayout';

const PROJECT_PREFIX = 'project:';
const TEMPLATE_PREFIX = 'template:';
const AUDIO_PREFIX = 'audio:';
const ARCHIVE_MAGIC = 'ACED';

export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  trackCount: number;
  bpm: number;
  keyScale: string;
  clipLayout: ClipLayoutItem[];
}

export interface TemplateSummary {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  trackCount: number;
}

// ── Project library (IndexedDB) ──

export async function saveProject(project: Project): Promise<void> {
  // Store the object directly — IDB uses structured clone which is faster
  // than JSON.stringify on the main thread and avoids double-serialization.
  await set(`${PROJECT_PREFIX}${project.id}`, project);
}

export async function loadProject(id: string): Promise<Project | null> {
  const data = await get<string | Project>(`${PROJECT_PREFIX}${id}`);
  if (!data) return null;
  // Handle both legacy JSON-string format and new direct-object format
  if (typeof data === 'string') return JSON.parse(data);
  return data;
}

export async function deleteProject(id: string): Promise<void> {
  await del(`${PROJECT_PREFIX}${id}`);
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const allKeys = await keys();
  const projectKeys = allKeys.filter(
    (k) => typeof k === 'string' && k.startsWith(PROJECT_PREFIX),
  );

  const summaries: ProjectSummary[] = [];
  for (const key of projectKeys) {
    const data = await get<string | Project>(key as string);
    if (data) {
      const project: Project = typeof data === 'string' ? JSON.parse(data) : data;
      summaries.push({
        id: project.id,
        name: project.name,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        trackCount: project.tracks.length,
        bpm: project.bpm,
        keyScale: project.keyScale,
        clipLayout: buildClipLayout(project.tracks, project.totalDuration),
      });
    }
  }

  return summaries.sort((a, b) => b.updatedAt - a.updatedAt);
}

// ── Project templates (IndexedDB) ──

export async function saveTemplate(template: ProjectTemplate): Promise<void> {
  await set(`${TEMPLATE_PREFIX}${template.id}`, JSON.stringify(template));
}

export async function loadTemplate(id: string): Promise<ProjectTemplate | null> {
  const data = await get<string>(`${TEMPLATE_PREFIX}${id}`);
  if (!data) return null;
  return JSON.parse(data);
}

export async function deleteTemplate(id: string): Promise<void> {
  await del(`${TEMPLATE_PREFIX}${id}`);
}

export async function listTemplates(): Promise<TemplateSummary[]> {
  const allKeys = await keys();
  const templateKeys = allKeys.filter(
    (k) => typeof k === 'string' && k.startsWith(TEMPLATE_PREFIX),
  );

  const summaries: TemplateSummary[] = [];
  for (const key of templateKeys) {
    const data = await get<string>(key as string);
    if (data) {
      const template = JSON.parse(data) as ProjectTemplate;
      summaries.push({
        id: template.id,
        name: template.name,
        description: template.description,
        createdAt: template.createdAt,
        trackCount: template.tracks.length,
      });
    }
  }

  return summaries.sort((a, b) => b.createdAt - a.createdAt);
}

// ── Archive file export/import (.acedaw) ──
//
// Format:
//   [4 bytes: "ACED" magic]
//   [4 bytes: manifest length as uint32 LE]
//   [manifest JSON bytes (UTF-8)]
//   [concatenated audio blobs]
//
// Manifest:
//   { version: 1, project: Project, files: [{ key, offset, size }] }

interface ArchiveManifest {
  version: number;
  project: Project;
  files: { key: string; offset: number; size: number }[];
}

export async function exportProjectArchive(project: Project): Promise<void> {
  // Collect all audio blobs for this project from IDB
  const allKeys = await keys();
  const audioKeys = allKeys.filter(
    (k) => typeof k === 'string' && k.startsWith(`${AUDIO_PREFIX}${project.id}:`),
  ) as string[];

  const audioEntries: { key: string; blob: Blob }[] = [];
  for (const key of audioKeys) {
    const blob = await get<Blob>(key);
    if (blob) {
      audioEntries.push({ key, blob });
    }
  }

  // Build file table with offsets
  let offset = 0;
  const fileTable: { key: string; offset: number; size: number }[] = [];
  for (const entry of audioEntries) {
    fileTable.push({ key: entry.key, offset, size: entry.blob.size });
    offset += entry.blob.size;
  }

  const manifest: ArchiveManifest = {
    version: 1,
    project,
    files: fileTable,
  };

  const manifestJson = JSON.stringify(manifest);
  const manifestBytes = new TextEncoder().encode(manifestJson);

  // Build the archive buffer
  const headerSize = 4 + 4; // magic + manifest length
  const totalSize = headerSize + manifestBytes.length + offset;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // Write magic
  bytes[0] = ARCHIVE_MAGIC.charCodeAt(0);
  bytes[1] = ARCHIVE_MAGIC.charCodeAt(1);
  bytes[2] = ARCHIVE_MAGIC.charCodeAt(2);
  bytes[3] = ARCHIVE_MAGIC.charCodeAt(3);

  // Write manifest length
  view.setUint32(4, manifestBytes.length, true);

  // Write manifest
  bytes.set(manifestBytes, headerSize);

  // Write audio blobs
  let writeOffset = headerSize + manifestBytes.length;
  for (const entry of audioEntries) {
    const arrayBuf = await entry.blob.arrayBuffer();
    bytes.set(new Uint8Array(arrayBuf), writeOffset);
    writeOffset += entry.blob.size;
  }

  // Download
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  downloadBlob(blob, `${project.name.replace(/[^a-zA-Z0-9\-_ ]/g, '')}.acedaw`);
}

export async function importProjectArchive(): Promise<Project | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.acedaw';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }

      try {
        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        const view = new DataView(arrayBuffer);

        // Validate magic
        const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
        if (magic !== ARCHIVE_MAGIC) {
          throw new Error('Not a valid .acedaw file');
        }

        // Read manifest
        const manifestLen = view.getUint32(4, true);
        const headerSize = 8;
        const manifestBytes = bytes.slice(headerSize, headerSize + manifestLen);
        const manifestJson = new TextDecoder().decode(manifestBytes);
        const manifest: ArchiveManifest = JSON.parse(manifestJson);

        if (!manifest.project?.id || !Array.isArray(manifest.project.tracks)) {
          throw new Error('Invalid archive manifest');
        }

        // Restore audio blobs to IDB
        const dataStart = headerSize + manifestLen;
        for (const entry of manifest.files) {
          const blobBytes = bytes.slice(
            dataStart + entry.offset,
            dataStart + entry.offset + entry.size,
          );
          const blob = new Blob([blobBytes], { type: 'audio/wav' });
          await set(entry.key, blob);
        }

        // Save project to library
        await saveProject(manifest.project);

        resolve(manifest.project);
      } catch {
        resolve(null);
      }
    };
    input.click();
  });
}
