import { useCallback, useEffect, useRef, useState } from 'react';
import type { Clip, MidiNote, PianoRollGrid } from '../../types/project';
import type { PianoRollTool } from './PianoRollConstants';
import {
  generateNoteId,
  gridSizeToBeats,
  MIDI_MAX_NOTE,
  PIANO_KEYBOARD_WIDTH,
  VELOCITY_LANE_HEIGHT,
} from './PianoRollConstants';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';

export type NoteDragMode = null | 'move' | 'resize-left' | 'resize-right' | 'velocity';

export interface NoteDragState {
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

interface UsePianoRollDragParams {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  clip: Clip;
  notes: MidiNote[];
  activeTool: PianoRollTool;
  gridSize: PianoRollGrid;
  pixelsPerBeat: number;
  keyHeight: number;
  selectedNoteIds: Set<string>;
  setSelectedNoteIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  beatToX: (beat: number) => number;
  xToBeat: (x: number) => number;
  pitchToY: (pitch: number) => number;
  yToPitch: (y: number) => number;
  snapBeat: (beat: number, bypass?: boolean) => number;
  getCellKey: (beat: number, pitch: number) => string;
  findNoteAt: (x: number, y: number) => { note: MidiNote; edge: 'body' | 'left' | 'right' } | null;
  findVelocityLaneNoteAt: (x: number) => MidiNote | null;
  createNoteAt: (x: number, y: number, options?: { isSlide?: boolean; select?: boolean; velocity?: number }) => MidiNote | null;
  stampChordAt: (x: number, y: number) => string[];
  deleteNoteById: (noteId: string) => void;
  previewEnabled: boolean;
  previewNoteAtPitch: (pitch: number, velocity?: number, duration?: number) => void;
  velocityHeight: number;
  setVelocityHeight: React.Dispatch<React.SetStateAction<number>>;
}

export interface UsePianoRollDragReturn {
  dragRef: React.RefObject<NoteDragState | null>;
  dividerDragRef: React.RefObject<{ startY: number; startHeight: number } | null>;
  toolStrokeRef: React.RefObject<{ noteIds: Set<string>; cells: Set<string> }>;
  handleMouseDown: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  handleDoubleClick: (e: React.MouseEvent<HTMLCanvasElement>) => void;
  handleClick: (e: React.MouseEvent<HTMLCanvasElement>) => void;
}

export function usePianoRollDrag(params: UsePianoRollDragParams): UsePianoRollDragReturn {
  const {
    canvasRef,
    clip,
    notes,
    activeTool,
    gridSize,
    pixelsPerBeat,
    keyHeight,
    selectedNoteIds,
    setSelectedNoteIds,
    beatToX,
    xToBeat,
    pitchToY,
    yToPitch,
    snapBeat,
    getCellKey,
    findNoteAt,
    findVelocityLaneNoteAt,
    createNoteAt,
    stampChordAt,
    deleteNoteById,
    previewEnabled,
    previewNoteAtPitch,
    velocityHeight,
    setVelocityHeight,
  } = params;

  const dragRef = useRef<NoteDragState | null>(null);
  const dividerDragRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const toolStrokeRef = useRef<{ noteIds: Set<string>; cells: Set<string> }>({
    noteIds: new Set(),
    cells: new Set(),
  });

  const addMidiNote = useProjectStore((s) => s.addMidiNote);
  const updateMidiNote = useProjectStore((s) => s.updateMidiNote);
  const setNoteVelocity = useProjectStore((s) => s.setNoteVelocity);
  const resizeMidiNote = useProjectStore((s) => s.resizeMidiNote);
  const beginDrag = useProjectStore((s) => s.beginDrag);
  const endDrag = useProjectStore((s) => s.endDrag);
  const undo = useProjectStore((s) => s.undo);

  const gridBeats = gridSizeToBeats(gridSize);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const noteAreaHeight = rect.height - velocityHeight;

      // Divider drag
      if (Math.abs(y - noteAreaHeight) < 5) {
        dividerDragRef.current = { startY: e.clientY, startHeight: velocityHeight };
        return;
      }

      // Velocity lane interaction
      if (y > noteAreaHeight + 3) {
        const velAreaTop = noteAreaHeight + 3;
        const velAreaHeight = velocityHeight - 6;
        const note = findVelocityLaneNoteAt(x);
        if (note) {
          setSelectedNoteIds(new Set([note.id]));
          beginDrag({ scope: 'pianoRoll', label: 'Edit MIDI velocity', clipId: clip.id });
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

      // Keyboard preview
      if (x < PIANO_KEYBOARD_WIDTH) {
        const pitch = yToPitch(y);
        if (pitch >= 0 && pitch <= MIDI_MAX_NOTE && previewEnabled) {
          previewNoteAtPitch(pitch, 100, 0.5);
        }
        return;
      }

      const hit = findNoteAt(x, y);

      if (e.shiftKey && activeTool !== 'select') {
        return;
      }

      // Velocity paint tool
      if (activeTool === 'velocityPaint') {
        if (hit) {
          const velocityFromY = Math.round(Math.max(1, Math.min(127, ((noteAreaHeight - y) / noteAreaHeight) * 127)));
          beginDrag({ scope: 'pianoRoll', label: 'Velocity paint', clipId: clip.id });
          setNoteVelocity(clip.id, hit.note.id, velocityFromY);
          toolStrokeRef.current.noteIds.add(hit.note.id);
          dragRef.current = {
            mode: 'velocity',
            noteId: hit.note.id,
            startMouseX: x,
            startMouseY: y,
            originalPitch: hit.note.pitch,
            originalStartBeat: hit.note.startBeat,
            originalDurationBeats: hit.note.durationBeats,
            originalVelocity: hit.note.velocity,
          };
        }
        return;
      }

      // Erase tool
      if (activeTool === 'erase') {
        if (hit) {
          toolStrokeRef.current.noteIds.add(hit.note.id);
          deleteNoteById(hit.note.id);
        }
        return;
      }

      // Paint tool
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

      // Pencil / Slide tool
      if (activeTool === 'pencil' || activeTool === 'slide') {
        if (hit && activeTool !== 'slide') {
          deleteNoteById(hit.note.id);
          return;
        }

        const newNote = createNoteAt(x, y, { isSlide: activeTool === 'slide' });
        if (!newNote) return;

        beginDrag({ scope: 'pianoRoll', label: 'Resize MIDI note', clipId: clip.id });
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

      // Select tool — hit a note
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

        beginDrag({
          scope: 'pianoRoll',
          label: hit.edge === 'body' ? 'Edit MIDI note' : 'Resize MIDI note',
          clipId: clip.id,
        });
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

      // Select tool — box selection on empty space
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
      beginDrag,
      canvasRef,
      clip.id,
      createNoteAt,
      deleteNoteById,
      findNoteAt,
      findVelocityLaneNoteAt,
      getCellKey,
      previewEnabled,
      previewNoteAtPitch,
      selectedNoteIds,
      setNoteVelocity,
      setSelectedNoteIds,
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
    [activeTool, canvasRef, createNoteAt, deleteNoteById, findNoteAt, velocityHeight],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || !e.shiftKey) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const noteAreaHeight = rect.height - velocityHeight;

      if (x < PIANO_KEYBOARD_WIDTH || y > noteAreaHeight) return;

      const hit = findNoteAt(x, y);
      if (hit && activeTool === 'select') return;

      stampChordAt(x, y);
    },
    [activeTool, canvasRef, findNoteAt, stampChordAt, velocityHeight],
  );

  // Global mouse move/up/keydown handlers for drag operations
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

      // Tool stroke continuation (no active drag state)
      if (!drag && isPrimaryButtonDown && y <= noteAreaHeight && x >= PIANO_KEYBOARD_WIDTH) {
        if (activeTool === 'velocityPaint') {
          const hit = findNoteAt(x, y);
          if (hit && !toolStrokeRef.current.noteIds.has(hit.note.id)) {
            const velocityFromY = Math.round(Math.max(1, Math.min(127, ((noteAreaHeight - y) / noteAreaHeight) * 127)));
            setNoteVelocity(clip.id, hit.note.id, velocityFromY);
            toolStrokeRef.current.noteIds.add(hit.note.id);
          }
        }
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

      // Box selection
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

      // Velocity drag
      if (drag.mode === 'velocity') {
        const velAreaTop = noteAreaHeight + 3;
        const velAreaHeight = velocityHeight - 6;
        updateMidiNote(clip.id, drag.noteId, {
          velocity: Math.round(Math.max(1, Math.min(127, ((velAreaTop + velAreaHeight - y) / velAreaHeight) * 127))),
        });
        return;
      }

      // Move drag
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

      // Resize left
      if (drag.mode === 'resize-left') {
        const beatDelta = (x - drag.startMouseX) / pixelsPerBeat;
        const snappedStart = Math.max(0, snapBeat(drag.originalStartBeat + beatDelta, e.altKey));
        resizeMidiNote(clip.id, drag.noteId, {
          edge: 'left',
          startBeat: snappedStart,
          minDurationBeats: gridBeats * 0.5,
        });
        return;
      }

      // Resize right
      if (drag.mode === 'resize-right') {
        const beatDelta = (x - drag.startMouseX) / pixelsPerBeat;
        const endBeat = snapBeat(drag.originalStartBeat + drag.originalDurationBeats + beatDelta, e.altKey);
        resizeMidiNote(clip.id, drag.noteId, {
          edge: 'right',
          endBeat,
          minDurationBeats: gridBeats * 0.5,
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
    canvasRef,
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
    resizeMidiNote,
    setNoteVelocity,
    setSelectedNoteIds,
    setVelocityHeight,
    snapBeat,
    undo,
    updateMidiNote,
    velocityHeight,
    xToBeat,
    yToPitch,
  ]);

  return {
    dragRef,
    dividerDragRef,
    toolStrokeRef,
    handleMouseDown,
    handleDoubleClick,
    handleClick,
  };
}
