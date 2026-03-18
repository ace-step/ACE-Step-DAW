import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useTransportStore } from '../../store/transportStore';
import { useUIStore } from '../../store/uiStore';
import { synthEngine } from '../../engine/SynthEngine';
import type { MidiNote, PianoRollGrid } from '../../types/project';

// ─── Constants ───────────────────────────────────────────────────────────────

const MIDI_MAX_NOTE = 127;
const PIANO_ROLL_KEY_HEIGHT = 14; // px per key row (at zoom 1)
const PIANO_KEYBOARD_WIDTH = 56;  // px width of piano keys on left
const VELOCITY_LANE_HEIGHT = 60;  // px height of velocity lane (default)

function isBlackKey(note: number): boolean {
  return [1, 3, 6, 8, 10].includes(note % 12);
}

function midiNoteToName(note: number): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return `${names[note % 12]}${Math.floor(note / 12) - 1}`;
}

function gridSizeToBeats(size: PianoRollGrid): number {
  switch (size) {
    case '1/4':  return 1;
    case '1/8':  return 0.5;
    case '1/16': return 0.25;
    case '1/32': return 0.125;
  }
}

function velocityToColor(velocity: number): string {
  const t = velocity / 127;
  const r = Math.round(80 + t * 150);
  const g = Math.round(130 - t * 60);
  const b = Math.round(255 - t * 80);
  return `rgb(${r},${g},${b})`;
}

function velocityToBarColor(velocity: number): string {
  const t = velocity / 127;
  const r = Math.round(100 + t * 155);
  const g = Math.round(80 + t * 40);
  const b = Math.round(200 - t * 100);
  return `rgba(${r},${g},${b},0.8)`;
}

