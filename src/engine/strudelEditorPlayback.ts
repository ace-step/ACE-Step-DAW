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
 * Get the registered Strudel editor AudioContext.
 */
export function getStrudelEditorAudioContext(): AudioContext | null {
  return editorAudioContext;
}

/**
 * Resume all Strudel-related AudioContexts that may have been suspended by stop.
 * Call this before evaluate/play to ensure audio can flow again.
 */
export async function resumeStrudelAudio(): Promise<void> {
  if (editorAudioContext?.state === 'suspended') {
    await editorAudioContext.resume();
  }
  // Also resume superdough's internal context if different
  try {
    const sd = await import('superdough');
    const superdoughCtx = sd.getAudioContext?.();
    if (superdoughCtx && superdoughCtx !== editorAudioContext && superdoughCtx.state === 'suspended') {
      await superdoughCtx.resume();
    }
  } catch {
    // superdough not available
  }
}

/**
 * Stop any active Strudel editor playback.
 *
 * Calls the stop handler if registered, then suspends the AudioContext to
 * silence superdough audio nodes. Also dynamically imports superdough to
 * suspend its internal AudioContext (which may differ from the registered one).
 *
 * The AudioContext is NOT resumed here — it will be resumed on next play.
 */
export function stopStrudelEditorPlayback(): void {
  if (stopHandler) {
    stopHandler();
  }
  // Suspend the registered Strudel AudioContext
  if (editorAudioContext && editorAudioContext.state === 'running') {
    editorAudioContext.suspend();
  }
  // Also suspend superdough's internal AudioContext — it may be a different
  // instance than the one registered if timing/init order differed.
  import('superdough').then((sd) => {
    const superdoughCtx = sd.getAudioContext?.();
    if (superdoughCtx && superdoughCtx !== editorAudioContext && superdoughCtx.state === 'running') {
      superdoughCtx.suspend();
    }
  }).catch(() => {});
}
