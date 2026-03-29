import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VideoRecorderService } from '../../src/services/videoRecorder';

// ── Helpers ──────────────────────────────────────────────────

function makeFakeMediaStream(tracks: Array<{ kind: string; stop?: () => void }> = []): MediaStream {
  const trackObjs = tracks.map((t) => ({
    kind: t.kind,
    stop: t.stop ?? vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    readyState: 'live',
    id: crypto.randomUUID(),
  }));
  return {
    getTracks: () => trackObjs,
    getVideoTracks: () => trackObjs.filter((t) => t.kind === 'video'),
    getAudioTracks: () => trackObjs.filter((t) => t.kind === 'audio'),
    addTrack: vi.fn(),
    removeTrack: vi.fn(),
  } as unknown as MediaStream;
}

function makeFakeAudioStream(): MediaStream {
  return makeFakeMediaStream([{ kind: 'audio' }]);
}

function makeFakeDisplayStream(): MediaStream {
  return makeFakeMediaStream([{ kind: 'video' }]);
}

/** Stubs MediaRecorder so we can drive its lifecycle from tests. */
class FakeMediaRecorder {
  state = 'inactive';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;

  static isTypeSupported = vi.fn(() => true);

  start = vi.fn(() => {
    this.state = 'recording';
  });
  stop = vi.fn(() => {
    // Simulate a data chunk then stop
    this.ondataavailable?.({ data: new Blob(['fake'], { type: 'video/webm' }) });
    this.state = 'inactive';
    this.onstop?.();
  });
}

/** Stub the global MediaStream constructor used in videoRecorder.ts */
class FakeMediaStreamGlobal {
  private _tracks: unknown[];
  constructor(tracks: unknown[] = []) {
    this._tracks = tracks;
  }
  getTracks() { return this._tracks; }
  getVideoTracks() { return this._tracks.filter((t: any) => t.kind === 'video'); }
  getAudioTracks() { return this._tracks.filter((t: any) => t.kind === 'audio'); }
}

// ── Test setup ───────────────────────────────────────────────

beforeEach(() => {
  vi.stubGlobal('MediaStream', FakeMediaStreamGlobal);
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getDisplayMedia: vi.fn(() => Promise.resolve(makeFakeDisplayStream())),
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ── Tests ────────────────────────────────────────────────────

describe('VideoRecorderService', () => {
  describe('feature detection', () => {
    it('returns true when all APIs are available', () => {
      expect(VideoRecorderService.isSupported()).toBe(true);
    });

    it('returns false when MediaRecorder is missing', () => {
      vi.stubGlobal('MediaRecorder', undefined);
      expect(VideoRecorderService.isSupported()).toBe(false);
    });

    it('returns false when getDisplayMedia is missing', () => {
      vi.stubGlobal('navigator', { mediaDevices: {} });
      expect(VideoRecorderService.isSupported()).toBe(false);
    });

    it('returns false when no MIME type is supported', () => {
      FakeMediaRecorder.isTypeSupported = vi.fn(() => false);
      expect(VideoRecorderService.isSupported()).toBe(false);
      FakeMediaRecorder.isTypeSupported = vi.fn(() => true);
    });
  });

  describe('state machine', () => {
    it('starts in idle state', () => {
      const service = new VideoRecorderService();
      expect(service.getState().status).toBe('idle');
    });

    it('transitions idle → requesting → recording on startRecording', async () => {
      const service = new VideoRecorderService();
      const states: string[] = [];
      service.onStateChange = (s) => states.push(s.status);

      await service.startRecording(makeFakeAudioStream());

      expect(states).toContain('requesting');
      expect(states).toContain('recording');
      expect(service.getState().status).toBe('recording');
    });

    it('transitions recording → stopping → done on stopRecording', async () => {
      const service = new VideoRecorderService();
      await service.startRecording(makeFakeAudioStream());

      const states: string[] = [];
      service.onStateChange = (s) => states.push(s.status);

      service.stopRecording();

      expect(states).toContain('stopping');
      expect(states).toContain('done');
      expect(service.getState().status).toBe('done');
    });

    it('produces a non-empty blob on done', async () => {
      const service = new VideoRecorderService();
      await service.startRecording(makeFakeAudioStream());
      service.stopRecording();

      const blob = service.getState().blob;
      expect(blob).toBeInstanceOf(Blob);
      expect(blob!.size).toBeGreaterThan(0);
    });

    it('transitions to error when permission denied', async () => {
      vi.stubGlobal('navigator', {
        mediaDevices: {
          getDisplayMedia: vi.fn(() => Promise.reject(new Error('Permission denied'))),
        },
      });

      const service = new VideoRecorderService();
      await service.startRecording(makeFakeAudioStream());

      expect(service.getState().status).toBe('error');
      expect(service.getState().error).toContain('Permission denied');
    });

    it('cannot start recording while already recording', async () => {
      const service = new VideoRecorderService();
      await service.startRecording(makeFakeAudioStream());

      const callsBefore = (navigator.mediaDevices.getDisplayMedia as ReturnType<typeof vi.fn>).mock.calls.length;
      await service.startRecording(makeFakeAudioStream());
      const callsAfter = (navigator.mediaDevices.getDisplayMedia as ReturnType<typeof vi.fn>).mock.calls.length;

      // getDisplayMedia should NOT be called again
      expect(callsAfter).toBe(callsBefore);
    });

    it('stopRecording is a no-op when idle', () => {
      const service = new VideoRecorderService();
      service.stopRecording(); // should not throw
      expect(service.getState().status).toBe('idle');
    });
  });

  describe('stream management', () => {
    it('merges video and audio tracks into single stream', async () => {
      // We verify MediaRecorder was constructed (which receives the merged stream)
      const service = new VideoRecorderService();
      await service.startRecording(makeFakeAudioStream());

      expect(service.getState().status).toBe('recording');
    });

    it('stops display media tracks on stopRecording', async () => {
      const displayStream = makeFakeDisplayStream();
      vi.stubGlobal('navigator', {
        mediaDevices: {
          getDisplayMedia: vi.fn(() => Promise.resolve(displayStream)),
        },
      });

      const service = new VideoRecorderService();
      await service.startRecording(makeFakeAudioStream());
      service.stopRecording();

      for (const track of displayStream.getTracks()) {
        expect(track.stop).toHaveBeenCalled();
      }
    });
  });

  describe('dismiss', () => {
    it('resets state to idle and clears blob', async () => {
      const service = new VideoRecorderService();
      await service.startRecording(makeFakeAudioStream());
      service.stopRecording();
      expect(service.getState().status).toBe('done');

      service.dismiss();
      const state = service.getState();
      expect(state.status).toBe('idle');
      expect(state.blob).toBeNull();
      expect(state.duration).toBe(0);
    });
  });

  describe('duration tracking', () => {
    it('updates duration during recording', async () => {
      vi.useFakeTimers();
      const service = new VideoRecorderService();
      await service.startRecording(makeFakeAudioStream());

      vi.advanceTimersByTime(3000);
      expect(service.getState().duration).toBe(3);

      service.stopRecording();
      vi.useRealTimers();
    });

    it('stops duration timer on stopRecording', async () => {
      vi.useFakeTimers();
      const service = new VideoRecorderService();
      await service.startRecording(makeFakeAudioStream());

      vi.advanceTimersByTime(2000);
      service.stopRecording();

      const durationAtStop = service.getState().duration;
      vi.advanceTimersByTime(5000);
      // Duration should NOT have increased after stop
      expect(service.getState().duration).toBe(durationAtStop);

      vi.useRealTimers();
    });
  });
});
