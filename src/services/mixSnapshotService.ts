import type {
  Track,
  ReturnTrack,
  MixSnapshot,
  MixSnapshotTrackState,
  MixSnapshotReturnTrackState,
  Project,
} from '../types/project';

interface ApplyMixStateOptions {
  cloneCollections?: boolean;
}

function applyCollection<T>(value: T[] | undefined, fallback: T[] | undefined, cloneCollections: boolean) {
  if (value === undefined) return fallback;
  return cloneCollections ? structuredClone(value) : value;
}

/** Capture mixer-relevant state from a single track. */
export function captureTrackMixState(track: Track): MixSnapshotTrackState {
  return {
    trackId: track.id,
    volume: track.volume,
    muted: track.muted,
    soloed: track.soloed,
    pan: track.pan,
    panMode: track.panMode,
    panLeft: track.panLeft,
    panRight: track.panRight,
    eqLowGain: track.eqLowGain,
    eqMidGain: track.eqMidGain,
    eqHighGain: track.eqHighGain,
    compressorEnabled: track.compressorEnabled,
    compressorThreshold: track.compressorThreshold,
    compressorRatio: track.compressorRatio,
    reverbMix: track.reverbMix,
    reverbRoomSize: track.reverbRoomSize,
    effects: structuredClone(track.effects ?? []),
    effectsBypassed: track.effectsBypassed,
    sends: structuredClone(track.sends ?? []),
  };
}

/** Capture mixer-relevant state from a return track. */
export function captureReturnTrackMixState(
  rt: ReturnTrack,
): MixSnapshotReturnTrackState {
  return {
    returnTrackId: rt.id,
    volume: rt.volume,
    pan: rt.pan,
    effects: structuredClone(rt.effects),
  };
}

/** Capture the full mixer state from a project into a snapshot. */
export function captureMixState(
  project: Project,
  name: string,
): MixSnapshot {
  return {
    id: crypto.randomUUID(),
    name,
    createdAt: Date.now(),
    trackStates: project.tracks.map(captureTrackMixState),
    returnTrackStates: (project.returnTracks ?? []).map(
      captureReturnTrackMixState,
    ),
    masterVolume: project.masterVolume,
  };
}

/** Apply a snapshot's track state onto a Track, returning the updated track. */
export function applyTrackMixState(
  track: Track,
  state: MixSnapshotTrackState,
  options: ApplyMixStateOptions = {},
): Track {
  const cloneCollections = options.cloneCollections ?? true;
  return {
    ...track,
    volume: state.volume,
    muted: state.muted,
    soloed: state.soloed,
    pan: state.pan,
    panMode: state.panMode,
    panLeft: state.panLeft,
    panRight: state.panRight,
    eqLowGain: state.eqLowGain,
    eqMidGain: state.eqMidGain,
    eqHighGain: state.eqHighGain,
    compressorEnabled: state.compressorEnabled,
    compressorThreshold: state.compressorThreshold,
    compressorRatio: state.compressorRatio,
    reverbMix: state.reverbMix,
    reverbRoomSize: state.reverbRoomSize,
    effects: applyCollection(state.effects, track.effects, cloneCollections),
    effectsBypassed: state.effectsBypassed,
    sends: applyCollection(state.sends, track.sends, cloneCollections),
  };
}

/** Apply a snapshot's return track state onto a ReturnTrack. */
export function applyReturnTrackMixState(
  rt: ReturnTrack,
  state: MixSnapshotReturnTrackState,
  options: ApplyMixStateOptions = {},
): ReturnTrack {
  const cloneCollections = options.cloneCollections ?? true;
  return {
    ...rt,
    volume: state.volume,
    pan: state.pan,
    effects: cloneCollections ? structuredClone(state.effects) : state.effects,
  };
}

/** Result of comparing a track's current state with a snapshot state. */
export interface TrackMixDiff {
  trackId: string;
  changed: boolean;
  fields: string[];
}

const MIXER_FIELDS: (keyof MixSnapshotTrackState)[] = [
  'volume',
  'muted',
  'soloed',
  'pan',
  'panMode',
  'panLeft',
  'panRight',
  'eqLowGain',
  'eqMidGain',
  'eqHighGain',
  'compressorEnabled',
  'compressorThreshold',
  'compressorRatio',
  'reverbMix',
  'reverbRoomSize',
  'effectsBypassed',
];

/** Compare current track state against a snapshot track state. */
export function diffTrackMixState(
  current: MixSnapshotTrackState,
  snapshot: MixSnapshotTrackState,
): TrackMixDiff {
  const fields: string[] = [];

  for (const field of MIXER_FIELDS) {
    if (current[field] !== snapshot[field]) {
      fields.push(field);
    }
  }

  // Compare effects chain length and content (shallow JSON comparison)
  if (
    JSON.stringify(current.effects ?? []) !==
    JSON.stringify(snapshot.effects ?? [])
  ) {
    fields.push('effects');
  }

  // Compare sends
  if (
    JSON.stringify(current.sends ?? []) !==
    JSON.stringify(snapshot.sends ?? [])
  ) {
    fields.push('sends');
  }

  return {
    trackId: current.trackId,
    changed: fields.length > 0,
    fields,
  };
}

/** Diff all tracks between current project state and a snapshot. */
export function diffMixSnapshots(
  project: Project,
  snapshot: MixSnapshot,
): TrackMixDiff[] {
  const currentStates = project.tracks.map(captureTrackMixState);
  const snapshotMap = new Map(
    snapshot.trackStates.map((s) => [s.trackId, s]),
  );

  return currentStates.map((current) => {
    const snapshotState = snapshotMap.get(current.trackId);
    if (!snapshotState) {
      return { trackId: current.trackId, changed: true, fields: ['new-track'] };
    }
    return diffTrackMixState(current, snapshotState);
  });
}
