import { describe, it, expect, beforeEach } from 'vitest';
import { usePerformanceStore } from '../performanceStore';

describe('performanceStore', () => {
  beforeEach(() => {
    usePerformanceStore.getState().reset();
  });

  it('starts with default metrics', () => {
    const state = usePerformanceStore.getState();
    expect(state.cpuLoad).toBe(0);
    expect(state.fps).toBe(0);
    expect(state.dropoutCount).toBe(0);
    expect(state.dropoutDetected).toBe(false);
    expect(state.audioContextState).toBe('suspended');
    expect(state.sampleRate).toBe(0);
    expect(state.activeNodeCount).toBe(0);
    expect(state.activeEffectCount).toBe(0);
  });

  it('updates metrics via updateMetrics()', () => {
    usePerformanceStore.getState().updateMetrics({
      cpuLoad: 45,
      fps: 59.5,
      dropoutCount: 2,
      dropoutDetected: true,
      audioContextState: 'running',
      baseLatencyMs: 5.8,
      outputLatencyMs: 10.2,
      sampleRate: 48000,
      activeNodeCount: 15,
      activeEffectCount: 8,
      heapUsedMb: 128.5,
      heapLimitMb: 512,
    });

    const state = usePerformanceStore.getState();
    expect(state.cpuLoad).toBe(45);
    expect(state.fps).toBe(59.5);
    expect(state.dropoutCount).toBe(2);
    expect(state.dropoutDetected).toBe(true);
    expect(state.audioContextState).toBe('running');
    expect(state.baseLatencyMs).toBeCloseTo(5.8);
    expect(state.outputLatencyMs).toBeCloseTo(10.2);
    expect(state.sampleRate).toBe(48000);
    expect(state.activeNodeCount).toBe(15);
    expect(state.activeEffectCount).toBe(8);
    expect(state.heapUsedMb).toBe(128.5);
    expect(state.heapLimitMb).toBe(512);
  });

  it('supports partial updates without losing other fields', () => {
    usePerformanceStore.getState().updateMetrics({
      cpuLoad: 30,
      fps: 60,
      dropoutCount: 0,
      dropoutDetected: false,
      audioContextState: 'running',
      baseLatencyMs: 5,
      outputLatencyMs: 10,
      sampleRate: 44100,
      activeNodeCount: 10,
      activeEffectCount: 5,
      heapUsedMb: 100,
      heapLimitMb: 512,
    });

    // Update only some fields
    usePerformanceStore.getState().updateMetrics({
      cpuLoad: 65,
      fps: 45,
      dropoutCount: 1,
      dropoutDetected: true,
      audioContextState: 'running',
      baseLatencyMs: 5,
      outputLatencyMs: 10,
      sampleRate: 44100,
      activeNodeCount: 20,
      activeEffectCount: 12,
      heapUsedMb: 150,
      heapLimitMb: 512,
    });

    const state = usePerformanceStore.getState();
    expect(state.cpuLoad).toBe(65);
    expect(state.fps).toBe(45);
    expect(state.sampleRate).toBe(44100);
  });

  it('acknowledges dropout via acknowledgeDropout()', () => {
    usePerformanceStore.getState().updateMetrics({
      cpuLoad: 0,
      fps: 60,
      dropoutCount: 1,
      dropoutDetected: true,
      audioContextState: 'running',
      baseLatencyMs: 0,
      outputLatencyMs: 0,
      sampleRate: 44100,
      activeNodeCount: 0,
      activeEffectCount: 0,
      heapUsedMb: -1,
      heapLimitMb: -1,
    });
    expect(usePerformanceStore.getState().dropoutDetected).toBe(true);

    usePerformanceStore.getState().acknowledgeDropout();
    expect(usePerformanceStore.getState().dropoutDetected).toBe(false);
  });

  it('resets all state via reset()', () => {
    usePerformanceStore.getState().updateMetrics({
      cpuLoad: 80,
      fps: 30,
      dropoutCount: 5,
      dropoutDetected: true,
      audioContextState: 'running',
      baseLatencyMs: 10,
      outputLatencyMs: 20,
      sampleRate: 48000,
      activeNodeCount: 30,
      activeEffectCount: 15,
      heapUsedMb: 200,
      heapLimitMb: 512,
    });

    usePerformanceStore.getState().reset();
    const state = usePerformanceStore.getState();
    expect(state.cpuLoad).toBe(0);
    expect(state.fps).toBe(0);
    expect(state.dropoutCount).toBe(0);
    expect(state.dropoutDetected).toBe(false);
    expect(state.audioContextState).toBe('suspended');
    expect(state.sampleRate).toBe(0);
  });
});
