import { create } from 'zustand';

export interface SessionLaunchState {
  clipId: string;
  sceneIndex: number;
  launchedAt: number;
  /** Offset into the clip (in seconds) for legato playback start. */
  startOffset?: number;
}

export interface SessionArrangementRecordEvent {
  trackId: string;
  clipId: string;
  sceneIndex: number;
  startTime: number;
  endTime: number | null;
}

export interface TransportState {
  isPlaying: boolean;
  isRecording: boolean;
  isScrubbing: boolean;
  armedTrackIds: string[];
  countInActive: boolean;
  countInBeat: number; // 0 = not counting in, negative = beats remaining
  currentTime: number;
  /** The time position where playback started — triangle anchor */
  playStartTime: number;
  scrubAnchorTime: number | null;
  scrubResumeOnRelease: boolean;
  scrubPreviewRate: number;
  loopEnabled: boolean;
  loopStart: number;
  loopEnd: number;
  metronomeEnabled: boolean;
  metronomeSound: 'click' | 'woodblock' | 'beep';
  metronomeVolume: number;
  punchInTime: number | null;
  punchOutTime: number | null;
  punchEnabled: boolean;
  countInBars: number;
  loopRecordingEnabled: boolean;
  loopCycleCount: number;
  launchedSessionClips: Record<string, SessionLaunchState>;
  sessionArrangementRecording: boolean;
  sessionArrangementRecordStartTime: number | null;
  sessionArrangementRecordEvents: SessionArrangementRecordEvent[];

  play: () => void;
  pause: () => void;
  stop: () => void;
  setIsRecording: (v: boolean) => void;
  setCountIn: (active: boolean, beat?: number) => void;
  armTrack: (id: string) => void;
  disarmTrack: (id: string) => void;
  disarmAll: () => void;
  toggleArmTrack: (id: string, exclusive?: boolean) => void;
  seek: (time: number) => void;
  setCurrentTime: (time: number) => void;
  startScrub: (time: number, resumeOnRelease?: boolean) => void;
  updateScrub: (time: number, previewRate: number) => void;
  endScrub: () => void;
  toggleLoop: () => void;
  setLoopRegion: (start: number, end: number) => void;
  toggleMetronome: () => void;
  setMetronomeSound: (sound: 'click' | 'woodblock' | 'beep') => void;
  setMetronomeVolume: (volume: number) => void;
  setPunchIn: (time: number) => void;
  setPunchOut: (time: number) => void;
  togglePunch: () => void;
  setPunchRange: (inTime: number, outTime: number) => void;
  setCountInBars: (bars: number) => void;
  toggleLoopRecording: () => void;
  setLoopCycleCount: (count: number) => void;
  incrementLoopCycle: () => void;
  launchSessionClip: (trackId: string, clipId: string, sceneIndex: number, launchedAt?: number, startOffset?: number) => void;
  stopSessionTrack: (trackId: string, stopTime?: number) => void;
  stopAllSessionClips: (stopTime?: number) => void;
  launchSessionScene: (sceneIndex: number, clips: Array<{ trackId: string; clipId: string }>, launchedAt?: number) => void;
  startSessionArrangementRecording: (startTime: number) => void;
  stopSessionArrangementRecording: (stopTime: number) => void;
}

