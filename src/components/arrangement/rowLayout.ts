import { getTrackHeightForPreset } from '../../constants/trackHeight';
import type { TrackType } from '../../types/project';

type ArrangementRowTrackLike = {
  isGroup?: boolean;
  laneHeight?: number;
  trackType?: TrackType;
};

const DEFAULT_TRACK_TYPE: TrackType = 'stems';
const MIN_GROUP_ROW_HEIGHT = 40;

export const DEFAULT_ARRANGEMENT_ROW_HEIGHT = getTrackHeightForPreset('auto', DEFAULT_TRACK_TYPE);

export function getArrangementRowHeight(track?: ArrangementRowTrackLike | null): number {
  const baseHeight = track?.laneHeight
    ?? getTrackHeightForPreset('auto', track?.trackType ?? DEFAULT_TRACK_TYPE);

  if (track?.isGroup) {
    return Math.max(MIN_GROUP_ROW_HEIGHT, baseHeight * 0.7);
  }

  return baseHeight;
}
