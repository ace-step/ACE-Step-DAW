let stopHandler: (() => void) | null = null;
let editorAudioContext: AudioContext | null = null;

/**
 * Register the live Strudel editor playback stop handler so transport controls
 * can stop editor-triggered playback as well as track-engine playback.
 */
export function registerStrudelEditorPlaybackStop(handler: (() => void) | null): void {
  stopHandler = handler;
}

/**
 * Register the AudioContext used by the Strudel editor so we can force-stop
 * audio even after the editor component unmounts.
 */
export function registerStrudelEditorAudioContext(ctx: AudioContext | null): void {
  editorAudioContext = ctx;
}

/**
 * Stop any active Strudel editor playback.
 * Falls back to suspending the AudioContext if the handler was cleared
 * (e.g. editor component already unmounted).
 */
export function stopStrudelEditorPlayback(): void {
  if (stopHandler) {
    stopHandler();
  } else if (editorAudioContext && editorAudioContext.state === 'running') {
    // Nuclear fallback: suspend the AudioContext to kill all audio nodes.
    // Resume it immediately so future playback works.
    editorAudioContext.suspend().then(() => {
      editorAudioContext?.resume();
    });
  }
}
