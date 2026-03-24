import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEnhancePlayback } from '../useEnhancePlayback';
import { useTransportStore } from '../../store/transportStore';

// Mock the audio engine
const mockCtx = {
  currentTime: 0,
  state: 'running' as AudioContextState,
  resume: vi.fn().mockResolvedValue(undefined),
  createBufferSource: vi.fn(),
  destination: {},
};

const mockBuffer = {
  duration: 10,
  length: 441000,
  sampleRate: 44100,
  numberOfChannels: 2,
  getChannelData: vi.fn(() => new Float32Array(441000)),
};

const mockSourceNode = {
  buffer: null as unknown,
  connect: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  disconnect: vi.fn(),
  onended: null as null | (() => void),
};

vi.mock('../useAudioEngine', () => ({
  getAudioEngine: () => ({
    ctx: mockCtx,
    decodeAudioData: vi.fn().mockResolvedValue(mockBuffer),
  }),
}));

vi.mock('../../services/audioFileManager', () => ({
  loadAudioBlobByKey: vi.fn().mockResolvedValue(new Blob(['audio'], { type: 'audio/wav' })),
}));

describe('useEnhancePlayback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCtx.createBufferSource.mockReturnValue({ ...mockSourceNode, onended: null });
    mockCtx.currentTime = 0;
    useTransportStore.setState({ isPlaying: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes with null playingId and 0 progress', () => {
    const { result } = renderHook(() => useEnhancePlayback());
    expect(result.current.playingId).toBeNull();
    expect(result.current.progress).toBe(0);
    expect(result.current.duration).toBe(0);
  });

  it('plays audio and sets playingId', async () => {
    const { result } = renderHook(() => useEnhancePlayback());
    await act(async () => {
      await result.current.play('source', 'audio-key-1');
    });
    expect(result.current.playingId).toBe('source');
    expect(result.current.duration).toBe(10);
  });

  it('stops playback and resets state', async () => {
    const { result } = renderHook(() => useEnhancePlayback());
    await act(async () => {
      await result.current.play('source', 'audio-key-1');
    });
    expect(result.current.playingId).toBe('source');

    act(() => {
      result.current.stopPlayback();
    });
    expect(result.current.playingId).toBeNull();
    expect(result.current.progress).toBe(0);
  });

  it('togglePlay stops when same id is already playing', async () => {
    const { result } = renderHook(() => useEnhancePlayback());
    await act(async () => {
      await result.current.play('source', 'audio-key-1');
    });
    expect(result.current.playingId).toBe('source');

    await act(async () => {
      await result.current.togglePlay('source', 'audio-key-1');
    });
    expect(result.current.playingId).toBeNull();
  });

  it('togglePlay plays when different id', async () => {
    const { result } = renderHook(() => useEnhancePlayback());
    await act(async () => {
      await result.current.play('source', 'audio-key-1');
    });

    await act(async () => {
      await result.current.togglePlay('result-1', 'audio-key-2');
    });
    expect(result.current.playingId).toBe('result-1');
  });

  it('stops playback when main transport starts', async () => {
    const { result } = renderHook(() => useEnhancePlayback());
    await act(async () => {
      await result.current.play('source', 'audio-key-1');
    });
    expect(result.current.playingId).toBe('source');

    act(() => {
      useTransportStore.setState({ isPlaying: true });
    });
    expect(result.current.playingId).toBeNull();
  });

  it('seek plays from a given position', async () => {
    const { result } = renderHook(() => useEnhancePlayback());
    await act(async () => {
      await result.current.seek('source', 'audio-key-1', 0.5);
    });
    expect(result.current.playingId).toBe('source');
    expect(result.current.progress).toBe(0.5);
  });
});
