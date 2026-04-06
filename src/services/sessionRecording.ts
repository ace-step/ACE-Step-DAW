/**
 * Session Recording Manager — state machine for recording into session clip slots.
 *
 * Tracks which slots are recording, armed tracks, recording metadata,
 * and elapsed time. Pure state logic — no audio/MIDI capture here.
 * Audio/MIDI capture is delegated to RecordingEngine and MidiCaptureService.
 */

export type SessionSlotRecordingState = 'idle' | 'recording';

export type RecordingType = 'audio' | 'midi';

export interface SlotRecordingRequest {
  trackId: string;
  sceneId: string;
  slotId: string;
  recordingType: RecordingType;
  /** Number of bars to record, or null for manual stop. */
  fixedLengthBars: number | null;
}

export interface ActiveSlotRecording {
  trackId: string;
  sceneId: string;
  slotId: string;
  recordingType: RecordingType;
  fixedLengthBars: number | null;
  startedAt: number; // performance.now() timestamp
}

export interface SlotRecordingResult {
  trackId: string;
  sceneId: string;
  slotId: string;
  recordingType: RecordingType;
  fixedLengthBars: number | null;
  startedAt: number;
  elapsedMs: number;
}

export interface SessionRecordingManager {
  getState(): SessionSlotRecordingState;
  getArmedTrackIds(): string[];
  getRecordingSlots(): ActiveSlotRecording[];
  armTrack(trackId: string): void;
  disarmTrack(trackId: string): void;
  startSlotRecording(request: SlotRecordingRequest): boolean;
  stopSlotRecording(slotId: string): SlotRecordingResult | null;
  stopAllRecordings(): SlotRecordingResult[];
  dispose(): void;
}

export function createSessionRecordingManager(): SessionRecordingManager {
  const armedTrackIds = new Set<string>();
  const activeRecordings = new Map<string, ActiveSlotRecording>();

  function getState(): SessionSlotRecordingState {
    return activeRecordings.size > 0 ? 'recording' : 'idle';
  }

  function getArmedTrackIds(): string[] {
    return Array.from(armedTrackIds);
  }

  function getRecordingSlots(): ActiveSlotRecording[] {
    return Array.from(activeRecordings.values());
  }

  function armTrack(trackId: string): void {
    armedTrackIds.add(trackId);
  }

  function disarmTrack(trackId: string): void {
    armedTrackIds.delete(trackId);
    // Stop any active recordings on this track
    for (const [slotId, recording] of activeRecordings) {
      if (recording.trackId === trackId) {
        activeRecordings.delete(slotId);
      }
    }
  }

  function startSlotRecording(request: SlotRecordingRequest): boolean {
    if (!armedTrackIds.has(request.trackId)) {
      return false;
    }

    const recording: ActiveSlotRecording = {
      trackId: request.trackId,
      sceneId: request.sceneId,
      slotId: request.slotId,
      recordingType: request.recordingType,
      fixedLengthBars: request.fixedLengthBars,
      startedAt: performance.now(),
    };

    activeRecordings.set(request.slotId, recording);
    return true;
  }

  function stopSlotRecording(slotId: string): SlotRecordingResult | null {
    const recording = activeRecordings.get(slotId);
    if (!recording) return null;

    activeRecordings.delete(slotId);

    return {
      trackId: recording.trackId,
      sceneId: recording.sceneId,
      slotId: recording.slotId,
      recordingType: recording.recordingType,
      fixedLengthBars: recording.fixedLengthBars,
      startedAt: recording.startedAt,
      elapsedMs: performance.now() - recording.startedAt,
    };
  }

  function stopAllRecordings(): SlotRecordingResult[] {
    const results: SlotRecordingResult[] = [];
    for (const slotId of Array.from(activeRecordings.keys())) {
      const result = stopSlotRecording(slotId);
      if (result) results.push(result);
    }
    return results;
  }

  function dispose(): void {
    activeRecordings.clear();
    armedTrackIds.clear();
  }

  return {
    getState,
    getArmedTrackIds,
    getRecordingSlots,
    armTrack,
    disarmTrack,
    startSlotRecording,
    stopSlotRecording,
    stopAllRecordings,
    dispose,
  };
}
