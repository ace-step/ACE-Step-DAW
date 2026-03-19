import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { synthEngine } from '../../engine/SynthEngine';
import { samplerEngine } from '../../engine/SamplerEngine';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { useTransportStore } from '../../store/transportStore';
import type { Clip, MidiNote, PianoRollGrid, Track } from '../../types/project';
import { drawPianoRollKeyboard } from './PianoRollKeyboard';
import { drawVelocityLane } from './VelocityLane';
import {
  generateNoteId,
  getPianoRollToolShortcut,
  gridSizeToBeats,
  isBlackKey,
  MIDI_MAX_NOTE,
  midiNoteToName,
  normalizeMidiVelocity,
  PIANO_KEYBOARD_WIDTH,
  PIANO_ROLL_KEY_HEIGHT,
  type PianoRollTool,
  velocityToColor,
  VELOCITY_LANE_HEIGHT,
} from './PianoRollConstants';

type NoteDragMode = null | 'move' | 'resize-left' | 'resize-right' | 'velocity';

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
  boxSelectBaseSelection?: Set<string>;
  boxStartX?: number;
  boxStartY?: number;
}

export interface GhostNote {
  pitch: number;
  startBeat: number;
  durationBeats: number;
  color: string;
}

interface PianoRollCanvasProps {
  clip: Clip;
  track: Track;
  activeTool: PianoRollTool;
  gridSize: PianoRollGrid;
  prZoomX: number;
  onZoomXChange: React.Dispatch<React.SetStateAction<number>>;
  ghostNotes?: GhostNote[];
  selectedNoteIds: Set<string>;
  onSelectedNoteIdsChange: React.Dispatch<React.SetStateAction<Set<string>>>;
}

