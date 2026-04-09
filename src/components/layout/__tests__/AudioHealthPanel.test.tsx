import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AudioHealthPanel } from '../AudioHealthPanel';
import type { AudioHealthSnapshot, AudioDeviceInfo } from '../../../types/audioHealth';

function makeSnapshot(overrides: Partial<AudioHealthSnapshot> = {}): AudioHealthSnapshot {
  return {
    contextState: 'running',
    sampleRate: 48000,
    baseLatencyMs: 5.3,
    outputLatencyMs: 2.7,
    totalLatencyMs: 8.0,
    currentTime: 42.5,
    masterLevelDb: -12,
    masterClipping: false,
    estimatedLoad: 0.15,
    timestamp: Date.now(),
    ...overrides,
  };
}

const MOCK_DEVICES: AudioDeviceInfo[] = [
  { deviceId: 'default', label: 'Default - MacBook Pro Speakers', kind: 'audiooutput', isDefault: true },
  { deviceId: 'id1', label: 'Built-in Microphone', kind: 'audioinput', isDefault: false },
  { deviceId: 'id2', label: 'USB Audio Interface', kind: 'audiooutput', isDefault: false },
];

describe('AudioHealthPanel', () => {
  it('renders nothing when not open', () => {
    const { container } = render(
      <AudioHealthPanel
        open={false}
        onClose={vi.fn()}
        snapshot={makeSnapshot()}
        status="good"
        devices={MOCK_DEVICES}
        xrunCount={0}
        recentClipCount={0}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders the panel when open', () => {
    render(
      <AudioHealthPanel
        open={true}
        onClose={vi.fn()}
        snapshot={makeSnapshot()}
        status="good"
        devices={MOCK_DEVICES}
        xrunCount={0}
        recentClipCount={0}
      />,
    );
    expect(screen.getByTestId('audio-health-panel')).toBeInTheDocument();
    expect(screen.getByText('Audio Engine')).toBeInTheDocument();
  });

  it('displays context state', () => {
    render(
      <AudioHealthPanel
        open={true}
        onClose={vi.fn()}
        snapshot={makeSnapshot({ contextState: 'running' })}
        status="good"
        devices={[]}
        xrunCount={0}
        recentClipCount={0}
      />,
    );
    expect(screen.getByText('Running')).toBeInTheDocument();
  });

  it('displays sample rate', () => {
    render(
      <AudioHealthPanel
        open={true}
        onClose={vi.fn()}
        snapshot={makeSnapshot({ sampleRate: 48000 })}
        status="good"
        devices={[]}
        xrunCount={0}
        recentClipCount={0}
      />,
    );
    expect(screen.getByText('48000 Hz')).toBeInTheDocument();
  });

  it('displays latency breakdown', () => {
    render(
      <AudioHealthPanel
        open={true}
        onClose={vi.fn()}
        snapshot={makeSnapshot({ baseLatencyMs: 5.3, outputLatencyMs: 2.7, totalLatencyMs: 8.0 })}
        status="good"
        devices={[]}
        xrunCount={0}
        recentClipCount={0}
      />,
    );
    expect(screen.getByText('5.3 ms')).toBeInTheDocument();
    expect(screen.getByText('2.7 ms')).toBeInTheDocument();
    expect(screen.getByText('8.0 ms')).toBeInTheDocument();
  });

  it('displays xrun count', () => {
    render(
      <AudioHealthPanel
        open={true}
        onClose={vi.fn()}
        snapshot={makeSnapshot()}
        status="warning"
        devices={[]}
        xrunCount={3}
        recentClipCount={0}
      />,
    );
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('displays recent clip count', () => {
    render(
      <AudioHealthPanel
        open={true}
        onClose={vi.fn()}
        snapshot={makeSnapshot()}
        status="warning"
        devices={[]}
        xrunCount={0}
        recentClipCount={5}
      />,
    );
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('lists audio devices', () => {
    render(
      <AudioHealthPanel
        open={true}
        onClose={vi.fn()}
        snapshot={makeSnapshot()}
        status="good"
        devices={MOCK_DEVICES}
        xrunCount={0}
        recentClipCount={0}
      />,
    );
    expect(screen.getByText('Default - MacBook Pro Speakers')).toBeInTheDocument();
    expect(screen.getByText('Built-in Microphone')).toBeInTheDocument();
    expect(screen.getByText('USB Audio Interface')).toBeInTheDocument();
  });

  it('shows empty state for devices when list is empty', () => {
    render(
      <AudioHealthPanel
        open={true}
        onClose={vi.fn()}
        snapshot={makeSnapshot()}
        status="good"
        devices={[]}
        xrunCount={0}
        recentClipCount={0}
      />,
    );
    expect(screen.getByText('No devices detected')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <AudioHealthPanel
        open={true}
        onClose={onClose}
        snapshot={makeSnapshot()}
        status="good"
        devices={[]}
        xrunCount={0}
        recentClipCount={0}
      />,
    );
    fireEvent.click(screen.getByLabelText('Close audio health panel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows placeholder text when snapshot is null', () => {
    render(
      <AudioHealthPanel
        open={true}
        onClose={vi.fn()}
        snapshot={null}
        status="inactive"
        devices={[]}
        xrunCount={0}
        recentClipCount={0}
      />,
    );
    expect(screen.getByText('Audio engine not initialized')).toBeInTheDocument();
  });

  it('separates input and output devices', () => {
    render(
      <AudioHealthPanel
        open={true}
        onClose={vi.fn()}
        snapshot={makeSnapshot()}
        status="good"
        devices={MOCK_DEVICES}
        xrunCount={0}
        recentClipCount={0}
      />,
    );
    expect(screen.getByText('Outputs')).toBeInTheDocument();
    expect(screen.getByText('Inputs')).toBeInTheDocument();
  });
});