export const useTransportStore = create<TransportState>((set) => ({
  isPlaying: false,
  isRecording: false,
  isScrubbing: false,
  armedTrackIds: [],
  countInActive: false,
  countInBeat: 0,
  currentTime: 0,
  playStartTime: 0,
  scrubAnchorTime: null,
  scrubResumeOnRelease: false,
  scrubPreviewRate: 0,
  loopEnabled: false,
  loopStart: 0,
  loopEnd: 0,
  metronomeEnabled: false,
  metronomeSound: 'click',
  metronomeVolume: 0.5,
  punchInTime: null,
  punchOutTime: null,
  punchEnabled: false,
  countInBars: 1,
  loopRecordingEnabled: false,
  loopCycleCount: 0,
  launchedSessionClips: {},
  sessionArrangementRecording: false,
  sessionArrangementRecordStartTime: null,
  sessionArrangementRecordEvents: [],

  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  stop: () => set({
    isPlaying: false,
    isScrubbing: false,
    currentTime: 0,
    playStartTime: 0,
    scrubAnchorTime: null,
    scrubResumeOnRelease: false,
    scrubPreviewRate: 0,
    loopCycleCount: 0,
  }),
  setIsRecording: (v) => set({ isRecording: v }),
  setCountIn: (active, beat = 0) => set({ countInActive: active, countInBeat: beat }),
  armTrack: (id) => set((s) => (
    s.armedTrackIds.includes(id) ? s : { armedTrackIds: [...s.armedTrackIds, id] }
  )),
  disarmTrack: (id) => set((s) => ({
    armedTrackIds: s.armedTrackIds.filter((trackId) => trackId !== id),
  })),
  disarmAll: () => set({ armedTrackIds: [] }),
  toggleArmTrack: (id, exclusive = true) => set((s) => {
    const isArmed = s.armedTrackIds.includes(id);
    if (isArmed) {
      return { armedTrackIds: s.armedTrackIds.filter((tid) => tid !== id) };
    }
    return { armedTrackIds: exclusive ? [id] : [...s.armedTrackIds, id] };
  }),
  seek: (time) => set({ currentTime: Math.max(0, time), playStartTime: Math.max(0, time) }),
  setCurrentTime: (time) => set({ currentTime: time }),
  startScrub: (time, resumeOnRelease = false) => set({
    isPlaying: false,
    isScrubbing: true,
    currentTime: Math.max(0, time),
    playStartTime: Math.max(0, time),
    scrubAnchorTime: Math.max(0, time),
    scrubResumeOnRelease: resumeOnRelease,
    scrubPreviewRate: 0,
  }),
  updateScrub: (time, previewRate) => set((s) => ({
    isScrubbing: s.isScrubbing,
    currentTime: Math.max(0, time),
    playStartTime: Math.max(0, time),
    scrubPreviewRate: Math.max(-4, Math.min(4, previewRate)),
  })),
  endScrub: () => set({
    isScrubbing: false,
    scrubAnchorTime: null,
    scrubResumeOnRelease: false,
    scrubPreviewRate: 0,
  }),
  toggleLoop: () => set((s) => ({ loopEnabled: !s.loopEnabled })),
  setLoopRegion: (start, end) => set(() => {
    const normalizedStart = Math.max(0, Math.min(start, end));
    const normalizedEnd = Math.max(normalizedStart, Math.max(start, end));
    return { loopStart: normalizedStart, loopEnd: normalizedEnd };
  }),
  toggleMetronome: () => set((s) => ({ metronomeEnabled: !s.metronomeEnabled })),
  setMetronomeSound: (sound) => set({ metronomeSound: sound }),
  setMetronomeVolume: (volume) => set({ metronomeVolume: Math.max(0, Math.min(1, volume)) }),
  setPunchIn: (time) => set({ punchInTime: time }),
  setPunchOut: (time) => set({ punchOutTime: time }),
  togglePunch: () => set((s) => ({ punchEnabled: !s.punchEnabled })),
  setPunchRange: (inTime, outTime) => set({ punchInTime: inTime, punchOutTime: outTime, punchEnabled: true }),
  setCountInBars: (bars) => set({ countInBars: Math.max(0, Math.min(4, bars)) }),
  toggleLoopRecording: () =>
    set((s) => {
      const next = !s.loopRecordingEnabled;
      return next
        ? { loopRecordingEnabled: true, loopEnabled: true }
        : { loopRecordingEnabled: false };
    }),
  setLoopCycleCount: (count) => set({ loopCycleCount: count }),
  incrementLoopCycle: () => set((s) => ({ loopCycleCount: s.loopCycleCount + 1 })),
  launchSessionClip: (trackId, clipId, sceneIndex, launchedAt, startOffset) => set((s) => {
    const launchTime = launchedAt ?? s.currentTime;
    const nextLaunch: SessionLaunchState = {
      clipId,
      sceneIndex,
      launchedAt: launchTime,
      ...(startOffset !== undefined ? { startOffset } : {}),
    };
    const nextEvents = s.sessionArrangementRecording
      ? [
          ...s.sessionArrangementRecordEvents.map((event) => (
            event.trackId === trackId && event.endTime === null
              ? { ...event, endTime: launchTime }
              : event
          )),
          { trackId, clipId, sceneIndex, startTime: launchTime, endTime: null },
        ]
      : s.sessionArrangementRecordEvents;

    return {
      launchedSessionClips: {
        ...s.launchedSessionClips,
        [trackId]: nextLaunch,
      },
      sessionArrangementRecordEvents: nextEvents,
    };
  }),
  stopSessionTrack: (trackId, stopTime) => set((s) => {
    if (!s.launchedSessionClips[trackId]) return s;
    const effectiveStopTime = stopTime ?? s.currentTime;
    const { [trackId]: _removed, ...remaining } = s.launchedSessionClips;
    return {
      launchedSessionClips: remaining,
      sessionArrangementRecordEvents: s.sessionArrangementRecording
        ? s.sessionArrangementRecordEvents.map((event) => (
          event.trackId === trackId && event.endTime === null
            ? { ...event, endTime: effectiveStopTime }
            : event
        ))
        : s.sessionArrangementRecordEvents,
    };
  }),
  stopAllSessionClips: (stopTime) => set((s) => {
    const effectiveStopTime = stopTime ?? s.currentTime;
    return {
      launchedSessionClips: {},
      sessionArrangementRecordEvents: s.sessionArrangementRecording
        ? s.sessionArrangementRecordEvents.map((event) => (
          event.endTime === null ? { ...event, endTime: effectiveStopTime } : event
        ))
        : s.sessionArrangementRecordEvents,
    };
  }),
  launchSessionScene: (sceneIndex, clips, launchedAt) => set((s) => {
    const launchTime = launchedAt ?? s.currentTime;
    const nextLaunched = { ...s.launchedSessionClips };
    let nextEvents = s.sessionArrangementRecordEvents;

    for (const { trackId, clipId } of clips) {
      nextLaunched[trackId] = { clipId, sceneIndex, launchedAt: launchTime };
      if (s.sessionArrangementRecording) {
        nextEvents = nextEvents.map((event) => (
          event.trackId === trackId && event.endTime === null
            ? { ...event, endTime: launchTime }
            : event
        ));
        nextEvents = [...nextEvents, { trackId, clipId, sceneIndex, startTime: launchTime, endTime: null }];
      }
    }

    return {
      launchedSessionClips: nextLaunched,
      sessionArrangementRecordEvents: nextEvents,
    };
  }),
  startSessionArrangementRecording: (startTime) => set((s) => ({
    sessionArrangementRecording: true,
    sessionArrangementRecordStartTime: startTime,
    sessionArrangementRecordEvents: [
      ...Object.entries(s.launchedSessionClips).map(([trackId, launch]) => ({
        trackId,
        clipId: launch.clipId,
        sceneIndex: launch.sceneIndex,
        startTime,
        endTime: null,
      })),
    ],
  })),
  stopSessionArrangementRecording: (stopTime) => set((s) => ({
    sessionArrangementRecording: false,
    sessionArrangementRecordStartTime: null,
    sessionArrangementRecordEvents: s.sessionArrangementRecordEvents.map((event) => (
      event.endTime === null ? { ...event, endTime: stopTime } : event
    )),
  })),
}));
