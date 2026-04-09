import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PerformanceMeter } from '../PerformanceMeter';
import { usePerformanceStore } from '../../../store/performanceStore';

describe('PerformanceMeter', () => {
  beforeEach(() => {
    usePerformanceStore.getState().reset();
  });

  it('renders with data-testid', () => {
    render(<PerformanceMeter />);
    expect(screen.getByTestId('performance-meter')).toBeDefined();
  });

  it('shows CPU percentage text', () => {
    render(<PerformanceMeter />);
    expect(screen.getByTestId('performance-meter').textContent).toContain('0%');
  });

  it('reflects updated CPU load from store', () => {
    usePerformanceStore.getState().updateMetrics({
      cpuLoad: 75,
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

    render(<PerformanceMeter />);
    expect(screen.getByTestId('performance-meter').textContent).toContain('75%');
  });

  it('applies green color class for low CPU load', () => {
    render(<PerformanceMeter />);
    const meter = screen.getByTestId('cpu-bar');
    expect(meter.className).toContain('bg-emerald');
  });

  it('applies yellow color class for medium CPU load', () => {
    usePerformanceStore.getState().updateMetrics({
      cpuLoad: 60,
      fps: 60,
      dropoutCount: 0,
      dropoutDetected: false,
      audioContextState: 'running',
      baseLatencyMs: 5,
      outputLatencyMs: 10,
      sampleRate: 44100,
      activeNodeCount: 10,
      activeEffectCount: 5,
      heapUsedMb: -1,
      heapLimitMb: -1,
    });

    render(<PerformanceMeter />);
    const meter = screen.getByTestId('cpu-bar');
    expect(meter.className).toContain('bg-amber');
  });

  it('applies red color class for high CPU load', () => {
    usePerformanceStore.getState().updateMetrics({
      cpuLoad: 90,
      fps: 30,
      dropoutCount: 3,
      dropoutDetected: true,
      audioContextState: 'running',
      baseLatencyMs: 5,
      outputLatencyMs: 10,
      sampleRate: 44100,
      activeNodeCount: 30,
      activeEffectCount: 15,
      heapUsedMb: 200,
      heapLimitMb: 512,
    });

    render(<PerformanceMeter />);
    const meter = screen.getByTestId('cpu-bar');
    expect(meter.className).toContain('bg-red');
  });

  it('shows dropout indicator when dropout detected', () => {
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

    render(<PerformanceMeter />);
    expect(screen.getByTestId('dropout-indicator')).toBeDefined();
  });

  it('does not show dropout indicator when no dropout', () => {
    render(<PerformanceMeter />);
    expect(screen.queryByTestId('dropout-indicator')).toBeNull();
  });

  it('shows tooltip content on hover', () => {
    usePerformanceStore.getState().updateMetrics({
      cpuLoad: 45,
      fps: 58,
      dropoutCount: 0,
      dropoutDetected: false,
      audioContextState: 'running',
      baseLatencyMs: 5.8,
      outputLatencyMs: 10.2,
      sampleRate: 48000,
      activeNodeCount: 15,
      activeEffectCount: 8,
      heapUsedMb: 128.5,
      heapLimitMb: 512,
    });

    render(<PerformanceMeter />);
    const meter = screen.getByTestId('performance-meter');
    fireEvent.mouseEnter(meter);
    expect(screen.getByTestId('performance-tooltip')).toBeDefined();
  });

  it('hides tooltip when mouse leaves', () => {
    render(<PerformanceMeter />);
    const meter = screen.getByTestId('performance-meter');
    fireEvent.mouseEnter(meter);
    fireEvent.mouseLeave(meter);
    expect(screen.queryByTestId('performance-tooltip')).toBeNull();
  });

  it('has appropriate aria-label', () => {
    render(<PerformanceMeter />);
    const meter = screen.getByTestId('performance-meter');
    expect(meter.getAttribute('aria-label')).toContain('CPU');
  });
});
