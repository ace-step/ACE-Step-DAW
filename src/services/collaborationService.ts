import type { Project } from '../types/project';

// ── Share bundle format ──
// A lightweight JSON bundle for sharing projects without audio blobs.
// Audio keys are preserved so recipients can re-generate or request audio separately.

export interface ShareBundle {
  version: number;
  format: 'ace-step-share';
  project: Project;
  sharedAt: number;
  sharedBy?: string;
}

export interface ShareLinkOptions {
  readOnly?: boolean;
  expiresAt?: number;
}

export interface ShareLink {
  url: string;
  projectId: string;
  readOnly: boolean;
  expiresAt: number | null;
  token: string;
}

/**
 * Export a project as a shareable JSON bundle string.
 */
export function exportShareBundle(project: Project, sharedBy?: string): string {
  const bundle: ShareBundle = {
    version: 1,
    format: 'ace-step-share',
    project: {
      ...project,
      updatedAt: Date.now(),
    },
    sharedAt: Date.now(),
    sharedBy,
  };
  return JSON.stringify(bundle);
}

/**
 * Parse and validate a share bundle JSON string, returning the project.
 * Throws on invalid input.
 */
export function importShareBundle(json: string): ShareBundle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Invalid share bundle: not valid JSON');
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('format' in parsed) ||
    (parsed as Record<string, unknown>).format !== 'ace-step-share'
  ) {
    throw new Error('Invalid share bundle: missing or wrong format field');
  }

  const bundle = parsed as ShareBundle;

  if (!bundle.project?.id || !Array.isArray(bundle.project.tracks)) {
    throw new Error('Invalid share bundle: missing project data');
  }

  return bundle;
}

/**
 * Generate a share token (deterministic hash for reproducibility in tests).
 */
export function generateShareToken(projectId: string, timestamp: number): string {
  // Simple hash: base36-encoded combination of project ID hash and timestamp
  let hash = 0;
  const input = `${projectId}-${timestamp}`;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(36).padStart(8, '0');
}

/**
 * Generate a share link for a project.
 * In Phase 1, this creates a client-side link with the project data encoded in the URL hash.
 * Future phases will use a cloud backend.
 */
export function generateShareLink(
  project: Project,
  baseUrl: string,
  options: ShareLinkOptions = {},
): ShareLink {
  const { readOnly = true, expiresAt } = options;
  const timestamp = Date.now();
  const token = generateShareToken(project.id, timestamp);

  const params = new URLSearchParams();
  params.set('share', token);
  params.set('project', project.id);
  if (readOnly) params.set('mode', 'viewer');
  if (expiresAt) params.set('expires', String(expiresAt));

  const url = `${baseUrl}?${params.toString()}`;

  return {
    url,
    projectId: project.id,
    readOnly,
    expiresAt: expiresAt ?? null,
    token,
  };
}

/**
 * Parse share parameters from a URL search string.
 * Returns null if the URL is not a share link.
 */
export function parseShareParams(search: string): {
  token: string;
  projectId: string;
  readOnly: boolean;
  expiresAt: number | null;
} | null {
  const params = new URLSearchParams(search);
  const token = params.get('share');
  const projectId = params.get('project');

  if (!token || !projectId) return null;

  const readOnly = params.get('mode') === 'viewer';
  const expiresStr = params.get('expires');
  const expiresAt = expiresStr ? Number(expiresStr) : null;

  return { token, projectId, readOnly, expiresAt };
}

/**
 * Download share bundle as a .json file.
 */
export function downloadShareBundle(project: Project, sharedBy?: string): void {
  const json = exportShareBundle(project, sharedBy);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.name.replace(/[^a-zA-Z0-9\-_ ]/g, '')}-share.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Import a share bundle from a file picker.
 * Returns the parsed bundle, or null if cancelled/invalid.
 */
export function importShareBundleFromFile(): Promise<ShareBundle | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      try {
        const text = await file.text();
        resolve(importShareBundle(text));
      } catch {
        resolve(null);
      }
    };
    input.click();
  });
}

/**
 * Copy share link to clipboard.
 * Returns true if successful.
 */
export async function copyShareLinkToClipboard(url: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}
