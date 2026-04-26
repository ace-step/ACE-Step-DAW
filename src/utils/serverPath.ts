/**
 * Extract a server-relative file path from the audio URL returned by the backend.
 * The backend URL is typically `/v1/audio?path=/tmp/.../output.wav`.
 *
 * The release_task endpoint rejects absolute paths ("absolute audio file paths
 * are not allowed"), so we only return paths that are relative. Since the
 * backend currently always returns absolute paths in the `path` query param,
 * this effectively disables the server-path optimisation and forces blob upload
 * — which is correct and avoids the 400 error in multi-stem generation (#1702).
 */

function isAbsoluteServerPath(p: string): boolean {
  return (
    p.startsWith('/') ||
    p.startsWith('\\\\') ||
    p.startsWith('//') ||
    /^[A-Za-z]:[/\\]/.test(p)
  );
}

export function sanitizeServerPath(serverPath: string | null | undefined): string | null {
  if (!serverPath || isAbsoluteServerPath(serverPath)) return null;
  return serverPath;
}

export function extractServerPath(audioPath: string): string | null {
  try {
    const url = new URL(audioPath, 'http://localhost');
    const p = url.searchParams.get('path');
    return sanitizeServerPath(p);
  } catch {
    // not a valid URL — fall through
  }
  return null;
}
