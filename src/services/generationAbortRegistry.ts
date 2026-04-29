/**
 * generationAbortRegistry.ts — Module-level AbortController registry for generation jobs.
 *
 * Separated from generationPipeline.ts to avoid circular imports
 * (generationStore ↔ generationPipeline).
 */

const _controllers = new Map<string, AbortController>();

/** Register an AbortController for a generation job. */
export function registerJobAbortController(jobId: string): AbortController {
  const existing = _controllers.get(jobId);
  if (existing) existing.abort();
  const controller = new AbortController();
  _controllers.set(jobId, controller);
  return controller;
}

/** Abort and unregister the controller for a job. Returns true if a controller existed. */
export function abortJob(jobId: string): boolean {
  const controller = _controllers.get(jobId);
  if (!controller) return false;
  controller.abort();
  _controllers.delete(jobId);
  return true;
}

/** Remove the controller for a completed job without aborting. */
export function unregisterJobAbortController(jobId: string): void {
  _controllers.delete(jobId);
}

/** Check if a job's controller has been aborted. */
export function isJobAborted(jobId: string): boolean {
  const controller = _controllers.get(jobId);
  return controller?.signal.aborted ?? false;
}

/** Get the abort signal for a job, if registered. */
export function getJobAbortSignal(jobId: string): AbortSignal | undefined {
  return _controllers.get(jobId)?.signal;
}

/** Get the number of registered controllers (for testing). */
export function getActiveControllerCount(): number {
  return _controllers.size;
}

/** Clear all registered controllers (for testing). */
export function clearAllControllers(): void {
  for (const controller of _controllers.values()) {
    controller.abort();
  }
  _controllers.clear();
}
