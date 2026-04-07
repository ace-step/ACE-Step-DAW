/**
 * React hook that connects MPE-aware MIDI input to the instrument engines.
 *
 * When enabled, hardware MIDI controllers route note and expression data
 * to the currently focused piano roll track. MPE controllers are auto-detected
 * via MCM (MPE Configuration Message) and per-note expression is applied.
 *
 * Acceptance criteria addressed:
 * - #960 item 1: Detect MPE-capable MIDI controllers (MCM detection)
 * - #960 item 2: Per-note pitch bend
 * - #960 item 3: Per-note slide (CC74) mapped to filter/timbre
 * - #960 item 4: Per-note pressure (aftertouch) mapped to dynamics
 */

import { useEffect, useState } from 'react';
import { useUIStore } from '../store/uiStore';
import { useProjectStore } from '../store/projectStore';
import { getEngineForInstrument } from '../engine/InstrumentFactory';
import {
  pitchBendToSemitones,
  getMpeZoneForChannel,
  MPE_DEFAULT_BEND_RANGE,
  MPE_MASTER_BEND_RANGE,
} from '../engine/dsp/core/mpe';
import type { MpeInputCallbacks, MpeInputState } from '../services/mpeInputService';
import type { Track } from '../types/project';

export interface UseMpeInputReturn {
  /** Current MPE state (isActive, config, device). */
  state: MpeInputState | null;
}

/**
 * Get the target track for MIDI input (the track with open piano roll).
 */
function getTargetTrack(): Track | null {
  const uiState = useUIStore.getState();
  const projectState = useProjectStore.getState();
  const trackId = uiState.openPianoRollTrackId;
  if (!trackId || !projectState.project) return null;
  return projectState.project.tracks.find((t) => t.id === trackId) ?? null;
}

/**
 * Route a note-on to the appropriate instrument engine for the target track.
 * Velocity is passed as raw MIDI value (0-127) to match engine expectations.
 */
function routeNoteOn(track: Track, pitch: number, velocity: number, channel: number): void {
  if (!track.instrument) return;
  const engine = getEngineForInstrument(track.instrument);
  engine.noteOn(track.id, pitch, velocity);
}

/**
 * Route a note-off to the appropriate instrument engine.
 */
function routeNoteOff(track: Track, pitch: number, channel: number): void {
  if (!track.instrument) return;
  const engine = getEngineForInstrument(track.instrument);
  engine.noteOff(track.id, pitch);
}

/**
 * Route per-note pitch bend to the instrument engine.
 */
function routePitchBend(track: Track, semitones: number, channel: number): void {
  if (!track.instrument) return;
  const engine = getEngineForInstrument(track.instrument);
  engine.pitchBend?.(track.id, semitones, channel);
}

/**
 * Route slide (CC74) to the instrument engine.
 */
function routeSlide(track: Track, value: number, channel: number): void {
  if (!track.instrument) return;
  const engine = getEngineForInstrument(track.instrument);
  engine.slide?.(track.id, value, channel);
}

/**
 * Route pressure (aftertouch) to the instrument engine.
 */
function routePressure(track: Track, value: number, channel: number): void {
  if (!track.instrument) return;
  const engine = getEngineForInstrument(track.instrument);
  engine.pressure?.(track.id, value, channel);
}

/**
 * Hook that initializes MPE input and routes MIDI messages to instrument engines.
 * Must be called from a component that is mounted when MPE input is desired
 * (e.g. PianoRoll or AppShell). Gate with `uiStore.mpeEnabled`.
 */
export function useMpeInput(enabled: boolean): UseMpeInputReturn {
  const [state, setState] = useState<MpeInputState | null>(null);

  useEffect(() => {
    if (!enabled) {
      setState(null);
      return;
    }

    let cleanup: (() => void) | undefined;

    import('../services/mpeInputService').then((service) => {
      const inputCallbacks: MpeInputCallbacks = {
        onNoteOn: (note, velocity, channel) => {
          const track = getTargetTrack();
          // velocity from mpeInputService is raw 0-127 (fixed)
          if (track) routeNoteOn(track, note, velocity, channel);
        },
        onNoteOff: (note, channel) => {
          const track = getTargetTrack();
          if (track) routeNoteOff(track, note, channel);
        },
        onPitchBend: (channel, value) => {
          const track = getTargetTrack();
          if (!track) return;
          const config = service.getMpeConfig();
          const isMember = getMpeZoneForChannel(config, channel) !== null;
          const range = isMember ? MPE_DEFAULT_BEND_RANGE : MPE_MASTER_BEND_RANGE;
          const semitones = pitchBendToSemitones(value, range);
          routePitchBend(track, semitones, channel);
        },
        onSlide: (channel, value) => {
          const track = getTargetTrack();
          if (track) routeSlide(track, value / 127, channel);
        },
        onPressure: (channel, value) => {
          const track = getTargetTrack();
          if (track) routePressure(track, value / 127, channel);
        },
        onMpeConfigChanged: () => {
          setState(service.getState());
        },
      };

      service.setMpeInputCallbacks(inputCallbacks);
      service.setMpeStateChangeCallback((newState) => {
        setState(newState);
      });

      service.initMpeInput().then((initialState) => {
        setState(initialState);
      });

      cleanup = () => {
        service.setMpeInputCallbacks(null);
        service.setMpeStateChangeCallback(null);
        service.disconnectMpeInput();
      };
    });

    return () => {
      cleanup?.();
    };
  }, [enabled]);

  return { state };
}
