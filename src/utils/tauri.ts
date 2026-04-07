/**
 * Tauri desktop bridge utilities.
 *
 * When the React app runs inside the Tauri WebView, `window.__TAURI_INTERNALS__`
 * is injected in Tauri v2. Older setups may still expose `window.__TAURI__`.
 * These helpers let the rest of the codebase check the runtime environment
 * without importing Tauri internals.
 */

/** Returns `true` when running inside the Tauri desktop shell. */
export function isTauri(): boolean {
  if (typeof window === 'undefined') return false;
  return '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
}

/** Invoke a Tauri command (no-op stub when running in browser). */
export async function invokeTauri<T = unknown>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T | null> {
  if (!isTauri()) return null;

  // Dynamic import so the bundle doesn't pull in @tauri-apps/api in web mode
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}
