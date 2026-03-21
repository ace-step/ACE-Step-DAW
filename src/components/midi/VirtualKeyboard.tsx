import { useEffect, useRef } from 'react';
import { synthEngine } from '../../engine/SynthEngine';
import { getMidiCaptureService } from '../../services/midiCaptureService';
import { isEditableShortcutTarget } from '../../services/coreDawShortcuts';
import { useProjectStore } from '../../store/projectStore';
import { useTransportStore } from '../../store/transportStore';
import { useUIStore } from '../../store/uiStore';
import type { Track } from '../../types/project';

const WHITE_KEY_BINDINGS = [
  { code: 'KeyA', semitone: 0, label: 'A' },
  { code: 'KeyS', semitone: 2, label: 'S' },
  { code: 'KeyD', semitone: 4, label: 'D' },
  { code: 'KeyF', semitone: 5, label: 'F' },
  { code: 'KeyG', semitone: 7, label: 'G' },
  { code: 'KeyH', semitone: 9, label: 'H' },
  { code: 'KeyJ', semitone: 11, label: 'J' },
  { code: 'KeyK', semitone: 12, label: 'K' },
  { code: 'KeyL', semitone: 14, label: 'L' },
] as const;

const BLACK_KEY_BINDINGS = [
  { code: 'KeyW', semitone: 1, label: 'W' },
  { code: 'KeyE', semitone: 3, label: 'E' },
  { code: 'KeyT', semitone: 6, label: 'T' },
  { code: 'KeyY', semitone: 8, label: 'Y' },
  { code: 'KeyU', semitone: 10, label: 'U' },
] as const;

const NOTE_BINDINGS = [...WHITE_KEY_BINDINGS, ...BLACK_KEY_BINDINGS];
const CONTROL_CODES = new Set(['KeyZ', 'KeyX', 'KeyC', 'KeyV']);
const BLACK_KEY_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);
const MIN_NOTE_DURATION_BEATS = 0.125;

interface HeldNote {
  pitch: number;
  trackId: string | null;
  clipId: string | null;
  clipStartTime: number;
  startTime: number;
  velocity: number;
}

function clampMidiPitch(value: number) {
  return Math.min(127, Math.max(0, value));
}

function midiNoteToName(pitch: number) {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(pitch / 12) - 1;
  return `${names[pitch % 12]}${octave}`;
}

function resolvePitch(code: string, octave: number) {
  const binding = NOTE_BINDINGS.find((candidate) => candidate.code === code);
  if (!binding) return null;
  return clampMidiPitch((octave + 1) * 12 + binding.semitone);
}

function isBlackKeyPitch(pitch: number) {
  return BLACK_KEY_PITCH_CLASSES.has(pitch % 12);
}

function shouldRecordIntoPianoRoll(track: Track | null) {
  if (!track || track.trackType !== 'pianoRoll') return false;
  const transport = useTransportStore.getState();
  return transport.isRecording && transport.armedTrackIds.includes(track.id);
}

function resolveTargetTrack() {
  const project = useProjectStore.getState().project;
  const ui = useUIStore.getState();
  const transport = useTransportStore.getState();
  if (!project) return null;

  const byId = (trackId: string | null | undefined) => (
    trackId ? project.tracks.find((track) => track.id === trackId) ?? null : null
  );

  for (const trackId of transport.armedTrackIds) {
    const armedTrack = byId(trackId);
    if (armedTrack?.trackType === 'pianoRoll') return armedTrack;
  }

  const fallbackTrackId =
    transport.armedTrackIds[0]
    ?? ui.openPianoRollTrackId
    ?? ui.keyboardContext.trackId
    ?? project.tracks.find((track) => track.trackType === 'pianoRoll')?.id
    ?? null;

  return byId(fallbackTrackId);
}

