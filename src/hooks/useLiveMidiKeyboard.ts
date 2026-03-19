import { useEffect, useRef } from 'react';
import type { Track } from '../types/project';
import { useProjectStore } from '../store/projectStore';
import { useTransportStore } from '../store/transportStore';
import { useUIStore } from '../store/uiStore';
import { synthEngine } from '../engine/SynthEngine';
import { samplerEngine } from '../engine/SamplerEngine';

const KEYBOARD_TO_SEMITONE: Record<string, number> = {
  KeyA: 0,
  KeyW: 1,
  KeyS: 2,
  KeyE: 3,
  KeyD: 4,
  KeyF: 5,
  KeyT: 6,
  KeyG: 7,
  KeyY: 8,
  KeyH: 9,
  KeyU: 10,
  KeyJ: 11,
  KeyK: 12,
};

function isTypingTarget(target: EventTarget | null) {
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || (target instanceof HTMLElement && target.isContentEditable);
}

async function ensureLiveInstrument(track: Track) {
  if (track.synthPreset === 'sampler' && (track.samplerConfig || track.sampler?.audioKey)) {
    const buffer = await samplerEngine.getTrackBuffer(track);
    const config = track.samplerConfig ?? (
      track.sampler?.audioKey
        ? {
            audioKey: track.sampler.audioKey,
            rootNote: track.sampler.rootNote ?? 60,
            attack: 0.005,
            decay: 0.1,
            sustain: 1,
            release: 0.3,
          }
        : null
    );
    if (buffer && config) {
      samplerEngine.ensureTrackSampler(track.id, config, buffer);
      return 'sampler' as const;
    }
  }

  await synthEngine.ensureStarted();
  synthEngine.ensureTrackSynth(track.id, track.synthPreset ?? 'piano');
  return 'synth' as const;
}

export function useLiveMidiKeyboard() {
  const activeNotesRef = useRef(new Map<string, { trackId: string; pitch: number; instrument: 'synth' | 'sampler' }>());
  const openTrackId = useUIStore((s) => s.openPianoRollTrackId);

  useEffect(() => {
    const releaseActiveNotes = () => {
      const recordMidiNoteOff = useProjectStore.getState().recordMidiNoteOff;
      const transportTime = useTransportStore.getState().currentTime;
      for (const [code, note] of activeNotesRef.current.entries()) {
        if (note.instrument === 'sampler') samplerEngine.noteOff(note.trackId, note.pitch);
        else synthEngine.noteOff(note.trackId, note.pitch);
        recordMidiNoteOff(note.trackId, note.pitch, { transportTime });
        activeNotesRef.current.delete(code);
      }
    };

    const handleKeyDown = async (event: KeyboardEvent) => {
      if (!openTrackId || event.repeat || event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) {
        return;
      }

      const semitone = KEYBOARD_TO_SEMITONE[event.code];
      if (semitone === undefined) return;

      const project = useProjectStore.getState().project;
      const track = project?.tracks.find((candidate) => candidate.id === openTrackId);
      if (!track || track.trackType !== 'pianoRoll') return;

      if (activeNotesRef.current.has(event.code)) return;

      event.preventDefault();

      const pitch = (track.sampler?.rootNote ?? track.samplerConfig?.rootNote ?? 60) + semitone;
      const instrument = await ensureLiveInstrument(track);
      const transportTime = useTransportStore.getState().currentTime;

      if (instrument === 'sampler') samplerEngine.noteOn(track.id, pitch, 96);
      else synthEngine.noteOn(track.id, pitch, 96);

      useProjectStore.getState().recordMidiNoteOn(track.id, pitch, 96, {
        source: 'live',
        transportTime,
      });

      activeNotesRef.current.set(event.code, { trackId: track.id, pitch, instrument });
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const note = activeNotesRef.current.get(event.code);
      if (!note) return;

      const transportTime = useTransportStore.getState().currentTime;
      if (note.instrument === 'sampler') samplerEngine.noteOff(note.trackId, note.pitch);
      else synthEngine.noteOff(note.trackId, note.pitch);

      useProjectStore.getState().recordMidiNoteOff(note.trackId, note.pitch, { transportTime });
      activeNotesRef.current.delete(event.code);
    };

    const handleBlur = () => releaseActiveNotes();

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      releaseActiveNotes();
    };
  }, [openTrackId]);
}
