import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { AudioHealthIndicator } from '../AudioHealthIndicator';
import type { AudioHealthSnapshot, AudioHealthStatus } from '../../../types/audioHealth';

function makeSnapshot(overrides: Partial<AudioHealthSnapshot> = {}): AudioHealthSnapshot {
  return {
    contextState: 'running',
    sampleRate: 48000,
    baseLatencyMs: 5.3,
    outputLatencyMs: 2.7,
    totalLatencyMs: 8.0,
    currentTime: 10.5,
    masterLevelDb: -12,
    masterClipping: false,
    estimatedLoad: 0.15,
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('AudioHealthIndicator', () => {
  it('renders a dot indicator', () => {
    render(
      <AudioHealthIndicator
        snapshot={makeSnapshot()}
        status="good"
        onClick={vi.fn()}
      />,
    );
    const indicator = screen.getByTestId('audio-health-indicator');
    expect(indicator).toBeInTheDocument();
  });

  it('shows green dot for "good" status', () => {
    render(
      <AudioHealthIndicator
        snapshot={makeSnapshot()}
        status="good"
        onClick={vi.fn()}
      />,
    );
    const dot = screen.getByTestId('audio-health-dot');
    expect(dot.className).toContain('bg-emerald');
  });

  it('shows yellow dot for "warning" status', () => {
    render(
      <AudioHealthIndicator
        snapshot={makeSnapshot({ masterClipping: true })}
        status="warning"
        onClick={vi.fn()}
      />,
    );
    const dot = screen.getByTestId('audio-health-dot');
    expect(dot.className).toContain('bg-amber');
  });

  it('shows red dot for "error" status', () => {
    render(
      <AudioHealthIndicator
        snapshot={makeSnapshot({ contextState: 'closed' })}
        status="error"
        onClick={vi.fn()}
      />,
    );
    const dot = screen.getByTestId('audio-health-dot');
    expect(dot.className).toContain('bg-red');
  });

  it('shows gray dot for "inactive" status', () => {
    render(
      <AudioHealthIndicator
        snapshot={makeSnapshot({ contextState: 'suspended' })}
        status="inactive"
        onClick={vi.fn()}
      />,
    );
    const dot = screen.getByTestId('audio-health-dot');
    expect(dot.className).toContain('bg-zinc');
  });

  it('displays sample rate', () => {
    render(
      <AudioHealthIndicator
        snapshot={makeSnapshot({ sampleRate: 48000 })}
        status="good"
        onClick={vi.fn()}
      />,
    );
    expect(screen.getByText('48kHz')).toBeInTheDocument();
  });

  it('displays latency when available', () => {
    render(
      <AudioHealthIndicator
        snapshot={makeSnapshot({ totalLatencyMs: 8.0 })}
        status="good"
        onClick={vi.fn()}
      />,
    );
    expect(screen.getByText('8.0ms')).toBeInTheDocument();
  });

  it('shows "—" when latency is unavailable', () => {
    render(
      <AudioHealthIndicator
        snapshot={makeSnapshot({ totalLatencyMs: null })}
        status="good"
        onClick={vi.fn()}
      />,
    );
    expect(screen.getByTestId('audio-health-latency').textContent).toContain('—');
  });

  it('shows nothing when snapshot is null', () => {
    render(
      <AudioHealthIndicator
        snapshot={null}
        status="inactive"
        onClick={vi.fn()}
      />,
    );
    const indicator = screen.getByTestId('audio-health-indicator');
    // Should still render the container but show inactive state
    expect(indicator).toBeInTheDocument();
    const dot = screen.getByTestId('audio-health-dot');
    expect(dot.className).toContain('bg-zinc');
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(
      <AudioHealthIndicator
        snapshot={makeSnapshot()}
        status="good"
        onClick={onClick}
      />,
    );
    fireEvent.click(screen.getByTestId('audio-health-indicator'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('has correct aria-label for accessibility', () => {
    render(
      <AudioHealthIndicator
        snapshot={makeSnapshot()}
        status="good"
        onClick={vi.fn()}
      />,
    );
    const button = screen.getByTestId('audio-health-indicator');
    expect(button).toHaveAttribute('aria-label', expect.stringContaining('Audio engine'));
  });
});
