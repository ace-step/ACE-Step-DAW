import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { synthEngine } from '../../engine/SynthEngine';
import { useProjectStore } from '../../store/projectStore';
import { useTransportStore } from '../../store/transportStore';
import type { Clip, MidiNote, PianoRollGrid, Track } from '../../types/project';
import { drawPianoRollKeyboard } from './PianoRollKeyboard';
import { drawVelocityLane } from './VelocityLane';
import {
  generateNoteId,
  gridSizeToBeats,
  isBlackKey,
  MIDI_MAX_NOTE,
  midiNoteToName,
  PIANO_KEYBOARD_WIDTH,
  PIANO_ROLL_KEY_HEIGHT,
  velocityToColor,
  VELOCITY_LANE_HEIGHT,
} from './PianoRollConstants';

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

interface PianoRollCanvasProps {
  clip: Clip;
  track: Track;
  drawMode: boolean;
  gridSize: PianoRollGrid;
  prZoomX: number;
  onZoomXChange: React.Dispatch<React.SetStateAction<number>>;
}

export function PianoRollCanvas({
  clip,
  track,
  drawMode,
  gridSize,
  prZoomX,
  onZoomXChange,
}: PianoRollCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const dragRef = useRef<NoteDragState | null>(null);
  const dividerDragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const [velocityHeight, setVelocityHeight] = useState(VELOCITY_LANE_HEIGHT);
  const [prZoomY, setPrZoomY] = useState(1);
  const [prScrollX, setPrScrollX] = useState(0);
  const [prScrollY, setPrScrollY] = useState(780);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());

  const addMidiNote = useProjectStore((s) => s.addMidiNote);
  const removeMidiNote = useProjectStore((s) => s.removeMidiNote);
  const updateMidiNote = useProjectStore((s) => s.updateMidiNote);
  const beginDrag = useProjectStore((s) => s.beginDrag);
  const endDrag = useProjectStore((s) => s.endDrag);

  const notes: MidiNote[] = clip.midiData?.notes ?? [];
  const bpm = useProjectStore((s) => s.project?.bpm ?? 120);
  const currentTime = useTransportStore((s) => s.currentTime);
  const previewEnabled = true;
  const synthPreset = track.synthPreset ?? 'piano';

  const keyHeight = PIANO_ROLL_KEY_HEIGHT * prZoomY;
  const pixelsPerBeat = 40 * prZoomX;
  const gridBeats = gridSizeToBeats(gridSize);

  const beatToX = useCallback(
    (beat: number) => PIANO_KEYBOARD_WIDTH + beat * pixelsPerBeat - prScrollX,
    [pixelsPerBeat, prScrollX],
  );

  const xToBeat = useCallback(
    (x: number) => (x - PIANO_KEYBOARD_WIDTH + prScrollX) / pixelsPerBeat,
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

  const findNoteAt = useCallback(
    (x: number, y: number): { note: MidiNote; edge: 'body' | 'right' } | null => {
      for (let i = notes.length - 1; i >= 0; i--) {
        const note = notes[i];
        const noteX = beatToX(note.startBeat);
        const noteY = pitchToY(note.pitch);
        const noteWidth = note.durationBeats * pixelsPerBeat;
        const noteHeight = keyHeight - 1;

        if (x >= noteX && x <= noteX + noteWidth && y >= noteY && y <= noteY + noteHeight) {
          return {
            note,
            edge: x > noteX + noteWidth - 8 && noteWidth > 10 ? 'right' : 'body',
          };
        }
      }

      return null;
    },
    [notes, beatToX, pitchToY, pixelsPerBeat, keyHeight],
  );

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

    ctx.fillStyle = '#0a0a1e';
    ctx.fillRect(0, 0, width, height);

    drawPianoRollKeyboard({
      ctx,
      noteAreaHeight,
      keyHeight,
      prZoomY,
      pitchToY,
    });

    ctx.save();
    ctx.beginPath();
    ctx.rect(PIANO_KEYBOARD_WIDTH, 0, width - PIANO_KEYBOARD_WIDTH, noteAreaHeight);
    ctx.clip();

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

    const beatsPerBar = 4;
    const startBeat = Math.floor(prScrollX / pixelsPerBeat);
    const endBeat = Math.ceil((prScrollX + width) / pixelsPerBeat);

    for (let beat = startBeat; beat <= endBeat; beat += gridBeats) {
      const x = PIANO_KEYBOARD_WIDTH + beat * pixelsPerBeat - prScrollX;
      if (x < PIANO_KEYBOARD_WIDTH || x > width) continue;

      const isBar = Math.abs(beat % beatsPerBar) < 0.001;
      const isBeat = Math.abs(beat % 1) < 0.001;

      ctx.strokeStyle = isBar
        ? 'rgba(255,255,255,0.12)'
        : isBeat
          ? 'rgba(255,255,255,0.06)'
          : 'rgba(255,255,255,0.025)';
      ctx.lineWidth = isBar ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, noteAreaHeight);
      ctx.stroke();

      if (isBar) {
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = '9px "Geist Mono", monospace';
        ctx.textBaseline = 'top';
        ctx.fillText(`${Math.floor(beat / beatsPerBar) + 1}`, x + 3, 3);
      }
    }

    for (const note of notes) {
      const noteX = beatToX(note.startBeat);
      const noteY = pitchToY(note.pitch);
      const noteWidth = note.durationBeats * pixelsPerBeat;
      const noteHeight = keyHeight - 1;
      if (noteX + noteWidth < PIANO_KEYBOARD_WIDTH || noteX > width) continue;
      if (noteY + noteHeight < 0 || noteY > noteAreaHeight) continue;

      const isSelected = selectedNoteIds.has(note.id);

      ctx.fillStyle = velocityToColor(note.velocity);
      ctx.globalAlpha = isSelected ? 1.0 : 0.8;
      ctx.beginPath();
      ctx.roundRect(noteX, noteY, Math.max(noteWidth, 3), noteHeight, 2);
      ctx.fill();

      ctx.strokeStyle = isSelected ? '#fff' : 'rgba(255,255,255,0.3)';
      ctx.lineWidth = isSelected ? 1.5 : 0.5;
      ctx.beginPath();
      ctx.roundRect(noteX, noteY, Math.max(noteWidth, 3), noteHeight, 2);
      ctx.stroke();
      ctx.globalAlpha = 1.0;

      if (noteWidth > 30 && noteHeight > 8) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.font = `${Math.min(9, noteHeight * 0.7)}px "Geist Mono", monospace`;
        ctx.textBaseline = 'middle';
        ctx.fillText(midiNoteToName(note.pitch), noteX + 3, noteY + noteHeight / 2);
      }

      if (isSelected && noteWidth > 10) {
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillRect(noteX + noteWidth - 4, noteY + 2, 3, noteHeight - 4);
      }
    }

    const drag = dragRef.current;
    if (drag?.isBoxSelect && drag.boxStartX !== undefined && drag.boxStartY !== undefined) {
      const boxX = Math.min(drag.boxStartX, drag.startMouseX);
      const boxY = Math.min(drag.boxStartY, drag.startMouseY);
      const boxWidth = Math.abs(drag.startMouseX - drag.boxStartX);
      const boxHeight = Math.abs(drag.startMouseY - drag.boxStartY);
      ctx.fillStyle = 'rgba(139, 92, 246, 0.15)';
      ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
      ctx.strokeStyle = 'rgba(139, 92, 246, 0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
    }

    const clipStartBeat = clip.startTime * (bpm / 60);
    const liveTime = useTransportStore.getState().currentTime;
    const currentBeat = liveTime * (bpm / 60) - clipStartBeat;
    const clipDurationBeats = clip.duration * (bpm / 60);
    if (currentBeat >= 0 && currentBeat <= clipDurationBeats) {
      const cursorX = beatToX(currentBeat);
      if (cursorX >= PIANO_KEYBOARD_WIDTH && cursorX <= width) {
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cursorX, 0);
        ctx.lineTo(cursorX, noteAreaHeight);
        ctx.stroke();
      }
    }

    ctx.restore();

    const dividerY = noteAreaHeight;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, dividerY, width, 3);

    drawVelocityLane({
      ctx,
      width,
      dividerY,
      velocityHeight,
      notes,
      selectedNoteIds,
      beatToX,
      pixelsPerBeat,
    });

    if (drawMode) {
      ctx.fillStyle = 'rgba(139, 92, 246, 0.3)';
      ctx.fillRect(width - 60, 4, 56, 16);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '9px "Geist", sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText('✏ Draw', width - 55, 12);
    }
  }, [
    beatToX,
    bpm,
    clip,
    drawMode,
    gridBeats,
    keyHeight,
    notes,
    pixelsPerBeat,
    pitchToY,
    prScrollX,
    prZoomY,
    selectedNoteIds,
    velocityHeight,
  ]);

  useEffect(() => {
    const tick = () => {
      draw();
      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const noteAreaHeight = rect.height - velocityHeight;

      if (Math.abs(y - noteAreaHeight) < 5) {
        dividerDragRef.current = { startY: e.clientY, startHeight: velocityHeight };
        return;
      }

      if (y > noteAreaHeight + 3) {
        const velAreaTop = noteAreaHeight + 3;
        const velAreaHeight = velocityHeight - 6;
        for (const note of notes) {
          const noteX = beatToX(note.startBeat);
          const noteWidth = Math.max(note.durationBeats * pixelsPerBeat, 4);
          if (x < noteX || x > noteX + noteWidth) continue;

          beginDrag();
          updateMidiNote(clip.id, note.id, {
            velocity: Math.round(Math.max(1, Math.min(127, ((velAreaTop + velAreaHeight - y) / velAreaHeight) * 127))),
          });
          dragRef.current = {
            mode: 'velocity',
            noteId: note.id,
            startMouseX: x,
            startMouseY: y,
            originalPitch: note.pitch,
            originalStartBeat: note.startBeat,
            originalDurationBeats: note.durationBeats,
            originalVelocity: note.velocity,
          };
          return;
        }
        return;
      }

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
          setSelectedNoteIds((prev) => {
            const next = new Set(prev);
            next.delete(hit.note.id);
            return next;
          });
          return;
        }

        const beat = snapBeat(xToBeat(x), e.altKey);
        const pitch = yToPitch(y);
        if (pitch < 0 || pitch > MIDI_MAX_NOTE) return;

        const newNote = {
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
          mode: 'resize-right',
          noteId: newNote.id,
          startMouseX: x,
          startMouseY: y,
          originalPitch: pitch,
          originalStartBeat: newNote.startBeat,
          originalDurationBeats: newNote.durationBeats,
          originalVelocity: 100,
        };
        return;
      }

      if (hit) {
        if (e.shiftKey) {
          setSelectedNoteIds((prev) => {
            const next = new Set(prev);
            if (next.has(hit.note.id)) next.delete(hit.note.id);
            else next.add(hit.note.id);
            return next;
          });
        } else if (!selectedNoteIds.has(hit.note.id)) {
          setSelectedNoteIds(new Set([hit.note.id]));
        }

        beginDrag();
        dragRef.current = {
          mode: hit.edge === 'right' ? 'resize-right' : 'move',
          noteId: hit.note.id,
          startMouseX: x,
          startMouseY: y,
          originalPitch: hit.note.pitch,
          originalStartBeat: hit.note.startBeat,
          originalDurationBeats: hit.note.durationBeats,
          originalVelocity: hit.note.velocity,
        };
        return;
      }

      if (!e.shiftKey) setSelectedNoteIds(new Set());
      dragRef.current = {
        mode: null,
        noteId: '',
        startMouseX: x,
        startMouseY: y,
        originalPitch: 0,
        originalStartBeat: 0,
        originalDurationBeats: 0,
        originalVelocity: 0,
        isBoxSelect: true,
        boxStartX: x,
        boxStartY: y,
      };
    },
    [
      addMidiNote,
      beatToX,
      beginDrag,
      clip.id,
      drawMode,
      findNoteAt,
      gridBeats,
      notes,
      pixelsPerBeat,
      previewEnabled,
      removeMidiNote,
      selectedNoteIds,
      snapBeat,
      synthPreset,
      updateMidiNote,
      velocityHeight,
      xToBeat,
      yToPitch,
    ],
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || drawMode) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const noteAreaHeight = rect.height - velocityHeight;

      if (x < PIANO_KEYBOARD_WIDTH || y > noteAreaHeight) return;

      const hit = findNoteAt(x, y);
      if (hit) {
        removeMidiNote(clip.id, hit.note.id);
        setSelectedNoteIds((prev) => {
          const next = new Set(prev);
          next.delete(hit.note.id);
          return next;
        });
        return;
      }

      const beat = snapBeat(xToBeat(x), e.altKey);
      const pitch = yToPitch(y);
      if (pitch < 0 || pitch > MIDI_MAX_NOTE) return;

      const newNote = {
        id: generateNoteId(),
        pitch,
        startBeat: Math.max(0, beat),
        durationBeats: gridBeats,
        velocity: 100,
      };
      addMidiNote(clip.id, newNote);
      setSelectedNoteIds(new Set([newNote.id]));
      if (previewEnabled) synthEngine.previewNote(pitch, 100, 0.3, synthPreset);
    },
    [
      addMidiNote,
      clip.id,
      drawMode,
      findNoteAt,
      gridBeats,
      previewEnabled,
      removeMidiNote,
      snapBeat,
      synthPreset,
      velocityHeight,
      xToBeat,
      yToPitch,
    ],
  );

  useEffect(() => {
    const handleGlobalMove = (e: MouseEvent) => {
      if (dividerDragRef.current) {
        const deltaY = dividerDragRef.current.startY - e.clientY;
        setVelocityHeight(Math.max(30, Math.min(150, dividerDragRef.current.startHeight + deltaY)));
        return;
      }

      const drag = dragRef.current;
      if (!drag) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (drag.isBoxSelect) {
        drag.startMouseX = x;
        drag.startMouseY = y;
        const boxX1 = Math.min(x, drag.boxStartX!);
        const boxY1 = Math.min(y, drag.boxStartY!);
        const boxX2 = Math.max(x, drag.boxStartX!);
        const boxY2 = Math.max(y, drag.boxStartY!);

        const nextSelectedIds = new Set<string>();
        for (const note of notes) {
          const noteX = beatToX(note.startBeat);
          const noteY = pitchToY(note.pitch);
          const noteWidth = note.durationBeats * pixelsPerBeat;
          const noteHeight = keyHeight - 1;
          if (noteX + noteWidth > boxX1 && noteX < boxX2 && noteY + noteHeight > boxY1 && noteY < boxY2) {
            nextSelectedIds.add(note.id);
          }
        }
        setSelectedNoteIds(nextSelectedIds);
        return;
      }

      if (drag.mode === 'velocity') {
        const noteAreaHeight = rect.height - velocityHeight;
        const velAreaTop = noteAreaHeight + 3;
        const velAreaHeight = velocityHeight - 6;
        updateMidiNote(clip.id, drag.noteId, {
          velocity: Math.round(Math.max(1, Math.min(127, ((velAreaTop + velAreaHeight - y) / velAreaHeight) * 127))),
        });
        return;
      }

      if (drag.mode === 'move') {
        const beatDelta = (x - drag.startMouseX) / pixelsPerBeat;
        const newStartBeat = Math.max(0, snapBeat(drag.originalStartBeat + beatDelta, e.altKey));
        const newPitch = Math.max(0, Math.min(MIDI_MAX_NOTE, yToPitch(y)));
        updateMidiNote(clip.id, drag.noteId, { startBeat: newStartBeat, pitch: newPitch });
        if (previewEnabled && newPitch !== drag.originalPitch) {
          synthEngine.previewNote(newPitch, 80, 0.15, synthPreset);
          drag.originalPitch = newPitch;
        }
        return;
      }

      if (drag.mode === 'resize-right') {
        const beatDelta = (x - drag.startMouseX) / pixelsPerBeat;
        const endBeat = snapBeat(drag.originalStartBeat + drag.originalDurationBeats + beatDelta, e.altKey);
        updateMidiNote(clip.id, drag.noteId, {
          durationBeats: Math.max(gridBeats * 0.5, endBeat - drag.originalStartBeat),
        });
      }
    };

    const handleGlobalUp = () => {
      dividerDragRef.current = null;
      if (dragRef.current) endDrag();
      dragRef.current = null;
    };

    window.addEventListener('mousemove', handleGlobalMove);
    window.addEventListener('mouseup', handleGlobalUp);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMove);
      window.removeEventListener('mouseup', handleGlobalUp);
    };
  }, [
    beatToX,
    clip.id,
    endDrag,
    gridBeats,
    keyHeight,
    notes,
    pitchToY,
    pixelsPerBeat,
    previewEnabled,
    snapBeat,
    synthPreset,
    updateMidiNote,
    velocityHeight,
    yToPitch,
  ]);

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const delta = e.deltaY > 0 ? -0.25 : 0.25;
        onZoomXChange((zoom) => Math.max(0.25, Math.min(8, zoom + delta)));
        return;
      }

      if (e.altKey) {
        const delta = e.deltaY > 0 ? -0.15 : 0.15;
        setPrZoomY((zoom) => Math.max(0.4, Math.min(4, zoom + delta)));
        return;
      }

      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        setPrScrollX((scroll) => Math.max(0, scroll + (e.deltaX || e.deltaY)));
      } else {
        setPrScrollY((scroll) => Math.max(0, scroll + e.deltaY));
      }
    },
    [onZoomXChange],
  );

  const clipboardNotes = useMemo(
    () => notes.filter((note) => selectedNoteIds.has(note.id)),
    [notes, selectedNoteIds],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tagName = (e.target as HTMLElement).tagName;
      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return;

      const key = e.key.toLowerCase();

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNoteIds.size === 0) return;
        e.preventDefault();
        for (const noteId of selectedNoteIds) removeMidiNote(clip.id, noteId);
        setSelectedNoteIds(new Set());
        return;
      }

      if ((e.ctrlKey || e.metaKey) && key === 'a') {
        e.preventDefault();
        setSelectedNoteIds(new Set(notes.map((note) => note.id)));
        return;
      }

      if (e.key === 'Escape') {
        setSelectedNoteIds(new Set());
        return;
      }

      if (key === 'q' && !e.metaKey && !e.ctrlKey && selectedNoteIds.size > 0) {
        e.preventDefault();
        for (const noteId of selectedNoteIds) {
          const note = notes.find((candidate) => candidate.id === noteId);
          if (note) updateMidiNote(clip.id, noteId, { startBeat: Math.max(0, snapBeat(note.startBeat)) });
        }
        return;
      }

      if (selectedNoteIds.size > 0) {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          for (const noteId of selectedNoteIds) {
            const note = notes.find((candidate) => candidate.id === noteId);
            if (note) updateMidiNote(clip.id, noteId, { pitch: Math.min(MIDI_MAX_NOTE, note.pitch + 1) });
          }
          return;
        }

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          for (const noteId of selectedNoteIds) {
            const note = notes.find((candidate) => candidate.id === noteId);
            if (note) updateMidiNote(clip.id, noteId, { pitch: Math.max(0, note.pitch - 1) });
          }
          return;
        }

        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          for (const noteId of selectedNoteIds) {
            const note = notes.find((candidate) => candidate.id === noteId);
            if (note) updateMidiNote(clip.id, noteId, { startBeat: Math.max(0, note.startBeat - gridBeats) });
          }
          return;
        }

        if (e.key === 'ArrowRight') {
          e.preventDefault();
          for (const noteId of selectedNoteIds) {
            const note = notes.find((candidate) => candidate.id === noteId);
            if (note) updateMidiNote(clip.id, noteId, { startBeat: note.startBeat + gridBeats });
          }
          return;
        }
      }

      if ((e.ctrlKey || e.metaKey) && key === 'c') {
        if (clipboardNotes.length === 0) return;
        (window as unknown as { __pianoRollClipboard?: MidiNote[] }).__pianoRollClipboard = JSON.parse(
          JSON.stringify(clipboardNotes),
        ) as MidiNote[];
        return;
      }

      if ((e.ctrlKey || e.metaKey) && key === 'v') {
        const clipboard = (window as unknown as { __pianoRollClipboard?: MidiNote[] }).__pianoRollClipboard;
        if (!clipboard || clipboard.length === 0) return;

        e.preventDefault();
        const minBeat = Math.min(...clipboard.map((note) => note.startBeat));
        const currentBeat = currentTime * (bpm / 60) - clip.startTime * (bpm / 60);
        const newIds = new Set<string>();

        for (const note of clipboard) {
          const newNote = {
            ...note,
            id: generateNoteId(),
            startBeat: note.startBeat - minBeat + Math.max(0, currentBeat),
          };
          addMidiNote(clip.id, newNote);
          newIds.add(newNote.id);
        }

        setSelectedNoteIds(newIds);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    addMidiNote,
    bpm,
    clip.id,
    clip.startTime,
    clipboardNotes,
    currentTime,
    gridBeats,
    notes,
    removeMidiNote,
    selectedNoteIds,
    snapBeat,
    updateMidiNote,
  ]);

  return (
    <div ref={containerRef} className="flex-1 relative overflow-hidden">
      <canvas
        ref={canvasRef}
        aria-label="Piano roll editor"
        className="absolute inset-0"
        style={{ cursor: drawMode ? 'crosshair' : 'default' }}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
      />
    </div>
  );
}
