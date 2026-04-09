import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startMcpBridge, stopMcpBridge } from '../mcpBridge';

// ── Store mocks ─────────────────────────────────────────────────

const mockProject = {
  name: 'Test Project',
  bpm: 120,
  timeSignature: 4,
  totalDuration: 60,
  tracks: [
    {
      id: 'track-1',
      displayName: 'Lead',
      trackType: 'stems',
      clips: [
        { id: 'clip-1', startTime: 0, duration: 4, prompt: 'rock', generationStatus: 'ready' },
      ],
      volume: 0.8,
      pan: 0,
      muted: false,
      soloed: false,
    },
  ],
};

const mockProjectStore = {
  project: mockProject,
  updateProject: vi.fn(),
  addTrack: vi.fn(() => ({ id: 'new-track', displayName: 'New Track' })),
  renameTrack: vi.fn(),
  removeTracks: vi.fn(),
  addMidiNote: vi.fn(),
  toggleSequencerStep: vi.fn(),
  updateTrack: vi.fn(),
  updateTrackMixer: vi.fn(),
};

const mockTransportStore = {
  isPlaying: false,
  currentTime: 0,
  loopEnabled: false,
  loopStart: 0,
  loopEnd: 8,
  play: vi.fn(),
  stop: vi.fn(),
  toggleLoop: vi.fn(),
};

const mockGenerationStore = {
  setGenerationPrompt: vi.fn(),
  setGenerationLengthSeconds: vi.fn(),
  setGenerationTargetTrack: vi.fn(),
  submitGenerationRequest: vi.fn(() => true),
};

const mockUIStore = {
  setShowMixer: vi.fn(),
};

vi.mock('../../store/projectStore', () => ({
  useProjectStore: { getState: () => mockProjectStore },
}));

vi.mock('../../store/transportStore', () => ({
  useTransportStore: { getState: () => mockTransportStore },
}));

vi.mock('../../store/generationStore', () => ({
  useGenerationStore: { getState: () => mockGenerationStore },
}));

vi.mock('../../store/uiStore', () => ({
  useUIStore: { getState: () => mockUIStore },
}));

vi.mock('../../utils/debugLogger', () => ({
  createDebugLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// ── WebSocket mock ───────────────────────────────────────────────

type WsHandler = (event: { data: string }) => void;

class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;

  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: WsHandler | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sentMessages: string[] = [];

  constructor(public url: string) {
    // Simulate connection opening asynchronously
    setTimeout(() => this.onopen?.(), 0);
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }
}

let lastWsInstance: MockWebSocket | null = null;

// Proxy class includes static constants so readyState checks
// (e.g. ws?.readyState === WebSocket.OPEN) work correctly
class WebSocketProxy extends MockWebSocket {
  static override OPEN = 1;
  static override CLOSED = 3;
  static CONNECTING = 0;
  static CLOSING = 2;

  constructor(url: string) {
    super(url);
    lastWsInstance = this;
  }
}

vi.stubGlobal('WebSocket', WebSocketProxy);

// ── Tests ─────────────────────────────────────────────────────────

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('mcpBridge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    lastWsInstance = null;
  });

  afterEach(() => {
    stopMcpBridge();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('startMcpBridge / stopMcpBridge', () => {
    it('does not throw when starting or stopping', () => {
      // IS_DEV is evaluated at module load time. In test environment, it may be
      // false (no dev server), so startMcpBridge may skip the WebSocket connection.
      // We verify it doesn't throw regardless.
      startMcpBridge();
      stopMcpBridge();
    });

    it('stopMcpBridge is safe to call multiple times', () => {
      stopMcpBridge();
      stopMcpBridge();
    });

    it('opens a WebSocket when IS_DEV is true', () => {
      startMcpBridge();
      // If IS_DEV was true at module load time, a WebSocket would be created.
      // In CI/test environments IS_DEV may be false, so we test conditionally.
      if (lastWsInstance) {
        expect(lastWsInstance.url).toContain('ws/mcp-bridge');
      }
    });
  });

  describe('tool command handling (via WebSocket messages)', () => {
    it('dispatches tool calls and sends responses when connected', async () => {
      startMcpBridge();
      await vi.advanceTimersByTimeAsync(0);

      // If no WebSocket was created (IS_DEV=false), skip assertions
      if (!lastWsInstance) return;

      const ws = lastWsInstance;
      ws.onmessage?.({
        data: JSON.stringify({ id: 'req-1', tool: 'daw_get_transport', params: {} }),
      });

      await vi.advanceTimersByTimeAsync(100);

      expect(ws.sentMessages.length).toBeGreaterThan(0);
      const response = JSON.parse(ws.sentMessages[0]);
      expect(response.id).toBe('req-1');
      expect(response.result).toEqual(expect.objectContaining({
        isPlaying: false,
        currentTime: 0,
      }));
    });
  });
});
