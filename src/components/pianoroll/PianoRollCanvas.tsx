import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { synthEngine } from '../../engine/SynthEngine';
import { samplerEngine } from '../../engine/SamplerEngine';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import { ContextMenuWrapper, ContextMenuItem } from '../ui/ContextMenu';
import { useTransportStore } from '../../store/transportStore';
import type { Clip, MidiNote, PianoRollGrid, Track } from '../../types/project';
import { DEFAULT_CHORD_SHAPE_ABBR, getChordShapeByAbbr } from '../../utils/chords';
import { useNonPassiveWheel } from '../../hooks/useNonPassiveWheel';
import {
  generateNoteId,
  gridSizeToBeats,
  MIDI_MAX_NOTE,
  PIANO_KEYBOARD_WIDTH,
  PIANO_ROLL_KEY_HEIGHT,
  type PianoRollTool,
  VELOCITY_LANE_HEIGHT,
} from './PianoRollConstants';
import { drawPianoRoll } from './PianoRollRenderer';
import { usePianoRollDrag } from './usePianoRollDrag';
import { useMidiAiStore } from '../../store/midiAiStore';
import { useMpeStore } from '../../store/mpeStore';
import { hasExpressionData } from './ExpressionLane';

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
  activeChordShapeAbbr: string;
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
  activeChordShapeAbbr,
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

  const [velocityHeight, setVelocityHeight] = useState(VELOCITY_LANE_HEIGHT);
  const mpeEnabled = useMpeStore((s) => s.enabled);
  const expressionType = useUIStore((s) => s.pianoRollExpressionType ?? 'pitchBend');
  const [prZoomY, setPrZoomY] = useState(1);
  const [prScrollX, setPrScrollX] = useState(0);
  const [prScrollY, setPrScrollY] = useState(780);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [hoverCursor, setHoverCursor] = useState<string | null>(null);

  const addMidiNote = useProjectStore((s) => s.addMidiNote);
  const stampChord = useProjectStore((s) => s.stampChord);
  const removeMidiNote = useProjectStore((s) => s.removeMidiNote);
  const updateMidiNote = useProjectStore((s) => s.updateMidiNote);
  const quantizeMidiNotes = useProjectStore((s) => s.quantizeMidiNotes);
  const openQuantizeDialog = useUIStore((s) => s.openQuantizeDialog);
  const quantizePreviewPositions = useUIStore((s) => s.quantizePreviewPositions);

  // MIDI AI generation state — only active when panel targets this clip
  const aiPanelOpen = useMidiAiStore((s) => s.panelOpen);
  const aiTargetClipId = useMidiAiStore((s) => s.targetClipId);
  const aiActiveForClip = aiPanelOpen && aiTargetClipId === clip.id;
  const aiLockedNoteIds = useMidiAiStore((s) => s.lockedNoteIds);
  const aiSelectionStartBeat = useMidiAiStore((s) => s.selectionStartBeat);
  const aiSelectionEndBeat = useMidiAiStore((s) => s.selectionEndBeat);
  const aiStatus = useMidiAiStore((s) => s.status);
  const aiVariations = useMidiAiStore((s) => s.variations);
  const aiActiveVariationIndex = useMidiAiStore((s) => s.activeVariationIndex);
  const aiPreviewNotes = aiActiveForClip && aiStatus === 'previewing'
    ? (aiVariations[aiActiveVariationIndex]?.notes ?? [])
    : [];

  const notes: MidiNote[] = clip.midiData?.notes ?? [];
  const expressionLaneHeight = mpeEnabled && hasExpressionData(notes) ? 80 : 0;
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
  const activeChordShape = useMemo(
    () => getChordShapeByAbbr(activeChordShapeAbbr) ?? getChordShapeByAbbr(DEFAULT_CHORD_SHAPE_ABBR)!,
    [activeChordShapeAbbr],
  );

  const defaultCanvasCursor = activeTool === 'select'
    ? 'default'
    : activeTool === 'erase'
      ? 'not-allowed'
      : activeTool === 'slide'
        ? 'alias'
        : activeTool === 'velocityPaint'
          ? 'ns-resize'
          : 'crosshair';
  const canvasCursor = hoverCursor ?? defaultCanvasCursor;
  const canvasTitle = activeTool === 'select'
    ? 'Select notes, drag a marquee, or resize existing notes'
    : activeTool === 'pencil'
      ? 'Pencil tool: click to create a note, then drag to adjust its length'
      : activeTool === 'paint'
        ? 'Paint tool: drag across the grid to stamp repeated notes'
        : activeTool === 'erase'
          ? 'Erase tool: click or drag across notes to remove them'
          : activeTool === 'velocityPaint'
            ? 'Velocity paint: drag across notes to set velocity based on vertical position'
            : 'Slide tool: create slide notes for portamento transitions';

  // --- Coordinate conversion helpers ---

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

  // --- Note creation / deletion helpers ---

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

  const stampChordAt = useCallback(
    (x: number, y: number) => {
      const beat = snapBeat(xToBeat(x), false);
      const pitch = yToPitch(y);
      if (pitch < 0 || pitch > MIDI_MAX_NOTE) return [];

      const noteIds = stampChord(
        clip.id,
        pitch,
        activeChordShape.intervals,
        Math.max(0, beat),
        gridBeats,
        100,
      );

      if (noteIds.length > 0) {
        setSelectedNoteIds(new Set(noteIds));
        if (previewEnabled) {
          previewNoteAtPitch(pitch, 100, 0.4);
        }
      }

      return noteIds;
    },
    [
      activeChordShape.intervals,
      clip.id,
      gridBeats,
      previewEnabled,
      previewNoteAtPitch,
      setSelectedNoteIds,
      snapBeat,
      stampChord,
      xToBeat,
      yToPitch,
    ],
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

  // --- Hit-testing ---

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

  const findVelocityLaneNoteAt = useCallback(
    (x: number) => {
      for (let i = notes.length - 1; i >= 0; i--) {
        const note = notes[i];
        const noteX = beatToX(note.startBeat);
        const noteWidth = Math.max(note.durationBeats * pixelsPerBeat, 4);
        if (x >= noteX && x <= noteX + noteWidth) {
          return note;
        }
      }

      return null;
    },
    [notes, beatToX, pixelsPerBeat],
  );

  // --- Drag state machine (extracted hook) ---

  const {
    dragRef,
    dividerDragRef,
    toolStrokeRef,
    handleMouseDown,
    handleDoubleClick,
    handleClick,
  } = usePianoRollDrag({
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
  });

  // --- Canvas drawing (extracted renderer) ---

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

    const liveTime = useTransportStore.getState().currentTime;

    drawPianoRoll({
      ctx,
      width: rect.width,
      height: rect.height,
      velocityHeight,
      keyHeight,
      prZoomY,
      pixelsPerBeat,
      gridSize,
      prScrollX,
      activeTool,
      notes,
      selectedNoteIds,
      ghostNotes,
      beatToX,
      pitchToY,
      bpm,
      clipStartTime: clip.startTime,
      clipDuration: clip.duration,
      currentBeat: liveTime,
      drag: dragRef.current,
      quantizePreviewPositions,
      lockedNoteIds: aiActiveForClip ? aiLockedNoteIds : undefined,
      aiSelectionStartBeat: aiActiveForClip ? aiSelectionStartBeat : null,
      aiSelectionEndBeat: aiActiveForClip ? aiSelectionEndBeat : null,
      aiPreviewNotes: aiActiveForClip ? aiPreviewNotes : undefined,
      expressionLaneHeight,
      expressionType,
    });
  }, [
    activeTool,
    beatToX,
    bpm,
    clip.duration,
    clip.startTime,
    dragRef,
    ghostNotes,
    gridSize,
    keyHeight,
    notes,
    pixelsPerBeat,
    pitchToY,
    prScrollX,
    prZoomY,
    quantizePreviewPositions,
    selectedNoteIds,
    velocityHeight,
    aiLockedNoteIds,
    aiSelectionStartBeat,
    aiSelectionEndBeat,
    aiPreviewNotes,
    aiActiveForClip,
    expressionLaneHeight,
    expressionType,
  ]);

  useEffect(() => {
    const tick = () => {
      draw();
      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  // --- Scroll / zoom ---

  const handleWheel = useCallback(
    (e: WheelEvent) => {
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

  const wheelRef = useNonPassiveWheel(handleWheel);
  const mergedCanvasRef = useCallback((el: HTMLCanvasElement | null) => {
    (canvasRef as React.MutableRefObject<HTMLCanvasElement | null>).current = el;
    wheelRef(el);
  }, [wheelRef]);

  // --- Keyboard shortcuts ---

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
        if (!dragRef.current && !dividerDragRef.current) {
          setSelectedNoteIds(new Set());
        }
        return;
      }

      if (key === 'q') {
        const targetIds = selectedNoteIds.size > 0
          ? Array.from(selectedNoteIds)
          : notes.map((n) => n.id);
        if (targetIds.length === 0) return;
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
          openQuantizeDialog(clip.id, targetIds);
        } else {
          quantizeMidiNotes(clip.id, targetIds, gridBeats);
        }
        return;
      }

      if (selectedNoteIds.size > 0 && e.shiftKey) {
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
    dividerDragRef,
    dragRef,
    gridBeats,
    notes,
    removeMidiNote,
    selectedNoteIds,
    setSelectedNoteIds,
    snapBeat,
    updateMidiNote,
    openQuantizeDialog,
    quantizeMidiNotes,
  ]);

  // --- Context menu ---

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

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

  const handleContextMenuLockNotes = useCallback(() => {
    setContextMenu(null);
    if (selectedNoteIds.size > 0) {
      useMidiAiStore.getState().lockNotes(Array.from(selectedNoteIds));
    }
  }, [selectedNoteIds]);

  const handleContextMenuUnlockNotes = useCallback(() => {
    setContextMenu(null);
    if (selectedNoteIds.size > 0) {
      useMidiAiStore.getState().unlockNotes(Array.from(selectedNoteIds));
    }
  }, [selectedNoteIds]);

  const handleContextMenuSetAiRegion = useCallback(() => {
    setContextMenu(null);
    if (selectedNoteIds.size === 0) return;
    // Use the bounding box of selected notes as the AI region
    const selNotes = notes.filter((n) => selectedNoteIds.has(n.id));
    if (selNotes.length === 0) return;
    const minBeat = Math.min(...selNotes.map((n) => n.startBeat));
    const maxBeat = Math.max(...selNotes.map((n) => n.startBeat + n.durationBeats));
    useMidiAiStore.getState().setSelection(minBeat, maxBeat);
  }, [selectedNoteIds, notes]);

  // --- Hover cursor ---

  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (activeTool !== 'select' || dragRef.current) {
        if (hoverCursor !== null) setHoverCursor(null);
        return;
      }

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const hit = findNoteAt(e.clientX - rect.left, e.clientY - rect.top);
      const nextCursor = hit?.edge === 'left' || hit?.edge === 'right' ? 'col-resize' : null;
      if (nextCursor !== hoverCursor) {
        setHoverCursor(nextCursor);
      }
    },
    [activeTool, dragRef, findNoteAt, hoverCursor],
  );

  const handleCanvasMouseLeave = useCallback(() => {
    if (hoverCursor !== null) {
      setHoverCursor(null);
    }
  }, [hoverCursor]);

  // --- Agent/E2E helpers exposed on window ---

  useEffect(() => {
    const globalWindow = window as Window & {
      __pianoRollHelpers?: {
        beatToX: (beat: number) => number;
        xToBeat: (x: number) => number;
        pitchToY: (pitch: number) => number;
        yToPitch: (y: number) => number;
        applyToolStroke: (points: Array<{ x: number; y: number }>) => void;
        stampChordAt: (x: number, y: number) => string[];
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
      stampChordAt,
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
    stampChordAt,
    toolStrokeRef,
    velocityHeight,
    xToBeat,
    yToPitch,
  ]);

  return (
    <div ref={containerRef} className="flex-1 relative overflow-hidden">
      <canvas
        ref={mergedCanvasRef}
        aria-label="Piano roll editor"
        data-active-tool={activeTool}
        className="absolute inset-0"
        style={{
          cursor: canvasCursor,
        }}
        title={canvasTitle}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        onMouseMove={handleCanvasMouseMove}
        onMouseLeave={handleCanvasMouseLeave}
      />
      {contextMenu && (
        <ContextMenuWrapper x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)}>
          <ContextMenuItem
            label="Quantize"
            onClick={handleContextMenuQuickQuantize}
            shortcut="Q"
          />
          <ContextMenuItem
            label="Quantize with options..."
            onClick={handleContextMenuQuantize}
            shortcut={`${navigator.platform?.includes('Mac') ? '\u2318' : 'Ctrl'}+Q`}
          />
          {aiActiveForClip && selectedNoteIds.size > 0 && (
            <>
              <ContextMenuItem
                label="Lock for AI"
                onClick={handleContextMenuLockNotes}
              />
              <ContextMenuItem
                label="Unlock for AI"
                onClick={handleContextMenuUnlockNotes}
              />
              <ContextMenuItem
                label="Set AI Region"
                onClick={handleContextMenuSetAiRegion}
              />
            </>
          )}
        </ContextMenuWrapper>
      )}
    </div>
  );
}
