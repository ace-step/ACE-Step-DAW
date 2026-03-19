import { create } from 'zustand';

interface TransportState {
  isPlaying: boolean;
  isRecording: boolean;
  armedTrackIds: string[];
  countInActive: boolean;
  countInBeat: number; // 0 = not counting in, negative = beats remaining
  currentTime: number;
  loopEnabled: boolean;
  loopStart: number;
  loopEnd: number;
  metronomeEnabled: boolean;
  metronomeSound: 'click' | 'woodblock' | 'beep';
  metronomeVolume: number;
  punchInTime: number | null;
  punchOutTime: number | null;
  punchEnabled: boolean;
  loopRecordingEnabled: boolean;
  loopCycleCount: number;

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
  toggleLoop: () => void;
  setLoopRegion: (start: number, end: number) => void;
  toggleMetronome: () => void;
  setMetronomeSound: (sound: 'click' | 'woodblock' | 'beep') => void;
  setMetronomeVolume: (volume: number) => void;
  setPunchIn: (time: number) => void;
  setPunchOut: (time: number) => void;
  togglePunch: () => void;
  toggleLoopRecording: () => void;
  setLoopCycleCount: (count: number) => void;
  incrementLoopCycle: () => void;
}

export const useTransportStore = create<TransportState>((set) => ({
  isPlaying: false,
  isRecording: false,
  armedTrackIds: [],
  countInActive: false,
  countInBeat: 0,
  currentTime: 0,
  loopEnabled: false,
  loopStart: 0,
  loopEnd: 0,
  metronomeEnabled: false,
  metronomeSound: 'click',
  metronomeVolume: 0.5,
  punchInTime: null,
  punchOutTime: null,
  punchEnabled: false,
  loopRecordingEnabled: false,
  loopCycleCount: 0,

  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  stop: () => set({ isPlaying: false, currentTime: 0, loopCycleCount: 0 }),
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
  seek: (time) => set({ currentTime: Math.max(0, time) }),
  setCurrentTime: (time) => set({ currentTime: time }),
  toggleLoop: () => set((s) => ({ loopEnabled: !s.loopEnabled })),
  setLoopRegion: (start, end) => set({ loopStart: start, loopEnd: end }),
  toggleMetronome: () => set((s) => ({ metronomeEnabled: !s.metronomeEnabled })),
  setMetronomeSound: (sound) => set({ metronomeSound: sound }),
  setMetronomeVolume: (volume) => set({ metronomeVolume: Math.max(0, Math.min(1, volume)) }),
  setPunchIn: (time) => set({ punchInTime: time }),
  setPunchOut: (time) => set({ punchOutTime: time }),
  togglePunch: () => set((s) => ({ punchEnabled: !s.punchEnabled })),
  toggleLoopRecording: () => set((s) => ({ loopRecordingEnabled: !s.loopRecordingEnabled })),
  setLoopCycleCount: (count) => set({ loopCycleCount: count }),
  incrementLoopCycle: () => set((s) => ({ loopCycleCount: s.loopCycleCount + 1 })),
}));
