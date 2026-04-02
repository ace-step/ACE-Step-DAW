/**
 * Clipboard service for copy/cut/paste of clips and MIDI notes.
 *
 * Uses an internal app clipboard (not the system clipboard) to store
 * rich structured data that can't be serialized to plain text.
 */
import { v4 as uuidv4 } from 'uuid';
import type { Clip, MidiNote } from '../types/project';

// ── Clipboard data types ──────────────────────────────────────────

export interface ClipboardClipEntry {
  /** Deep clone of the source clip (original IDs preserved for reference). */
  clip: Clip;
  /** Track ID the clip was copied from, used for same-track paste. */
  sourceTrackId: string;
}

export interface ClipboardClipData {
  type: 'clips';
  entries: ClipboardClipEntry[];
  /** Earliest startTime among copied clips — used as the paste anchor. */
  anchorTime: number;
}

export interface ClipboardNoteData {
  type: 'notes';
  notes: MidiNote[];
  /** Clip ID the notes were copied from. */
  sourceClipId: string;
  /** Earliest startBeat among copied notes — used as the paste anchor. */
  anchorBeat: number;
}

export type ClipboardData = ClipboardClipData | ClipboardNoteData;

// ── Deep clone helpers ────────────────────────────────────────────

/** Deep clone a clip, preserving all fields exactly. */
export function deepCloneClip(clip: Clip): Clip {
  return structuredClone(clip);
}

/** Deep clone a MIDI note. */
export function deepCloneMidiNote(note: MidiNote): MidiNote {
  return { ...note };
}

// ── Copy operations ───────────────────────────────────────────────

/**
 * Build clipboard data from selected clips.
 * Returns null if no clips are provided.
 */
export function copyClips(
  clips: { clip: Clip; trackId: string }[],
): ClipboardClipData | null {
  if (clips.length === 0) return null;

  const entries: ClipboardClipEntry[] = clips.map(({ clip, trackId }) => ({
    clip: deepCloneClip(clip),
    sourceTrackId: trackId,
  }));

  const anchorTime = Math.min(...entries.map((e) => e.clip.startTime));
  return { type: 'clips', entries, anchorTime };
}

/**
 * Build clipboard data from selected MIDI notes.
 * Returns null if no notes are provided.
 */
export function copyNotes(
  notes: MidiNote[],
  sourceClipId: string,
): ClipboardNoteData | null {
  if (notes.length === 0) return null;

  const cloned = notes.map(deepCloneMidiNote);
  const anchorBeat = Math.min(...cloned.map((n) => n.startBeat));
  return { type: 'notes', notes: cloned, sourceClipId, anchorBeat };
}

// ── Paste operations ──────────────────────────────────────────────

export interface PastedClip {
  /** New clip with fresh ID, repositioned to pasteTime. */
  clip: Clip;
  /** Target track ID for this clip. */
  targetTrackId: string;
}

/**
 * Prepare clips from clipboard for pasting at a given time.
 * Each clip gets a new UUID and is offset so the anchor aligns to pasteTime.
 */
export function preparePasteClips(
  data: ClipboardClipData,
  pasteTime: number,
): PastedClip[] {
  const timeOffset = pasteTime - data.anchorTime;

  return data.entries.map((entry) => {
    const newClip: Clip = {
      ...deepCloneClip(entry.clip),
      id: uuidv4(),
      startTime: entry.clip.startTime + timeOffset,
      // Preserve audio state for ready clips
      generationJobId: null,
    };
    // Give MIDI notes fresh IDs
    if (newClip.midiData) {
      newClip.midiData = {
        ...newClip.midiData,
        notes: newClip.midiData.notes.map((n) => ({ ...n, id: uuidv4() })),
      };
    }
    return { clip: newClip, targetTrackId: entry.sourceTrackId };
  });
}

/**
 * Prepare MIDI notes from clipboard for pasting at a given beat position.
 * Each note gets a new UUID and is offset so the anchor aligns to pasteBeat.
 */
export function preparePasteNotes(
  data: ClipboardNoteData,
  pasteBeat: number,
): MidiNote[] {
  const beatOffset = pasteBeat - data.anchorBeat;

  return data.notes.map((note) => ({
    ...deepCloneMidiNote(note),
    id: uuidv4(),
    startBeat: note.startBeat + beatOffset,
  }));
}
