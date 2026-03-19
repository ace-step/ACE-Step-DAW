export type MidiCaptureSource = 'live' | 'agent';

export interface MidiCapturePoint {
  timestampMs: number;
  transportTime: number | null;
  transportBeat: number | null;
}

export interface MidiCaptureSpan {
  trackId: string;
  pitch: number;
  velocity: number;
  startedAtMs: number;
  endedAtMs: number;
  startTransportTime: number | null;
  endTransportTime: number | null;
  startTransportBeat: number | null;
  endTransportBeat: number | null;
  source: MidiCaptureSource;
}

interface ActiveMidiNote {
  pitch: number;
  velocity: number;
  point: MidiCapturePoint;
  source: MidiCaptureSource;
}

const MAX_BUFFER_MS = 60_000;

class MidiCaptureBuffer {
  private completedNotes = new Map<string, MidiCaptureSpan[]>();
  private activeNotes = new Map<string, Map<number, ActiveMidiNote[]>>();

  recordNoteOn(
    trackId: string,
    pitch: number,
    velocity: number,
    point: MidiCapturePoint,
    source: MidiCaptureSource,
  ) {
    this.prune(point.timestampMs);
    const trackActive = this.activeNotes.get(trackId) ?? new Map<number, ActiveMidiNote[]>();
    const pitchStack = trackActive.get(pitch) ?? [];
    pitchStack.push({ pitch, velocity, point, source });
    trackActive.set(pitch, pitchStack);
    this.activeNotes.set(trackId, trackActive);
  }

  recordNoteOff(trackId: string, pitch: number, point: MidiCapturePoint) {
    this.prune(point.timestampMs);
    const trackActive = this.activeNotes.get(trackId);
    const pitchStack = trackActive?.get(pitch);
    const active = pitchStack?.pop();
    if (!active) return;

    if (pitchStack && pitchStack.length > 0) {
      trackActive!.set(pitch, pitchStack);
    } else {
      trackActive?.delete(pitch);
    }

    const completed = this.completedNotes.get(trackId) ?? [];
    completed.push({
      trackId,
      pitch,
      velocity: active.velocity,
      startedAtMs: active.point.timestampMs,
      endedAtMs: Math.max(point.timestampMs, active.point.timestampMs),
      startTransportTime: active.point.transportTime,
      endTransportTime: point.transportTime,
      startTransportBeat: active.point.transportBeat,
      endTransportBeat: point.transportBeat,
      source: active.source,
    });
    this.completedNotes.set(trackId, completed);
  }

  getSnapshot(trackId: string, now: MidiCapturePoint, lookbackMs: number): MidiCaptureSpan[] {
    this.prune(now.timestampMs);
    const cutoff = now.timestampMs - lookbackMs;
    const completed = (this.completedNotes.get(trackId) ?? []).filter((note) => note.endedAtMs >= cutoff);
    const active = [...(this.activeNotes.get(trackId)?.values() ?? [])]
      .flat()
      .filter((note) => note.point.timestampMs >= cutoff)
      .map<MidiCaptureSpan>((note) => ({
        trackId,
        pitch: note.pitch,
        velocity: note.velocity,
        startedAtMs: note.point.timestampMs,
        endedAtMs: now.timestampMs,
        startTransportTime: note.point.transportTime,
        endTransportTime: now.transportTime,
        startTransportBeat: note.point.transportBeat,
        endTransportBeat: now.transportBeat,
        source: note.source,
      }));

    return [...completed, ...active].sort((a, b) => a.startedAtMs - b.startedAtMs);
  }

  clear() {
    this.completedNotes.clear();
    this.activeNotes.clear();
  }

  private prune(nowMs: number) {
    const cutoff = nowMs - MAX_BUFFER_MS;

    for (const [trackId, notes] of this.completedNotes.entries()) {
      const kept = notes.filter((note) => note.endedAtMs >= cutoff);
      if (kept.length > 0) {
        this.completedNotes.set(trackId, kept);
      } else {
        this.completedNotes.delete(trackId);
      }
    }

    for (const [trackId, notesByPitch] of this.activeNotes.entries()) {
      for (const [pitch, notes] of notesByPitch.entries()) {
        const kept = notes.filter((note) => note.point.timestampMs >= cutoff);
        if (kept.length > 0) {
          notesByPitch.set(pitch, kept);
        } else {
          notesByPitch.delete(pitch);
        }
      }

      if (notesByPitch.size === 0) {
        this.activeNotes.delete(trackId);
      }
    }
  }
}

export const midiCaptureBuffer = new MidiCaptureBuffer();
