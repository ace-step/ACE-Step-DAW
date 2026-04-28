import type { Track } from '../../types/project';
import { MAX_PROJECT_TRACKS } from '../../constants/defaults';

export const ARRANGEMENT_EMPTY_TRACK_ID_PREFIX = '__empty-';
export const MIN_ARRANGEMENT_VISIBLE_ROW_COUNT = 12;
export const ARRANGEMENT_TRAILING_EMPTY_ROW_COUNT = 8;

export type ArrangementTrackSlot =
  | { kind: 'track'; track: Track }
  | { kind: 'empty'; slotIndex: number };

export function getArrangementEmptyTrackId(slotIndex: number) {
  return `${ARRANGEMENT_EMPTY_TRACK_ID_PREFIX}${slotIndex}`;
}

export function parseArrangementEmptyTrackSlotIndex(trackId: string): number | null {
  if (!trackId.startsWith(ARRANGEMENT_EMPTY_TRACK_ID_PREFIX)) return null;

  const rawIndex = Number.parseInt(trackId.slice(ARRANGEMENT_EMPTY_TRACK_ID_PREFIX.length), 10);
  if (!Number.isFinite(rawIndex) || rawIndex < 0) return null;
  return rawIndex;
}

export function getFirstSelectedEmptyTrackSlotIndex(trackIds: Iterable<string>): number | null {
  let minSlotIndex: number | null = null;

  for (const trackId of trackIds) {
    const slotIndex = parseArrangementEmptyTrackSlotIndex(trackId);
    if (slotIndex === null) continue;
    if (minSlotIndex === null || slotIndex < minSlotIndex) {
      minSlotIndex = slotIndex;
    }
  }

  return minSlotIndex;
}

export function getArrangementVisibleRowCount(
  tracks: Track[],
  {
    minimumVisibleRowCount = MIN_ARRANGEMENT_VISIBLE_ROW_COUNT,
    trailingEmptyRowCount = ARRANGEMENT_TRAILING_EMPTY_ROW_COUNT,
  }: {
    minimumVisibleRowCount?: number;
    trailingEmptyRowCount?: number;
  } = {},
): number {
  const highestOccupiedSlotNumber = tracks.reduce((maxSlotNumber, track) => {
    const slotNumber = Number.isFinite(track.order) && track.order > 0
      ? Math.floor(track.order)
      : 0;
    return Math.max(maxSlotNumber, slotNumber);
  }, 0);

  return Math.min(
    MAX_PROJECT_TRACKS,
    Math.max(
      minimumVisibleRowCount,
      highestOccupiedSlotNumber + Math.max(0, trailingEmptyRowCount),
    ),
  );
}

export function buildArrangementTrackSlots(
  tracks: Track[],
  placeholderCount?: number,
): ArrangementTrackSlot[] {
  const effectiveCount = Math.min(
    MAX_PROJECT_TRACKS,
    placeholderCount ?? getArrangementVisibleRowCount(tracks),
  );
  const sortedTracks = [...tracks].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const slots: ArrangementTrackSlot[] = [];
  let nextSlotNumber = 1;

  for (const track of sortedTracks) {
    const targetSlotNumber = Number.isFinite(track.order) && track.order > 0
      ? Math.floor(track.order)
      : nextSlotNumber;

    while (nextSlotNumber < targetSlotNumber) {
      slots.push({ kind: 'empty', slotIndex: nextSlotNumber - 1 });
      nextSlotNumber += 1;
    }

    slots.push({ kind: 'track', track });
    nextSlotNumber = Math.max(nextSlotNumber, targetSlotNumber) + 1;
  }

  const minimumVisibleRowCount = Math.max(0, effectiveCount);
  const totalVisibleRowCount = Math.max(minimumVisibleRowCount, nextSlotNumber - 1);

  while (nextSlotNumber <= totalVisibleRowCount) {
    slots.push({ kind: 'empty', slotIndex: nextSlotNumber - 1 });
    nextSlotNumber += 1;
  }

  return slots;
}
