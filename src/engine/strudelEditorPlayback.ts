let stopHandler: (() => void) | null = null;

/**
 * Register the live Strudel editor playback stop handler so transport controls
 * can stop editor-triggered playback as well as track-engine playback.
 */
export function registerStrudelEditorPlaybackStop(handler: (() => void) | null): void {
  stopHandler = handler;
}

/**
 * Stop any active Strudel editor playback.
 */
export function stopStrudelEditorPlayback(): void {
  stopHandler?.();
}
