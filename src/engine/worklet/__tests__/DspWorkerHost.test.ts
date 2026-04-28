import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DspWorkerHost, type DspWorkerHostOptions } from '../DspWorkerHost';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

class MockWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  messages: unknown[] = [];
  terminated = false;

  postMessage(data: unknown): void {
    this.messages.push(data);
  }

  terminate(): void {
    this.terminated = true;
  }

  // Simulate a message from the worker
  simulateMessage(data: unknown): void {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data }));
    }
  }
}

let mockWorkerInstance: MockWorker;

vi.stubGlobal('Worker', class {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;

  constructor() {
    mockWorkerInstance = new MockWorker();
    // Proxy properties
    return new Proxy(this, {
      get: (target, prop) => {
        if (prop === 'onmessage') return mockWorkerInstance.onmessage;
        if (prop === 'onerror') return mockWorkerInstance.onerror;
        return (mockWorkerInstance as Record<string, unknown>)[prop as string];
      },
      set: (target, prop, value) => {
        (mockWorkerInstance as Record<string, unknown>)[prop as string] = value;
        return true;
      },
    });
  }
});

function createMockCtx(): AudioContext {
  return {
    sampleRate: 44100,
  } as unknown as AudioContext;
}

describe('DspWorkerHost', () => {
  let host: DspWorkerHost;

  beforeEach(() => {
    host = new DspWorkerHost({
      context: createMockCtx(),
      channels: 2,
      bufferSize: 4096,
      paramCount: 128,
    });
  });

  it('starts in idle state', () => {
    expect(host.state).toBe('idle');
  });

  it('initialize transitions to initializing then ready', async () => {
    const states: string[] = [];
    host.onStateChange(s => states.push(s));

    const initPromise = host.initialize();

    // Wait a tick for worker to be created
    await new Promise(r => setTimeout(r, 10));

    // Simulate ready message from worker
    mockWorkerInstance.simulateMessage({ type: 'ready' });

    const result = await initPromise;
    expect(result).toBe(true);
    expect(host.state).toBe('ready');
    expect(states).toContain('initializing');
  });

  it('sends init command to worker on initialize', async () => {
    const initPromise = host.initialize();
    await new Promise(r => setTimeout(r, 10));
    mockWorkerInstance.simulateMessage({ type: 'ready' });
    await initPromise;

    expect(mockWorkerInstance.messages.length).toBeGreaterThan(0);
    const initCmd = mockWorkerInstance.messages[0] as { type: string };
    expect(initCmd.type).toBe('init');
  });

  it('allocates shared buffers on initialize', async () => {
    const initPromise = host.initialize();
    await new Promise(r => setTimeout(r, 10));
    mockWorkerInstance.simulateMessage({ type: 'ready' });
    await initPromise;

    expect(host.audioBuffer).not.toBeNull();
    expect(host.paramBuffer).not.toBeNull();
  });

  it('play sends play command', async () => {
    const initPromise = host.initialize();
    await new Promise(r => setTimeout(r, 10));
    mockWorkerInstance.simulateMessage({ type: 'ready' });
    await initPromise;

    host.play(0, 120);
    expect(host.state).toBe('playing');

    const playCmd = mockWorkerInstance.messages.find(
      (m: unknown) => (m as { type: string }).type === 'play',
    ) as { type: string; fromSample: number; bpm: number };
    expect(playCmd).toBeDefined();
    expect(playCmd.fromSample).toBe(0);
    expect(playCmd.bpm).toBe(120);
  });

  it('stop sends stop command', async () => {
    const initPromise = host.initialize();
    await new Promise(r => setTimeout(r, 10));
    mockWorkerInstance.simulateMessage({ type: 'ready' });
    await initPromise;

    host.play();
    host.stop();
    expect(host.state).toBe('stopped');
  });

  it('seek updates position', async () => {
    const initPromise = host.initialize();
    await new Promise(r => setTimeout(r, 10));
    mockWorkerInstance.simulateMessage({ type: 'ready' });
    await initPromise;

    host.seek(44100);
    expect(host.position).toBe(44100);
  });

  it('setParam writes to param buffer', async () => {
    const initPromise = host.initialize();
    await new Promise(r => setTimeout(r, 10));
    mockWorkerInstance.simulateMessage({ type: 'ready' });
    await initPromise;

    // Should not throw
    expect(() => host.setParam(0, 0.5)).not.toThrow();
  });

  it('addTrack sends command', async () => {
    const initPromise = host.initialize();
    await new Promise(r => setTimeout(r, 10));
    mockWorkerInstance.simulateMessage({ type: 'ready' });
    await initPromise;

    host.addTrack('track-1', [
      { type: 'compressor', params: { threshold: -20, ratio: 4 } },
      { type: 'reverb', params: { decay: 2, wet: 0.3 } },
    ]);

    const cmd = mockWorkerInstance.messages.find(
      (m: unknown) => (m as { type: string }).type === 'add-track',
    ) as { type: string; trackId: string };
    expect(cmd).toBeDefined();
    expect(cmd.trackId).toBe('track-1');
  });

  it('noteOn sends command', async () => {
    const initPromise = host.initialize();
    await new Promise(r => setTimeout(r, 10));
    mockWorkerInstance.simulateMessage({ type: 'ready' });
    await initPromise;

    host.noteOn('track-1', 60, 0.8, 0);

    const cmd = mockWorkerInstance.messages.find(
      (m: unknown) => (m as { type: string }).type === 'note-on',
    );
    expect(cmd).toBeDefined();
  });

  it('handles position messages from worker', async () => {
    const initPromise = host.initialize();
    await new Promise(r => setTimeout(r, 10));
    mockWorkerInstance.simulateMessage({ type: 'ready' });
    await initPromise;

    mockWorkerInstance.simulateMessage({ type: 'position', sample: 22050 });
    expect(host.position).toBe(22050);
  });

  it('handles cpu messages from worker', async () => {
    const cpuCb = vi.fn();
    host.onCpu(cpuCb);

    const initPromise = host.initialize();
    await new Promise(r => setTimeout(r, 10));
    mockWorkerInstance.simulateMessage({ type: 'ready' });
    await initPromise;

    mockWorkerInstance.simulateMessage({ type: 'cpu', usage: 0.3, renderTimeMs: 1.5 });
    expect(cpuCb).toHaveBeenCalledWith({ type: 'cpu', usage: 0.3, renderTimeMs: 1.5 });
  });

  it('handles error messages from worker', async () => {
    const errCb = vi.fn();
    host.onError(errCb);

    const initPromise = host.initialize();
    await new Promise(r => setTimeout(r, 10));
    mockWorkerInstance.simulateMessage({ type: 'ready' });
    await initPromise;

    mockWorkerInstance.simulateMessage({ type: 'error', message: 'test error' });
    expect(errCb).toHaveBeenCalledWith('test error');
    expect(host.state).toBe('error');
  });

  it('dispose terminates worker', async () => {
    const initPromise = host.initialize();
    await new Promise(r => setTimeout(r, 10));
    mockWorkerInstance.simulateMessage({ type: 'ready' });
    await initPromise;

    host.dispose();
    expect(mockWorkerInstance.terminated).toBe(true);
    expect(host.state).toBe('idle');
    expect(host.audioBuffer).toBeNull();
    expect(host.paramBuffer).toBeNull();
  });

  it('play does nothing if not ready', () => {
    host.play();
    expect(host.state).toBe('idle'); // unchanged
  });

  it('stop does nothing if not playing', async () => {
    const initPromise = host.initialize();
    await new Promise(r => setTimeout(r, 10));
    mockWorkerInstance.simulateMessage({ type: 'ready' });
    await initPromise;

    host.stop();
    expect(host.state).toBe('ready'); // unchanged
  });
});
