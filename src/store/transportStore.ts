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

  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  stop: () => set({ isPlaying: false, currentTime: 0 }),
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
      // Always disarm when already armed
      return { armedTrackIds: s.armedTrackIds.filter((tid) => tid !== id) };
    }
    // Arm: exclusive by default (Ableton convention), additive with modifier
    return { armedTrackIds: exclusive ? [id] : [...s.armedTrackIds, id] };
  }),
  seek: (time) => set({ currentTime: Math.max(0, time) }),
  setCurrentTime: (time) => set({ currentTime: time }),
  toggleLoop: () => set((s) => ({ loopEnabled: !s.loopEnabled })),
  setLoopRegion: (start, end) => set({ loopStart: start, loopEnd: end }),
  toggleMetronome: () => set((s) => ({ metronomeEnabled: !s.metronomeEnabled })),
  setMetronomeSound: (sound) => set({ metronomeSound: sound }),
  setMetronomeVolume: (volume) => set({ metronomeVolume: Math.max(0, Math.min(1, volume)) }),
}));