function generateNoteId(): string {
  return `note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ─── Drag State ───────────────────────────────────────────────────────────────

type NoteDragMode = null | 'move' | 'resize-right' | 'velocity';

interface NoteDragState {
  mode: NoteDragMode;
  noteId: string;
  startMouseX: number;
  startMouseY: number;
  originalPitch: number;
  originalStartBeat: number;
  originalDurationBeats: number;
  originalVelocity: number;
  isBoxSelect?: boolean;
  boxStartX?: number;
  boxStartY?: number;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PianoRoll() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const dragRef = useRef<NoteDragState | null>(null);
  const dividerDragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  // Local UI state (not in store — per-instance rendering state)
  const [velocityHeight, setVelocityHeight] = useState(VELOCITY_LANE_HEIGHT);
  const [drawMode, setDrawMode] = useState(false);
  const [gridSize, setGridSize] = useState<PianoRollGrid>('1/16');
  const [previewEnabled] = useState(true);
  const [prZoomX, setPrZoomX] = useState(1);
  const [prZoomY, setPrZoomY] = useState(1);
  const [prScrollX, setPrScrollX] = useState(0);
  const [prScrollY, setPrScrollY] = useState(780); // C4 centered: (127-60)*14 - 158 ≈ 780
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());

  // Store state
  const project = useProjectStore((s) => s.project);
  const addMidiNote = useProjectStore((s) => s.addMidiNote);
  const removeMidiNote = useProjectStore((s) => s.removeMidiNote);
  const updateMidiNote = useProjectStore((s) => s.updateMidiNote);
  const beginDrag = useProjectStore((s) => s.beginDrag);
  const endDrag = useProjectStore((s) => s.endDrag);

  const currentTime = useTransportStore((s) => s.currentTime);

  const openTrackId = useUIStore((s) => s.openPianoRollTrackId);
  const openClipId = useUIStore((s) => s.openPianoRollClipId);
  const pianoRollHeight = useUIStore((s) => s.pianoRollHeight);
  const setPianoRollHeight = useUIStore((s) => s.setPianoRollHeight);
  const setOpenPianoRoll = useUIStore((s) => s.setOpenPianoRoll);

  // Derived values
  const track = useMemo(
    () => project?.tracks.find((t) => t.id === openTrackId) ?? null,
    [project, openTrackId],
  );
  const clip = useMemo(() => {
    if (!track) return null;
    if (openClipId) {
      const existing = track.clips.find((c) => c.id === openClipId);
      if (existing?.midiData) return existing;
    }
    return track.clips.find((c) => c.midiData) ?? null;
  }, [track, openClipId]);

  const notes: MidiNote[] = clip?.midiData?.notes ?? [];
  const synthPreset = track?.synthPreset ?? 'piano';
  const bpm = project?.bpm ?? 120;

  const keyHeight = PIANO_ROLL_KEY_HEIGHT * prZoomY;
  const pixelsPerBeat = 40 * prZoomX;
  const gridBeats = gridSizeToBeats(gridSize);

  // ─── Coordinate conversions (beat-based) ──────────────────────────────────
  const beatToX = useCallback(
    (beat: number) => PIANO_KEYBOARD_WIDTH + beat * pixelsPerBeat - prScrollX,
    [pixelsPerBeat, prScrollX],
  );

  const xToBeat = useCallback(
    (x: number) => ((x - PIANO_KEYBOARD_WIDTH) + prScrollX) / pixelsPerBeat,
    [pixelsPerBeat, prScrollX],
  );

  const pitchToY = useCallback(
    (pitch: number) => (MIDI_MAX_NOTE - pitch) * keyHeight - prScrollY,
    [keyHeight, prScrollY],
  );

  const yToPitch = useCallback(
    (y: number) => MIDI_MAX_NOTE - Math.floor((y + prScrollY) / keyHeight),
    [keyHeight, prScrollY],
  );

  const snapBeat = useCallback(
    (beat: number, bypass = false) => {
      if (bypass) return beat;
      return Math.round(beat / gridBeats) * gridBeats;
    },
    [gridBeats],
  );

  // ─── Drawing ──────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const noteAreaHeight = height - velocityHeight;

    // Background
    ctx.fillStyle = '#0a0a1e';
    ctx.fillRect(0, 0, width, height);

    // ─── Piano keyboard ───────────────────────────────────────────────────
    ctx.fillStyle = '#0e0e26';
    ctx.fillRect(0, 0, PIANO_KEYBOARD_WIDTH, noteAreaHeight);

    for (let note = 0; note <= MIDI_MAX_NOTE; note++) {
      const y = pitchToY(note);
      if (y + keyHeight < 0 || y > noteAreaHeight) continue;
      const clippedY = Math.max(0, y);
      const clippedH = Math.min(keyHeight, noteAreaHeight - clippedY);
      if (clippedH <= 0) continue;

      const black = isBlackKey(note);
      ctx.fillStyle = black ? '#1a1a36' : '#2a2a4e';
      ctx.fillRect(0, clippedY, black ? PIANO_KEYBOARD_WIDTH - 8 : PIANO_KEYBOARD_WIDTH, clippedH);

      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, clippedY + clippedH);
      ctx.lineTo(PIANO_KEYBOARD_WIDTH, clippedY + clippedH);
      ctx.stroke();

      if (note % 12 === 0 || prZoomY > 1.5) {
        const name = midiNoteToName(note);
        ctx.fillStyle = note % 12 === 0 ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.25)';
        ctx.font = `${Math.min(10, keyHeight * 0.8)}px "Geist Mono", monospace`;
        ctx.textBaseline = 'middle';
        ctx.fillText(name, 4, clippedY + clippedH / 2);
      }
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PIANO_KEYBOARD_WIDTH, 0);
    ctx.lineTo(PIANO_KEYBOARD_WIDTH, noteAreaHeight);
    ctx.stroke();

    // ─── Note grid ────────────────────────────────────────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.rect(PIANO_KEYBOARD_WIDTH, 0, width - PIANO_KEYBOARD_WIDTH, noteAreaHeight);
    ctx.clip();

    // Horizontal pitch lines + black key shading
    for (let note = 0; note <= MIDI_MAX_NOTE; note++) {
      const y = pitchToY(note);
      if (y + keyHeight < 0 || y > noteAreaHeight) continue;

      if (isBlackKey(note)) {
        ctx.fillStyle = 'rgba(255,255,255,0.02)';
        ctx.fillRect(PIANO_KEYBOARD_WIDTH, y, width - PIANO_KEYBOARD_WIDTH, keyHeight);
      }

      ctx.strokeStyle = note % 12 === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)';
      ctx.lineWidth = note % 12 === 0 ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(PIANO_KEYBOARD_WIDTH, y + keyHeight);
      ctx.lineTo(width, y + keyHeight);
      ctx.stroke();
    }

    // Vertical beat grid lines
    const beatsPerBar = 4;
    const startBeat = Math.floor(prScrollX / pixelsPerBeat);
    const endBeat = Math.ceil((prScrollX + width) / pixelsPerBeat);

    for (let beat = startBeat; beat <= endBeat; beat += gridBeats) {
      const x = PIANO_KEYBOARD_WIDTH + beat * pixelsPerBeat - prScrollX;
      if (x < PIANO_KEYBOARD_WIDTH || x > width) continue;

      const isBar = Math.abs(beat % beatsPerBar) < 0.001;
      const isBeat = Math.abs(beat % 1) < 0.001;

      ctx.strokeStyle = isBar ? 'rgba(255,255,255,0.12)' : isBeat ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.025)';
      ctx.lineWidth = isBar ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, noteAreaHeight);
      ctx.stroke();

      if (isBar) {
        const barNum = Math.floor(beat / beatsPerBar) + 1;
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = '9px "Geist Mono", monospace';
        ctx.textBaseline = 'top';
        ctx.fillText(`${barNum}`, x + 3, 3);
      }
    }

    // ─── Draw notes ───────────────────────────────────────────────────────
    for (const note of notes) {
      const nx = beatToX(note.startBeat);
      const ny = pitchToY(note.pitch);
      const nw = note.durationBeats * pixelsPerBeat;
      const nh = keyHeight - 1;

      if (nx + nw < PIANO_KEYBOARD_WIDTH || nx > width) continue;
      if (ny + nh < 0 || ny > noteAreaHeight) continue;

      const isSelected = selectedNoteIds.has(note.id);

      ctx.fillStyle = velocityToColor(note.velocity);
      ctx.globalAlpha = isSelected ? 1.0 : 0.8;
      ctx.beginPath();
      ctx.roundRect(nx, ny, Math.max(nw, 3), nh, 2);
      ctx.fill();

      ctx.strokeStyle = isSelected ? '#fff' : 'rgba(255,255,255,0.3)';
      ctx.lineWidth = isSelected ? 1.5 : 0.5;
      ctx.beginPath();
      ctx.roundRect(nx, ny, Math.max(nw, 3), nh, 2);
      ctx.stroke();

      ctx.globalAlpha = 1.0;

      if (nw > 30 && nh > 8) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.font = `${Math.min(9, nh * 0.7)}px "Geist Mono", monospace`;
        ctx.textBaseline = 'middle';
        ctx.fillText(midiNoteToName(note.pitch), nx + 3, ny + nh / 2);
      }

      if (isSelected && nw > 10) {
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillRect(nx + nw - 4, ny + 2, 3, nh - 4);
      }
    }

    // Box selection overlay
    const drag = dragRef.current;
    if (drag?.isBoxSelect && drag.boxStartX !== undefined && drag.boxStartY !== undefined) {
      const bx = Math.min(drag.boxStartX, drag.startMouseX);
      const by = Math.min(drag.boxStartY, drag.startMouseY);
      const bw = Math.abs(drag.startMouseX - drag.boxStartX);
      const bh = Math.abs(drag.startMouseY - drag.boxStartY);
      ctx.fillStyle = 'rgba(139, 92, 246, 0.15)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = 'rgba(139, 92, 246, 0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, bw, bh);
    }

    // ─── Playback cursor ──────────────────────────────────────────────────
    if (clip) {
      const clipStartBeat = clip.startTime * (bpm / 60);
      // Read currentTime directly from store to avoid RAF loop restart on each frame
      const liveTime = useTransportStore.getState().currentTime;
      const currentBeat = liveTime * (bpm / 60) - clipStartBeat;
      const clipDurationBeats = clip.duration * (bpm / 60);
      if (currentBeat >= 0 && currentBeat <= clipDurationBeats) {
        const cx = beatToX(currentBeat);
        if (cx >= PIANO_KEYBOARD_WIDTH && cx <= width) {
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(cx, 0);
          ctx.lineTo(cx, noteAreaHeight);
          ctx.stroke();
        }
      }
    }

    ctx.restore();

    // ─── Divider ──────────────────────────────────────────────────────────
    const dividerY = noteAreaHeight;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, dividerY, width, 3);

    // ─── Velocity lane ────────────────────────────────────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, dividerY + 3, width, velocityHeight - 3);
    ctx.clip();

    ctx.fillStyle = '#08081a';
    ctx.fillRect(0, dividerY + 3, width, velocityHeight - 3);

    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font = '9px "Geist Mono", monospace';
    ctx.textBaseline = 'top';
    ctx.fillText('VEL', 4, dividerY + 8);

    const velAreaTop = dividerY + 3;
    const velAreaHeight = velocityHeight - 6;

    for (const note of notes) {
      const nx = beatToX(note.startBeat);
      const nw = Math.max(note.durationBeats * pixelsPerBeat, 4);
      if (nx + nw < PIANO_KEYBOARD_WIDTH || nx > width) continue;

      const barH = (note.velocity / 127) * velAreaHeight;
      const barY = velAreaTop + velAreaHeight - barH;
      const isSelected = selectedNoteIds.has(note.id);

      ctx.fillStyle = velocityToBarColor(note.velocity);
      ctx.globalAlpha = isSelected ? 1.0 : 0.6;
      ctx.fillRect(nx, barY, Math.max(nw - 1, 3), barH);

      if (isSelected) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(nx, barY, Math.max(nw - 1, 3), barH);
      }
      ctx.globalAlpha = 1.0;
    }

    ctx.restore();

    // Draw mode indicator
    if (drawMode) {
      ctx.fillStyle = 'rgba(139, 92, 246, 0.3)';
      ctx.fillRect(width - 60, 4, 56, 16);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '9px "Geist", sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText('✏ Draw', width - 55, 12);
    }
  }, [
    notes, bpm, prZoomX, prZoomY, prScrollX, prScrollY, gridSize, drawMode,
    selectedNoteIds, clip, velocityHeight,
    beatToX, pitchToY, pixelsPerBeat, keyHeight, gridBeats,
  ]);

  // Animation loop
  useEffect(() => {
    const tick = () => {
      draw();
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  // ─── Find note at canvas position ─────────────────────────────────────────
  const findNoteAt = useCallback(
    (x: number, y: number): { note: MidiNote; edge: 'body' | 'right' } | null => {
      for (let i = notes.length - 1; i >= 0; i--) {
        const note = notes[i];
        const nx = beatToX(note.startBeat);
        const ny = pitchToY(note.pitch);
        const nw = note.durationBeats * pixelsPerBeat;
        const nh = keyHeight - 1;

        if (x >= nx && x <= nx + nw && y >= ny && y <= ny + nh) {
          const edge = (x > nx + nw - 8 && nw > 10) ? 'right' : 'body';
          return { note, edge };
        }
      }
      return null;
    },
    [notes, beatToX, pitchToY, pixelsPerBeat, keyHeight],
  );

  // ─── Mouse down ───────────────────────────────────────────────────────────
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || !clip) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const noteAreaHeight = rect.height - velocityHeight;

      // Divider drag
      if (Math.abs(y - noteAreaHeight) < 5) {
        dividerDragRef.current = { startY: e.clientY, startHeight: velocityHeight };
        return;
      }

      // Velocity lane click
      if (y > noteAreaHeight + 3) {
        const velAreaTop = noteAreaHeight + 3;
        const velAreaH = velocityHeight - 6;
        for (const note of notes) {
          const nx = beatToX(note.startBeat);
          const nw = Math.max(note.durationBeats * pixelsPerBeat, 4);
          if (x >= nx && x <= nx + nw) {
            beginDrag();
            const newVel = Math.round(Math.max(1, Math.min(127, ((velAreaTop + velAreaH - y) / velAreaH) * 127)));
            updateMidiNote(clip.id, note.id, { velocity: newVel });
            dragRef.current = {
              mode: 'velocity', noteId: note.id,
              startMouseX: x, startMouseY: y,
              originalPitch: note.pitch, originalStartBeat: note.startBeat,
              originalDurationBeats: note.durationBeats, originalVelocity: note.velocity,
            };
            return;
          }
        }
        return;
      }

      // Piano keyboard click
      if (x < PIANO_KEYBOARD_WIDTH) {
        const pitch = yToPitch(y);
        if (pitch >= 0 && pitch <= MIDI_MAX_NOTE && previewEnabled) {
          synthEngine.previewNote(pitch, 100, 0.5, synthPreset);
        }
        return;
      }

      const hit = findNoteAt(x, y);

      if (drawMode) {
        if (hit) {
          removeMidiNote(clip.id, hit.note.id);
          setSelectedNoteIds((prev) => { const s = new Set(prev); s.delete(hit.note.id); return s; });
        } else {
          const beat = snapBeat(xToBeat(x), e.altKey);
          const pitch = yToPitch(y);
          if (pitch < 0 || pitch > MIDI_MAX_NOTE) return;
          const newNote: Omit<MidiNote, 'id'> & { id: string } = {
            id: generateNoteId(),
            pitch,
            startBeat: Math.max(0, beat),
            durationBeats: gridBeats,
            velocity: 100,
          };
          addMidiNote(clip.id, newNote);
          if (previewEnabled) synthEngine.previewNote(pitch, 100, 0.3, synthPreset);
          beginDrag();
          dragRef.current = {
            mode: 'resize-right', noteId: newNote.id,
            startMouseX: x, startMouseY: y,
            originalPitch: pitch, originalStartBeat: newNote.startBeat,
            originalDurationBeats: newNote.durationBeats, originalVelocity: 100,
          };
        }
        return;
      }

      // Select mode
      if (hit) {
        if (e.shiftKey) {
          setSelectedNoteIds((prev) => {
            const s = new Set(prev);
            if (s.has(hit.note.id)) s.delete(hit.note.id); else s.add(hit.note.id);
            return s;
          });
        } else if (!selectedNoteIds.has(hit.note.id)) {
          setSelectedNoteIds(new Set([hit.note.id]));
        }
        beginDrag();
        dragRef.current = {
          mode: hit.edge === 'right' ? 'resize-right' : 'move',
          noteId: hit.note.id,
          startMouseX: x, startMouseY: y,
          originalPitch: hit.note.pitch, originalStartBeat: hit.note.startBeat,
          originalDurationBeats: hit.note.durationBeats, originalVelocity: hit.note.velocity,
        };
      } else {
        if (!e.shiftKey) setSelectedNoteIds(new Set());
        dragRef.current = {
          mode: null, noteId: '',
          startMouseX: x, startMouseY: y,
          originalPitch: 0, originalStartBeat: 0, originalDurationBeats: 0, originalVelocity: 0,
          isBoxSelect: true, boxStartX: x, boxStartY: y,
        };
      }
    },
    [
      clip, notes, drawMode, gridBeats, previewEnabled, synthPreset, velocityHeight,
      selectedNoteIds, beatToX, xToBeat, yToPitch, pitchToY, findNoteAt, snapBeat,
      addMidiNote, removeMidiNote, updateMidiNote, pixelsPerBeat, beginDrag,
    ],
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || !clip) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const noteAreaHeight = rect.height - velocityHeight;

      if (x < PIANO_KEYBOARD_WIDTH || y > noteAreaHeight) return;
      if (drawMode) return;

      const hit = findNoteAt(x, y);
      if (hit) {
        removeMidiNote(clip.id, hit.note.id);
        setSelectedNoteIds((prev) => { const s = new Set(prev); s.delete(hit.note.id); return s; });
      } else {
        const beat = snapBeat(xToBeat(x), e.altKey);
        const pitch = yToPitch(y);
        if (pitch < 0 || pitch > MIDI_MAX_NOTE) return;
        const newNote: Omit<MidiNote, 'id'> & { id: string } = {
          id: generateNoteId(),
          pitch,
          startBeat: Math.max(0, beat),
          durationBeats: gridBeats,
          velocity: 100,
        };
        addMidiNote(clip.id, newNote);
        setSelectedNoteIds(new Set([newNote.id]));
        if (previewEnabled) synthEngine.previewNote(pitch, 100, 0.3, synthPreset);
      }
    },
    [
      clip, drawMode, gridBeats, previewEnabled, synthPreset, velocityHeight,
      xToBeat, yToPitch, findNoteAt, snapBeat, addMidiNote, removeMidiNote,
    ],
  );

  // ─── Global mouse move/up ──────────────────────────────────────────────────
  useEffect(() => {
    const handleGlobalMove = (e: MouseEvent) => {
      // Divider drag
      if (dividerDragRef.current) {
        const dy = dividerDragRef.current.startY - e.clientY;
        setVelocityHeight(Math.max(30, Math.min(150, dividerDragRef.current.startHeight + dy)));
        return;
      }

      const drag = dragRef.current;
      if (!drag || !clip) return;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (drag.isBoxSelect) {
        drag.startMouseX = x;
        drag.startMouseY = y;
        const bx1 = Math.min(x, drag.boxStartX!);
        const by1 = Math.min(y, drag.boxStartY!);
        const bx2 = Math.max(x, drag.boxStartX!);
        const by2 = Math.max(y, drag.boxStartY!);

        const newSel = new Set<string>();
        for (const note of notes) {
          const nx = beatToX(note.startBeat);
          const ny = pitchToY(note.pitch);
          const nw = note.durationBeats * pixelsPerBeat;
          const nh = keyHeight - 1;
          if (nx + nw > bx1 && nx < bx2 && ny + nh > by1 && ny < by2) {
            newSel.add(note.id);
          }
        }
        setSelectedNoteIds(newSel);
        return;
      }

      if (drag.mode === 'velocity') {
        const noteAreaHeight = rect.height - velocityHeight;
        const velAreaTop = noteAreaHeight + 3;
        const velAreaH = velocityHeight - 6;
        const newVel = Math.round(Math.max(1, Math.min(127, ((velAreaTop + velAreaH - y) / velAreaH) * 127)));
        updateMidiNote(clip.id, drag.noteId, { velocity: newVel });
        return;
      }

      if (drag.mode === 'move') {
        const dx = x - drag.startMouseX;
        const beatDelta = dx / pixelsPerBeat;
        const newStart = Math.max(0, snapBeat(drag.originalStartBeat + beatDelta, e.altKey));
        const newPitch = Math.max(0, Math.min(MIDI_MAX_NOTE, yToPitch(y)));
        updateMidiNote(clip.id, drag.noteId, { startBeat: newStart, pitch: newPitch });
        if (previewEnabled && newPitch !== drag.originalPitch) {
          synthEngine.previewNote(newPitch, 80, 0.15, synthPreset);
          drag.originalPitch = newPitch;
        }
      } else if (drag.mode === 'resize-right') {
        const dx = x - drag.startMouseX;
        const beatDelta = dx / pixelsPerBeat;
        const endBeat = snapBeat(drag.originalStartBeat + drag.originalDurationBeats + beatDelta, e.altKey);
        const newDuration = Math.max(gridBeats * 0.5, endBeat - drag.originalStartBeat);
        updateMidiNote(clip.id, drag.noteId, { durationBeats: newDuration });
      }
    };

    const handleGlobalUp = () => {
      dividerDragRef.current = null;
      if (dragRef.current) endDrag(); // re-enable normal history tracking
      dragRef.current = null;
    };

    window.addEventListener('mousemove', handleGlobalMove);
    window.addEventListener('mouseup', handleGlobalUp);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMove);
      window.removeEventListener('mouseup', handleGlobalUp);
    };
  }, [
    clip, notes, pixelsPerBeat, gridBeats, velocityHeight, keyHeight,
    previewEnabled, synthPreset,
    beatToX, pitchToY, yToPitch, snapBeat, updateMidiNote, endDrag,
  ]);

  // ─── Wheel (scroll/zoom) ──────────────────────────────────────────────────
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const delta = e.deltaY > 0 ? -0.25 : 0.25;
        setPrZoomX((z) => Math.max(0.25, Math.min(8, z + delta)));
      } else if (e.altKey) {
        const delta = e.deltaY > 0 ? -0.15 : 0.15;
        setPrZoomY((z) => Math.max(0.4, Math.min(4, z + delta)));
      } else {
        if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
          setPrScrollX((s) => Math.max(0, s + (e.deltaX || e.deltaY)));
        } else {
          setPrScrollY((s) => Math.max(0, s + e.deltaY));
        }
      }
    },
    [],
  );

  // ─── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (!clip) return;

      // B = toggle draw mode
      if ((e.key === 'b' || e.key === 'B') && !e.metaKey && !e.ctrlKey) {
        setDrawMode((m) => !m);
        return;
      }

      // Delete/Backspace = delete selected
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNoteIds.size > 0) {
          e.preventDefault();
          for (const noteId of selectedNoteIds) removeMidiNote(clip.id, noteId);
          setSelectedNoteIds(new Set());
          return;
        }
      }

      // Ctrl+A = select all
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        setSelectedNoteIds(new Set(notes.map((n) => n.id)));
        return;
      }

      // Escape = deselect
      if (e.key === 'Escape') {
        setSelectedNoteIds(new Set());
        return;
      }

      // Arrow keys = move selected notes
      if (selectedNoteIds.size > 0) {
        const shift = e.shiftKey;
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          const delta = shift ? 12 : 1;
          for (const noteId of selectedNoteIds) {
            const note = notes.find((n) => n.id === noteId);
            if (note) updateMidiNote(clip.id, noteId, { pitch: Math.min(MIDI_MAX_NOTE, note.pitch + delta) });
          }
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          const delta = shift ? 12 : 1;
          for (const noteId of selectedNoteIds) {
            const note = notes.find((n) => n.id === noteId);
            if (note) updateMidiNote(clip.id, noteId, { pitch: Math.max(0, note.pitch - delta) });
          }
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          for (const noteId of selectedNoteIds) {
            const note = notes.find((n) => n.id === noteId);
            if (note) updateMidiNote(clip.id, noteId, { startBeat: Math.max(0, note.startBeat - gridBeats) });
          }
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          for (const noteId of selectedNoteIds) {
            const note = notes.find((n) => n.id === noteId);
            if (note) updateMidiNote(clip.id, noteId, { startBeat: note.startBeat + gridBeats });
          }
        }
      }

      // Ctrl+C = copy
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        if (selectedNoteIds.size > 0) {
          const copiedNotes = notes.filter((n) => selectedNoteIds.has(n.id));
          (window as unknown as Record<string, unknown>).__pianoRollClipboard = JSON.parse(JSON.stringify(copiedNotes));
        }
        return;
      }

      // Ctrl+V = paste
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        const clipboard = (window as unknown as Record<string, unknown>).__pianoRollClipboard as MidiNote[] | undefined;
        if (clipboard && clipboard.length > 0) {
          e.preventDefault();
          const minBeat = Math.min(...clipboard.map((n) => n.startBeat));
          const currentBeat = currentTime * (bpm / 60) - (clip.startTime * (bpm / 60));
          const newIds = new Set<string>();
          for (const note of clipboard) {
            const newNote: Omit<MidiNote, 'id'> & { id: string } = {
              ...note,
              id: generateNoteId(),
              startBeat: note.startBeat - minBeat + Math.max(0, currentBeat),
            };
            addMidiNote(clip.id, newNote);
            newIds.add(newNote.id);
          }
          setSelectedNoteIds(newIds);
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    clip, notes, selectedNoteIds, drawMode, gridBeats, currentTime, bpm,
    removeMidiNote, updateMidiNote, addMidiNote,
  ]);

  // ─── Resize handle (panel height) ─────────────────────────────────────────
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = pianoRollHeight;
    const onMouseMove = (ev: MouseEvent) => {
      setPianoRollHeight(startH + (startY - ev.clientY));
    };
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [pianoRollHeight, setPianoRollHeight]);

  // ─── Render ───────────────────────────────────────────────────────────────
  if (!track) return null;

  return (
    <div
      className="border-t border-[#1a1a1a] bg-[#0a0a1e] flex flex-col select-none shrink-0"
      style={{ height: pianoRollHeight }}
    >
      {/* Resize handle */}
      <div
        className="h-1.5 w-full cursor-ns-resize bg-[#444] hover:bg-violet-500 transition-colors flex-shrink-0"
        onMouseDown={handleResizeMouseDown}
      />

      {/* Toolbar */}
      <div className="h-9 px-3 border-b border-[#2a2a2a] bg-[#0e0e24] flex items-center gap-2 shrink-0">
        <div className="text-xs font-medium text-zinc-200">{track.displayName}</div>

        {/* Draw mode toggle */}
        <button
          className={`px-2 py-1 rounded text-[10px] transition-colors ${
            drawMode ? 'bg-violet-600/50 text-violet-200' : 'bg-white/5 text-zinc-400 hover:bg-white/10'
          }`}
          onClick={() => setDrawMode((m) => !m)}
          title="Toggle draw mode (B)"
        >
          ✏ Draw
        </button>

        {/* Grid selector */}
        <select
          value={gridSize}
          onChange={(e) => setGridSize(e.target.value as PianoRollGrid)}
          className="bg-[#111] border border-[#333] rounded px-2 py-1 text-[11px] text-zinc-300"
        >
          <option value="1/4">1/4</option>
          <option value="1/8">1/8</option>
          <option value="1/16">1/16</option>
          <option value="1/32">1/32</option>
        </select>

        {/* Synth preset */}
        <select
          value={track.synthPreset ?? 'piano'}
          onChange={(e) =>
            useProjectStore.getState().updateTrack(track.id, { synthPreset: e.target.value as typeof track.synthPreset })
          }
          className="bg-[#111] border border-[#333] rounded px-2 py-1 text-[11px] text-zinc-300"
        >
          <option value="piano">Piano</option>
          <option value="strings">Strings</option>
          <option value="pad">Pad</option>
          <option value="lead">Lead</option>
          <option value="bass">Bass</option>
          <option value="organ">Organ</option>
        </select>

        {clip && (
          <span className="text-[10px] text-zinc-500 ml-1 truncate max-w-[200px]">{clip.prompt}</span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* Zoom controls */}
          <button
            className="text-[9px] text-zinc-400 hover:text-zinc-200 px-1"
            onClick={() => setPrZoomX((z) => Math.max(0.25, z - 0.25))}
          >−H</button>
          <button
            className="text-[9px] text-zinc-400 hover:text-zinc-200 px-1"
            onClick={() => setPrZoomX((z) => Math.min(8, z + 0.25))}
          >+H</button>
          <button
            className="text-xs text-zinc-400 hover:text-zinc-200"
            onClick={() => setOpenPianoRoll(null)}
          >
            Close
          </button>
        </div>
      </div>

      {/* Canvas area or empty state */}
      {!clip ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-white/15 text-sm flex flex-col items-center gap-2">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
            <span>No MIDI clip on this track</span>
          </div>
        </div>
      ) : (
        <div ref={containerRef} className="flex-1 relative overflow-hidden">
          <canvas
            ref={canvasRef}
            className="absolute inset-0"
            style={{ cursor: drawMode ? 'crosshair' : 'default' }}
            onMouseDown={handleMouseDown}
            onDoubleClick={handleDoubleClick}
            onWheel={handleWheel}
          />
        </div>
      )}
    </div>
  );
}