export function PianoRollCanvas({
  clip,
  track,
  activeTool,
  gridSize,
  prZoomX,
  onZoomXChange,
  ghostNotes = [],
  selectedNoteIds,
  onSelectedNoteIdsChange: setSelectedNoteIds,
}: PianoRollCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const dragRef = useRef<NoteDragState | null>(null);
  const dividerDragRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const toolStrokeRef = useRef<{
    noteIds: Set<string>;
    cells: Set<string>;
  }>({ noteIds: new Set(), cells: new Set() });

  const [velocityHeight, setVelocityHeight] = useState(VELOCITY_LANE_HEIGHT);
  const [prZoomY, setPrZoomY] = useState(1);
  const [prScrollX, setPrScrollX] = useState(0);
  const [prScrollY, setPrScrollY] = useState(780);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const addMidiNote = useProjectStore((s) => s.addMidiNote);
  const removeMidiNote = useProjectStore((s) => s.removeMidiNote);
  const updateMidiNote = useProjectStore((s) => s.updateMidiNote);
  const quantizeMidiNotes = useProjectStore((s) => s.quantizeMidiNotes);
  const beginDrag = useProjectStore((s) => s.beginDrag);
  const endDrag = useProjectStore((s) => s.endDrag);
  const undo = useProjectStore((s) => s.undo);
  const openQuantizeDialog = useUIStore((s) => s.openQuantizeDialog);
  const quantizePreviewPositions = useUIStore((s) => s.quantizePreviewPositions);

  const notes: MidiNote[] = clip.midiData?.notes ?? [];
  const bpm = useProjectStore((s) => s.project?.bpm ?? 120);
  const currentTime = useTransportStore((s) => s.currentTime);
  const previewEnabled = true;
  const synthPreset = track.synthPreset ?? 'piano';
  const previewNoteAtPitch = useCallback((pitch: number, velocity = 100, duration = 0.3) => {
    if (synthPreset === 'sampler') {
      void samplerEngine.previewTrackNote(track, pitch, velocity, duration);
      return;
    }
    void synthEngine.previewNote(pitch, velocity, duration, synthPreset);
  }, [synthPreset, track]);

  const keyHeight = PIANO_ROLL_KEY_HEIGHT * prZoomY;
  const pixelsPerBeat = 40 * prZoomX;
  const gridBeats = gridSizeToBeats(gridSize);

  const canvasCursor = activeTool === 'select'
    ? 'default'
    : activeTool === 'erase'
      ? 'not-allowed'
      : activeTool === 'slide'
        ? 'alias'
        : 'crosshair';
  const canvasTitle = activeTool === 'select'
    ? 'Select notes, drag a marquee, or resize existing notes'
    : activeTool === 'pencil'
      ? 'Pencil tool: click to create a note, then drag to adjust its length'
      : activeTool === 'paint'
        ? 'Paint tool: drag across the grid to stamp repeated notes'
        : activeTool === 'erase'
          ? 'Erase tool: click or drag across notes to remove them'
          : 'Slide tool: create slide notes for portamento transitions';

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

  const getCellKey = useCallback(
    (beat: number, pitch: number) => `${Math.round(beat / gridBeats)}:${pitch}`,
    [gridBeats],
  );

  const createNoteAt = useCallback(
    (x: number, y: number, options?: { isSlide?: boolean; select?: boolean; velocity?: number }) => {
      const beat = snapBeat(xToBeat(x), false);
      const pitch = yToPitch(y);
      if (pitch < 0 || pitch > MIDI_MAX_NOTE) return null;

      const newNote: MidiNote = {
        id: generateNoteId(),
        pitch,
        startBeat: Math.max(0, beat),
        durationBeats: gridBeats,
        velocity: options?.velocity ?? 100,
        isSlide: options?.isSlide,
      };
      addMidiNote(clip.id, newNote);
      if (options?.select !== false) {
        setSelectedNoteIds(new Set([newNote.id]));
      }
      if (previewEnabled) previewNoteAtPitch(pitch, newNote.velocity, 0.3);
      return newNote;
    },
    [addMidiNote, clip.id, gridBeats, previewEnabled, previewNoteAtPitch, setSelectedNoteIds, snapBeat, xToBeat, yToPitch],
  );

  const deleteNoteById = useCallback(
    (noteId: string) => {
      removeMidiNote(clip.id, noteId);
      setSelectedNoteIds((prev) => {
        const next = new Set(prev);
        next.delete(noteId);
        return next;
      });
    },
    [clip.id, removeMidiNote, setSelectedNoteIds],
  );

  const findNoteAt = useCallback(
    (x: number, y: number): { note: MidiNote; edge: 'body' | 'left' | 'right' } | null => {
      for (let i = notes.length - 1; i >= 0; i--) {
        const note = notes[i];
        const noteX = beatToX(note.startBeat);
        const noteY = pitchToY(note.pitch);
        const noteWidth = note.durationBeats * pixelsPerBeat;
        const noteHeight = keyHeight - 1;

        if (x >= noteX && x <= noteX + noteWidth && y >= noteY && y <= noteY + noteHeight) {
          const nearLeft = x < noteX + 8 && noteWidth > 10;
          const nearRight = x > noteX + noteWidth - 8 && noteWidth > 10;
          return {
            note,
            edge: nearLeft ? 'left' : nearRight ? 'right' : 'body',
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

    // Ghost notes from other tracks (drawn first, behind main notes)
    if (ghostNotes.length > 0) {
      ctx.globalAlpha = 0.15;
      for (const gn of ghostNotes) {
        const gnX = beatToX(gn.startBeat);
        const gnY = pitchToY(gn.pitch);
        const gnW = gn.durationBeats * pixelsPerBeat;
        const gnH = keyHeight - 1;
        if (gnX + gnW < PIANO_KEYBOARD_WIDTH || gnX > width) continue;
        if (gnY + gnH < 0 || gnY > noteAreaHeight) continue;
        ctx.fillStyle = gn.color;
        ctx.fillRect(gnX, gnY, Math.max(gnW - 1, 2), gnH);
      }
      ctx.globalAlpha = 1.0;
    }

    for (const note of notes) {
      // Use quantize preview positions when available (real-time preview)
      const preview = quantizePreviewPositions?.[note.id];
      const drawStartBeat = preview ? preview.startBeat : note.startBeat;
      const drawDuration = preview ? preview.durationBeats : note.durationBeats;
      const hasPreview = !!preview;

      const noteX = beatToX(drawStartBeat);
      const noteY = pitchToY(note.pitch);
      const noteWidth = drawDuration * pixelsPerBeat;
      const noteHeight = keyHeight - 1;
      if (noteX + noteWidth < PIANO_KEYBOARD_WIDTH || noteX > width) continue;
      if (noteY + noteHeight < 0 || noteY > noteAreaHeight) continue;

      const isSelected = selectedNoteIds.has(note.id);
      const isSlide = note.isSlide === true;
      const normalizedVelocity = normalizeMidiVelocity(note.velocity);
      const velocityRatio = normalizedVelocity / 127;

      // Draw ghost of original position when preview is active
      if (hasPreview) {
        const origX = beatToX(note.startBeat);
        const origW = note.durationBeats * pixelsPerBeat;
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.roundRect(origX, noteY, Math.max(origW, 3), noteHeight, 2);
        ctx.fill();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(origX, noteY, Math.max(origW, 3), noteHeight, 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1.0;
      }

      ctx.fillStyle = isSlide ? 'rgba(251, 191, 36, 0.92)' : velocityToColor(note.velocity);
      ctx.globalAlpha = isSelected ? 1.0 : 0.8;
      ctx.beginPath();
      ctx.roundRect(noteX, noteY, Math.max(noteWidth, 3), noteHeight, 2);
      ctx.fill();

      ctx.strokeStyle = isSlide ? (isSelected ? '#fff7d6' : 'rgba(251,191,36,0.9)') : (isSelected ? '#fff' : 'rgba(255,255,255,0.3)');
      ctx.lineWidth = isSelected ? 1.5 : 0.5;
      ctx.beginPath();
      ctx.roundRect(noteX, noteY, Math.max(noteWidth, 3), noteHeight, 2);
      ctx.stroke();
      ctx.globalAlpha = 1.0;

      if (isSlide && noteWidth > 10) {
        ctx.strokeStyle = 'rgba(24,24,27,0.75)';
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.moveTo(noteX + 3, noteY + noteHeight - 3);
        ctx.lineTo(noteX + noteWidth - 6, noteY + 3);
        ctx.lineTo(noteX + noteWidth - 3, noteY + 6);
        ctx.stroke();
      }

      if (noteWidth > 30 && noteHeight > 8) {
        ctx.fillStyle = isSlide ? 'rgba(24,24,27,0.85)' : 'rgba(0,0,0,0.6)';
        ctx.font = `${Math.min(9, noteHeight * 0.7)}px "Geist Mono", monospace`;
        ctx.textBaseline = 'middle';
        ctx.fillText(isSlide ? `${midiNoteToName(note.pitch)} SL` : midiNoteToName(note.pitch), noteX + 3, noteY + noteHeight / 2);
      }

      if (!isSlide && noteWidth > 8 && noteHeight > 6) {
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillRect(noteX + 2, noteY + noteHeight - 3, Math.max((noteWidth - 4) * velocityRatio, 2), 1.5);
      }

      if (isSelected && noteWidth > 10) {
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillRect(noteX + 1, noteY + 2, 3, noteHeight - 4);
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

    if (activeTool !== 'select') {
      ctx.fillStyle = 'rgba(139, 92, 246, 0.3)';
      ctx.fillRect(width - 86, 4, 82, 16);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '9px "Geist", sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${activeTool.toUpperCase()} ${getPianoRollToolShortcut(activeTool)}`, width - 80, 12);
    }
  }, [
    activeTool,
    beatToX,
    bpm,
    clip,
    gridBeats,
    keyHeight,
    notes,
    pixelsPerBeat,
    pitchToY,
    prScrollX,
    prZoomY,
    quantizePreviewPositions,
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
          previewNoteAtPitch(pitch, 100, 0.5);
        }
        return;
      }

      const hit = findNoteAt(x, y);

      if (activeTool === 'erase') {
        if (hit) {
          toolStrokeRef.current.noteIds.add(hit.note.id);
          deleteNoteById(hit.note.id);
        }
        return;
      }

      if (activeTool === 'paint') {
        if (hit) {
          return;
        }

        const newNote = createNoteAt(x, y, { select: false });
        if (!newNote) return;

        toolStrokeRef.current.noteIds.add(newNote.id);
        toolStrokeRef.current.cells.add(getCellKey(newNote.startBeat, newNote.pitch));
        setSelectedNoteIds(new Set([newNote.id]));
        return;
      }

      if (activeTool === 'pencil' || activeTool === 'slide') {
        if (hit && activeTool !== 'slide') {
          deleteNoteById(hit.note.id);
          return;
        }

        const newNote = createNoteAt(x, y, { isSlide: activeTool === 'slide' });
        if (!newNote) return;

        beginDrag();
        toolStrokeRef.current.noteIds.add(newNote.id);
        toolStrokeRef.current.cells.add(getCellKey(newNote.startBeat, newNote.pitch));
        dragRef.current = {
          mode: 'resize-right',
          noteId: newNote.id,
          startMouseX: x,
          startMouseY: y,
          originalPitch: newNote.pitch,
          originalStartBeat: newNote.startBeat,
          originalDurationBeats: newNote.durationBeats,
          originalVelocity: newNote.velocity,
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
          mode: hit.edge === 'right' ? 'resize-right' : hit.edge === 'left' ? 'resize-left' : 'move',
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

      // In select mode, dragging empty space starts marquee selection by default.
      // Shift preserves the current selection and adds intersecting notes.
      if (activeTool === 'select') {
        if (!e.shiftKey) {
          setSelectedNoteIds(new Set());
        }
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
          boxSelectBaseSelection: e.shiftKey ? new Set(selectedNoteIds) : new Set(),
          boxStartX: x,
          boxStartY: y,
        };
        return;
      }

      setSelectedNoteIds(new Set());
    },
    [
      activeTool,
      beatToX,
      beginDrag,
      createNoteAt,
      deleteNoteById,
      findNoteAt,
      getCellKey,
      notes,
      pixelsPerBeat,
      previewEnabled,
      previewNoteAtPitch,
      selectedNoteIds,
      updateMidiNote,
      velocityHeight,
      yToPitch,
    ],
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || activeTool !== 'select') return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const noteAreaHeight = rect.height - velocityHeight;

      if (x < PIANO_KEYBOARD_WIDTH || y > noteAreaHeight) return;

      const hit = findNoteAt(x, y);
      if (hit) {
        deleteNoteById(hit.note.id);
        return;
      }

      createNoteAt(x, y);
    },
    [
      activeTool,
      createNoteAt,
      deleteNoteById,
      findNoteAt,
      velocityHeight,
    ],
  );

  useEffect(() => {
    const handleGlobalMove = (e: MouseEvent) => {
      if (dividerDragRef.current) {
        const deltaY = dividerDragRef.current.startY - e.clientY;
        setVelocityHeight(Math.max(30, Math.min(150, dividerDragRef.current.startHeight + deltaY)));
        return;
      }

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const noteAreaHeight = rect.height - velocityHeight;
      const drag = dragRef.current;

      const isPrimaryButtonDown = (e.buttons & 1) === 1;

      if (!drag && isPrimaryButtonDown && y <= noteAreaHeight && x >= PIANO_KEYBOARD_WIDTH) {
        if (activeTool === 'erase') {
          const hit = findNoteAt(x, y);
          if (hit && !toolStrokeRef.current.noteIds.has(hit.note.id)) {
            toolStrokeRef.current.noteIds.add(hit.note.id);
            deleteNoteById(hit.note.id);
          }
        }
        if (activeTool === 'paint') {
          const pitch = yToPitch(y);
          if (pitch >= 0 && pitch <= MIDI_MAX_NOTE) {
            const beat = Math.max(0, snapBeat(xToBeat(x), e.altKey));
            const cellKey = getCellKey(beat, pitch);
            const hit = findNoteAt(x, y);
            if (!hit && !toolStrokeRef.current.cells.has(cellKey)) {
              const newNote = createNoteAt(x, y, { select: false });
              if (newNote) {
                toolStrokeRef.current.noteIds.add(newNote.id);
                toolStrokeRef.current.cells.add(cellKey);
              }
            }
          }
        }
      }
      if (!drag) return;

      if (drag.isBoxSelect) {
        drag.startMouseX = x;
        drag.startMouseY = y;
        const boxX1 = Math.min(x, drag.boxStartX!);
        const boxY1 = Math.min(y, drag.boxStartY!);
        const boxX2 = Math.max(x, drag.boxStartX!);
        const boxY2 = Math.max(y, drag.boxStartY!);

        const nextSelectedIds = new Set(drag.boxSelectBaseSelection ?? []);
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
          previewNoteAtPitch(newPitch, 80, 0.15);
          drag.originalPitch = newPitch;
        }
        return;
      }

      if (drag.mode === 'resize-left') {
        const beatDelta = (x - drag.startMouseX) / pixelsPerBeat;
        const snappedStart = Math.max(0, snapBeat(drag.originalStartBeat + beatDelta, e.altKey));
        const originalEnd = drag.originalStartBeat + drag.originalDurationBeats;
        const maxStart = originalEnd - gridBeats * 0.5;
        const newStartBeat = Math.min(snappedStart, maxStart);
        updateMidiNote(clip.id, drag.noteId, {
          startBeat: newStartBeat,
          durationBeats: Math.max(gridBeats * 0.5, originalEnd - newStartBeat),
        });
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
      toolStrokeRef.current = { noteIds: new Set(), cells: new Set() };
      dragRef.current = null;
    };

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (dividerDragRef.current) {
        setVelocityHeight(dividerDragRef.current.startHeight);
        dividerDragRef.current = null;
        return;
      }
      const drag = dragRef.current;
      if (!drag) return;
      if (drag.isBoxSelect) {
        setSelectedNoteIds(new Set());
        dragRef.current = null;
        return;
      }
      // Restore the note to its original state before cancelling
      if (drag.mode && drag.noteId) {
        updateMidiNote(clip.id, drag.noteId, {
          pitch: drag.originalPitch,
          startBeat: drag.originalStartBeat,
          durationBeats: drag.originalDurationBeats,
          velocity: drag.originalVelocity,
        });
      }
      endDrag();
      undo();
      toolStrokeRef.current = { noteIds: new Set(), cells: new Set() };
      dragRef.current = null;
    };

    window.addEventListener('mousemove', handleGlobalMove);
    window.addEventListener('mouseup', handleGlobalUp);
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMove);
      window.removeEventListener('mouseup', handleGlobalUp);
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [
    activeTool,
    beatToX,
    clip.id,
    createNoteAt,
    deleteNoteById,
    endDrag,
    findNoteAt,
    getCellKey,
    gridBeats,
    keyHeight,
    notes,
    pitchToY,
    pixelsPerBeat,
    previewEnabled,
    previewNoteAtPitch,
    snapBeat,
    undo,
    updateMidiNote,
    velocityHeight,
    xToBeat,
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
        // During an active drag, the global keydown handler cancels the drag
        if (!dragRef.current && !dividerDragRef.current) {
          setSelectedNoteIds(new Set());
        }
        return;
      }

      if (key === 'q') {
        // Use selected notes, or all notes if nothing is selected
        const targetIds = selectedNoteIds.size > 0
          ? Array.from(selectedNoteIds)
          : notes.map((n) => n.id);
        if (targetIds.length === 0) return;
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
          // Ctrl/Cmd+Q: open quantize dialog with options
          openQuantizeDialog(clip.id, targetIds);
        } else {
          // Q: quick quantize to current grid
          quantizeMidiNotes(clip.id, targetIds, gridBeats);
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
    openQuantizeDialog,
  ]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // If right-clicking on a note that isn't selected, auto-select it
      const hit = findNoteAt(x, y);
      if (hit && !selectedNoteIds.has(hit.note.id)) {
        setSelectedNoteIds(new Set([hit.note.id]));
      }

      if (hit || selectedNoteIds.size > 0) {
        setContextMenu({ x: e.clientX, y: e.clientY });
      }
    },
    [selectedNoteIds, findNoteAt, setSelectedNoteIds],
  );

  const handleContextMenuQuantize = useCallback(() => {
    setContextMenu(null);
    openQuantizeDialog(clip.id, Array.from(selectedNoteIds));
  }, [clip.id, selectedNoteIds, openQuantizeDialog]);

  const handleContextMenuQuickQuantize = useCallback(() => {
    setContextMenu(null);
    quantizeMidiNotes(clip.id, Array.from(selectedNoteIds), gridBeats);
  }, [clip.id, selectedNoteIds, quantizeMidiNotes, gridBeats]);

  useEffect(() => {
    const globalWindow = window as Window & {
      __pianoRollHelpers?: {
        beatToX: (beat: number) => number;
        xToBeat: (x: number) => number;
        pitchToY: (pitch: number) => number;
        yToPitch: (y: number) => number;
        applyToolStroke: (points: Array<{ x: number; y: number }>) => void;
        selectNoteAt: (x: number, y: number, additive?: boolean) => string | null;
        eraseNoteAt: (x: number, y: number) => string | null;
        pixelsPerBeat: number;
        keyHeight: number;
        prScrollX: number;
        prScrollY: number;
        activeTool: PianoRollTool;
        velocityLaneTop: number;
        velocityLaneHeight: number;
      };
    };
    const containerHeight = containerRef.current?.getBoundingClientRect().height ?? 0;

    const selectNoteAt = (x: number, y: number, additive = false) => {
      const hit = findNoteAt(x, y);
      if (!hit) {
        if (!additive) {
          setSelectedNoteIds(new Set());
        }
        return null;
      }

      setSelectedNoteIds((prev) => {
        if (!additive) {
          return new Set([hit.note.id]);
        }
        const next = new Set(prev);
        next.add(hit.note.id);
        return next;
      });
      return hit.note.id;
    };

    const eraseNoteAt = (x: number, y: number) => {
      const hit = findNoteAt(x, y);
      if (!hit) return null;
      deleteNoteById(hit.note.id);
      return hit.note.id;
    };

    const applyToolStroke = (points: Array<{ x: number; y: number }>) => {
      if (points.length === 0) return;

      toolStrokeRef.current = { noteIds: new Set(), cells: new Set() };

      if (activeTool === 'select') {
        selectNoteAt(points[0].x, points[0].y, false);
        return;
      }

      if (activeTool === 'erase') {
        for (const point of points) {
          const hit = findNoteAt(point.x, point.y);
          if (hit && !toolStrokeRef.current.noteIds.has(hit.note.id)) {
            toolStrokeRef.current.noteIds.add(hit.note.id);
            deleteNoteById(hit.note.id);
          }
        }
        return;
      }

      if (activeTool === 'paint') {
        points.forEach((point, index) => {
          const pitch = yToPitch(point.y);
          if (pitch < 0 || pitch > MIDI_MAX_NOTE) return;

          const beat = Math.max(0, snapBeat(xToBeat(point.x), false));
          const cellKey = getCellKey(beat, pitch);
          const hit = findNoteAt(point.x, point.y);
          if (hit || toolStrokeRef.current.cells.has(cellKey)) return;

          const newNote = createNoteAt(point.x, point.y, { select: index === 0 });
          if (!newNote) return;
          toolStrokeRef.current.noteIds.add(newNote.id);
          toolStrokeRef.current.cells.add(cellKey);
        });
        return;
      }

      const firstPoint = points[0];
      createNoteAt(firstPoint.x, firstPoint.y, { isSlide: activeTool === 'slide' });
    };

    globalWindow.__pianoRollHelpers = {
      beatToX,
      xToBeat,
      pitchToY,
      yToPitch,
      applyToolStroke,
      selectNoteAt,
      eraseNoteAt,
      pixelsPerBeat,
      keyHeight,
      prScrollX,
      prScrollY,
      activeTool,
      velocityLaneTop: Math.max(0, containerHeight - velocityHeight + 3),
      velocityLaneHeight: Math.max(0, velocityHeight - 6),
    };

    return () => {
      delete globalWindow.__pianoRollHelpers;
    };
  }, [
    activeTool,
    beatToX,
    createNoteAt,
    deleteNoteById,
    findNoteAt,
    getCellKey,
    keyHeight,
    pitchToY,
    pixelsPerBeat,
    prScrollX,
    prScrollY,
    setSelectedNoteIds,
    snapBeat,
    xToBeat,
    yToPitch,
  ]);

  return (
    <div ref={containerRef} className="flex-1 relative overflow-hidden">
      <canvas
        ref={canvasRef}
        aria-label="Piano roll editor"
        data-active-tool={activeTool}
        className="absolute inset-0"
        style={{
          cursor: canvasCursor,
        }}
        title={canvasTitle}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
      />
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
          />
          <div
            className="fixed z-50 bg-[#1a1a2e] border border-[#333] rounded shadow-xl py-1 min-w-[160px]"
            style={{
              left: Math.min(contextMenu.x, window.innerWidth - 180),
              top: Math.min(contextMenu.y, window.innerHeight - 120),
            }}
          >
            <button
              className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-violet-600/30 hover:text-white transition-colors"
              onClick={handleContextMenuQuickQuantize}
            >
              Quantize (Q)
            </button>
            <button
              className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-violet-600/30 hover:text-white transition-colors"
              onClick={handleContextMenuQuantize}
            >
              Quantize with options... ({navigator.platform?.includes('Mac') ? '\u2318' : 'Ctrl'}+Q)
            </button>
          </div>
        </>
      )}
    </div>
  );
}