export function VirtualKeyboard() {
  const showVirtualKeyboard = useUIStore((state) => state.showVirtualKeyboard);
  const octave = useUIStore((state) => state.virtualKeyboardOctave);
  const velocity = useUIStore((state) => state.virtualKeyboardVelocity);
  const pressedPitches = useUIStore((state) => state.virtualKeyboardPressedPitches);
  const heldNotesRef = useRef<Map<string, HeldNote>>(new Map());

  useEffect(() => {
    const releaseHeldNotes = () => {
      const transport = useTransportStore.getState();
      const captureService = getMidiCaptureService();
      for (const [code, note] of heldNotesRef.current.entries()) {
        if (note.trackId) {
          synthEngine.noteOff(note.trackId, note.pitch);
          captureService.noteOff(note.trackId, note.pitch, transport.currentTime);
        }
        useUIStore.getState().releaseVirtualKeyboardPitch(note.pitch);
        heldNotesRef.current.delete(code);
      }
    };

    if (!showVirtualKeyboard) {
      releaseHeldNotes();
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableShortcutTarget(event.target) || isEditableShortcutTarget(document.activeElement)) return;

      if (event.code === 'KeyZ') {
        event.preventDefault();
        if (!event.repeat) useUIStore.getState().adjustVirtualKeyboardOctave(-1);
        return;
      }
      if (event.code === 'KeyX') {
        event.preventDefault();
        if (!event.repeat) useUIStore.getState().adjustVirtualKeyboardOctave(1);
        return;
      }
      if (event.code === 'KeyC') {
        event.preventDefault();
        if (!event.repeat) useUIStore.getState().adjustVirtualKeyboardVelocity(-8);
        return;
      }
      if (event.code === 'KeyV') {
        event.preventDefault();
        if (!event.repeat) useUIStore.getState().adjustVirtualKeyboardVelocity(8);
        return;
      }

      const pitch = resolvePitch(event.code, useUIStore.getState().virtualKeyboardOctave);
      if (pitch === null) return;

      event.preventDefault();
      if (event.repeat || heldNotesRef.current.has(event.code)) return;

      const targetTrack = resolveTargetTrack();
      const captureService = getMidiCaptureService();
      const nextVelocity = useUIStore.getState().virtualKeyboardVelocity;
      const startTime = useTransportStore.getState().currentTime;
      const velocityNormalized = nextVelocity / 127;
      let clipId: string | null = null;
      let clipStartTime = 0;

      if (targetTrack) {
        synthEngine.ensureTrackSynth(targetTrack.id, targetTrack.synthPreset ?? 'piano');
        synthEngine.noteOn(targetTrack.id, pitch, nextVelocity);
        captureService.noteOn(targetTrack.id, pitch, velocityNormalized, startTime);

        if (shouldRecordIntoPianoRoll(targetTrack)) {
          const clip = useProjectStore.getState().ensureMidiClip(targetTrack.id, startTime);
          clipId = clip.id;
          clipStartTime = clip.startTime;
        }
      }

      useUIStore.getState().pressVirtualKeyboardPitch(pitch);
      heldNotesRef.current.set(event.code, {
        pitch,
        trackId: targetTrack?.id ?? null,
        clipId,
        clipStartTime,
        startTime,
        velocity: nextVelocity,
      });
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (CONTROL_CODES.has(event.code)) return;

      const held = heldNotesRef.current.get(event.code);
      if (!held) return;

      event.preventDefault();
      const transport = useTransportStore.getState();
      const project = useProjectStore.getState();
      const captureService = getMidiCaptureService();

      if (held.trackId) {
        synthEngine.noteOff(held.trackId, held.pitch);
        captureService.noteOff(held.trackId, held.pitch, transport.currentTime);
      }

      if (held.clipId) {
        const secondsPerBeat = 60 / (project.project?.bpm ?? 120);
        const noteStartBeat = Math.max(0, (held.startTime - held.clipStartTime) / secondsPerBeat);
        const noteDurationBeats = Math.max(
          MIN_NOTE_DURATION_BEATS,
          (transport.currentTime - held.startTime) / secondsPerBeat,
        );
        project.addMidiNote(held.clipId, {
          pitch: held.pitch,
          startBeat: Math.round(noteStartBeat * 1000) / 1000,
          durationBeats: Math.round(noteDurationBeats * 1000) / 1000,
          velocity: held.velocity / 127,
        });

        const clip = project.getClipById(held.clipId);
        const clipEndTime = transport.currentTime;
        if (clip && clipEndTime > clip.startTime + clip.duration) {
          project.updateClip(held.clipId, { duration: clipEndTime - clip.startTime });
        }
      }

      useUIStore.getState().releaseVirtualKeyboardPitch(held.pitch);
      heldNotesRef.current.delete(event.code);
    };

    const handleBlur = () => {
      releaseHeldNotes();
      useUIStore.getState().clearVirtualKeyboardPressedPitches();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      releaseHeldNotes();
      useUIStore.getState().clearVirtualKeyboardPressedPitches();
    };
  }, [showVirtualKeyboard]);

  if (!showVirtualKeyboard) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-6 z-[70] mx-auto flex w-[min(980px,calc(100vw-24px))] flex-col gap-3 rounded-2xl border border-white/10 bg-[#101521]/95 px-4 py-3 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-md"
      aria-label="Virtual MIDI keyboard"
      role="region"
    >
      <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
        <span>Virtual MIDI Keyboard</span>
        <div className="flex items-center gap-3 text-[10px] tracking-[0.16em] text-zinc-500">
          <span>Oct {octave}</span>
          <span>Vel {velocity}</span>
          <span>/ Toggle</span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 text-[10px] text-zinc-400">
        <div className="rounded-xl border border-white/8 bg-white/[0.04] px-3 py-2">Z/X Octave</div>
        <div className="rounded-xl border border-white/8 bg-white/[0.04] px-3 py-2">C/V Velocity</div>
        <div className="rounded-xl border border-white/8 bg-white/[0.04] px-3 py-2">A-L White Keys</div>
        <div className="rounded-xl border border-white/8 bg-white/[0.04] px-3 py-2">W-U Black Keys</div>
      </div>

      <div className="relative flex h-40 items-end gap-1 rounded-2xl border border-white/8 bg-[#151c28] px-2 pb-2 pt-3">
        {WHITE_KEY_BINDINGS.map((binding) => {
          const pitch = resolvePitch(binding.code, octave) ?? 60;
          const isPressed = pressedPitches.includes(pitch);
          const noteName = midiNoteToName(pitch);
          return (
            <button
              key={binding.code}
              type="button"
              aria-label={`Virtual key ${noteName}`}
              aria-pressed={isPressed}
              className={`relative flex h-full flex-1 items-end justify-center rounded-b-[18px] border px-1 pb-2 text-[11px] font-medium transition ${
                isPressed
                  ? 'border-sky-300 bg-sky-200 text-slate-900 shadow-[inset_0_-8px_20px_rgba(14,116,144,0.22)]'
                  : 'border-slate-300/50 bg-[#f4f7fb] text-slate-700'
              }`}
              onMouseDown={(event) => {
                event.preventDefault();
                window.dispatchEvent(new KeyboardEvent('keydown', { code: binding.code }));
              }}
              onMouseUp={(event) => {
                event.preventDefault();
                window.dispatchEvent(new KeyboardEvent('keyup', { code: binding.code }));
              }}
              onMouseLeave={() => {
                if (pressedPitches.includes(pitch)) {
                  window.dispatchEvent(new KeyboardEvent('keyup', { code: binding.code }));
                }
              }}
            >
              <span className="pointer-events-none flex flex-col items-center leading-tight">
                <span>{noteName}</span>
                <span className="text-[9px] uppercase text-slate-500">{binding.label}</span>
              </span>
            </button>
          );
        })}

        {BLACK_KEY_BINDINGS.map((binding) => {
          const pitch = resolvePitch(binding.code, octave) ?? 61;
          const isPressed = pressedPitches.includes(pitch);
          const noteName = midiNoteToName(pitch);
          const whiteIndex = WHITE_KEY_BINDINGS.findIndex((candidate) => candidate.semitone > binding.semitone);
          const left = `${((whiteIndex - 1) / WHITE_KEY_BINDINGS.length) * 100 + 7}%`;

          return (
            <button
              key={binding.code}
              type="button"
              aria-label={`Virtual key ${noteName}`}
              aria-pressed={isPressed}
              className={`absolute top-3 h-[58%] w-[8%] -translate-x-1/2 rounded-b-xl border px-1 pb-2 pt-2 text-[10px] font-medium text-white transition ${
                isPressed
                  ? 'border-cyan-300 bg-cyan-500 shadow-[0_8px_24px_rgba(6,182,212,0.35)]'
                  : 'border-slate-700 bg-[#111827]'
              }`}
              style={{ left }}
              onMouseDown={(event) => {
                event.preventDefault();
                window.dispatchEvent(new KeyboardEvent('keydown', { code: binding.code }));
              }}
              onMouseUp={(event) => {
                event.preventDefault();
                window.dispatchEvent(new KeyboardEvent('keyup', { code: binding.code }));
              }}
              onMouseLeave={() => {
                if (pressedPitches.includes(pitch)) {
                  window.dispatchEvent(new KeyboardEvent('keyup', { code: binding.code }));
                }
              }}
            >
              <span className="pointer-events-none flex flex-col items-center leading-tight">
                <span>{isBlackKeyPitch(pitch) ? noteName.replace('#', '♯') : noteName}</span>
                <span className="text-[9px] text-cyan-100/80">{binding.label}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
