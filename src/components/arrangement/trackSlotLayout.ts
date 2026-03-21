import type { Track } from '../../types/project';

export const ARRANGEMENT_EMPTY_TRACK_ID_PREFIX = '__empty-';
export const DEFAULT_ARRANGEMENT_PLACEHOLDER_ROW_COUNT = 20;

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

export function buildArrangementTrackSlots(
  tracks: Track[],
  placeholderCount = DEFAULT_ARRANGEMENT_PLACEHOLDER_ROW_COUNT,
): ArrangementTrackSlot[] {
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

  for (let i = 0; i < placeholderCount; i += 1) {
    slots.push({ kind: 'empty', slotIndex: nextSlotNumber - 1 });
    nextSlotNumber += 1;
  }

  return slots;
}
