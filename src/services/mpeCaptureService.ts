/**
 * MpeCaptureService — records per-note MPE expression data
 * (pitch bend, CC74 timbre, channel pressure) into a rolling buffer.
 *
 * Works alongside MidiCaptureService, adding expression curves
 * keyed by MIDI channel (MPE assigns one channel per note).
 *
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/960
 */

import type { MpeExpressionData, ExpressionPoint } from '../types/project';

export interface CapturedMpeEvent {
  pitch: number;
  velocity: number;
  channel: number;
  timeOn: number;
  timeOff: number;
  expression: {
    pitchBendCurve: Array<{ time: number; value: number }>;
    timbreCurve: Array<{ time: number; value: number }>;
    pressureCurve: Array<{ time: number; value: number }>;
  };
}

export interface MpeDrainResult {
  notes: Array<{
    pitch: number;
    velocity: number;
    startBeat: number;
    durationBeats: number;
    mpeExpression?: MpeExpressionData;
  }>;
  clipStartTime: number;
  clipDuration: number;
}

export class MpeCaptureService {
  private _buffers = new Map<string, CapturedMpeEvent[]>();
  /** Active notes keyed by trackId → channel → event */
  private _activeNotes = new Map<string, Map<number, CapturedMpeEvent>>();

  noteOn(trackId: string, channel: number, pitch: number, velocity: number, time: number): void {
    const event: CapturedMpeEvent = {
      pitch,
      velocity,
      channel,
      timeOn: time,
      timeOff: 0,
      expression: {
        pitchBendCurve: [],
        timbreCurve: [],
        pressureCurve: [],
      },
    };

    if (!this._activeNotes.has(trackId)) {
      this._activeNotes.set(trackId, new Map());
    }
    this._activeNotes.get(trackId)!.set(channel, event);

    if (!this._buffers.has(trackId)) {
      this._buffers.set(trackId, []);
    }
    this._buffers.get(trackId)!.push(event);
  }

  noteOff(trackId: string, channel: number, pitch: number, time: number): void {
    const active = this._activeNotes.get(trackId);
    if (!active) return;
    const event = active.get(channel);
    if (event && event.pitch === pitch) {
      event.timeOff = time;
      active.delete(channel);
    }
  }

  recordPitchBend(trackId: string, channel: number, value: number, time: number): void {
    const event = this._getActiveNote(trackId, channel);
    if (event) {
      event.expression.pitchBendCurve.push({ time, value });
    }
  }

  recordTimbre(trackId: string, channel: number, value: number, time: number): void {
    const event = this._getActiveNote(trackId, channel);
    if (event) {
      event.expression.timbreCurve.push({ time, value });
    }
  }

  recordPressure(trackId: string, channel: number, value: number, time: number): void {
    const event = this._getActiveNote(trackId, channel);
    if (event) {
      event.expression.pressureCurve.push({ time, value });
    }
  }

  getBuffer(trackId: string): CapturedMpeEvent[] {
    return this._buffers.get(trackId) ?? [];
  }

  drain(
    trackId: string,
    captureTime: number,
    bpm: number,
    timeSignature: number,
    bars: number,
  ): MpeDrainResult | null {
    const events = this._buffers.get(trackId);
    if (!events || events.length === 0) return null;

    const beatsPerBar = timeSignature;
    const secondsPerBeat = 60 / bpm;
    const barDuration = beatsPerBar * secondsPerBeat;
    const captureDuration = bars * barDuration;

    const captureStart = Math.max(0, captureTime - captureDuration);
    const clipStartTime = Math.floor(captureStart / barDuration) * barDuration;
    const clipEndTime = clipStartTime + bars * barDuration;
    const clipDuration = clipEndTime - clipStartTime;

    // Close held notes
    const activeForTrack = this._activeNotes.get(trackId);
    if (activeForTrack) {
      for (const event of activeForTrack.values()) {
        if (event.timeOff === 0) event.timeOff = captureTime;
      }
      activeForTrack.clear();
    }

    const notes: MpeDrainResult['notes'] = [];
    for (const e of events) {
      const noteEnd = e.timeOff > 0 ? e.timeOff : captureTime;
      if (noteEnd <= clipStartTime || e.timeOn >= clipEndTime) continue;

      const clampedStart = Math.max(e.timeOn, clipStartTime);
      const clampedEnd = Math.min(noteEnd, clipEndTime);
      const durationSec = clampedEnd - clampedStart;
      if (durationSec <= 0) continue;

      const startBeat = (clampedStart - clipStartTime) / secondsPerBeat;
      const durationBeats = durationSec / secondsPerBeat;

      // Convert expression times to beat offsets relative to note start
      const mpeExpression = this._buildExpression(e, clampedStart, secondsPerBeat);

      notes.push({
        pitch: e.pitch,
        velocity: e.velocity,
        startBeat: Math.round(startBeat * 1000) / 1000,
        durationBeats: Math.round(durationBeats * 1000) / 1000,
        mpeExpression: mpeExpression || undefined,
      });
    }

    if (notes.length === 0) return null;

    this._buffers.delete(trackId);
    return { notes, clipStartTime, clipDuration };
  }

  clearAll(): void {
    this._buffers.clear();
    this._activeNotes.clear();
  }

  private _getActiveNote(trackId: string, channel: number): CapturedMpeEvent | undefined {
    return this._activeNotes.get(trackId)?.get(channel);
  }

  private _buildExpression(
    event: CapturedMpeEvent,
    noteStartTime: number,
    secondsPerBeat: number,
  ): MpeExpressionData | null {
    const noteEndTime = event.timeOff;
    const convertCurve = (
      curve: Array<{ time: number; value: number }>,
    ): ExpressionPoint[] | undefined => {
      // Trim to note time window to avoid negative beat offsets
      const trimmed = curve.filter(
        (p) => p.time >= noteStartTime && p.time <= noteEndTime,
      );
      if (trimmed.length === 0) return undefined;
      return trimmed.map((p) => ({
        beat: (p.time - noteStartTime) / secondsPerBeat,
        value: p.value,
      }));
    };

    const pitchBendCurve = convertCurve(event.expression.pitchBendCurve);
    const timbreCurve = convertCurve(event.expression.timbreCurve);
    const pressureCurve = convertCurve(event.expression.pressureCurve);

    if (!pitchBendCurve && !timbreCurve && !pressureCurve) return null;

    return { pitchBendCurve, timbreCurve, pressureCurve };
  }
}
