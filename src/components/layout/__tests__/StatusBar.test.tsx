import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

vi.mock('idb-keyval', () => ({
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue(undefined),
  del: vi.fn().mockResolvedValue(undefined),
  keys: vi.fn().mockResolvedValue([]),
}));

vi.mock('tone', () => ({
  getContext: vi.fn(() => ({ rawContext: {} })),
  start: vi.fn(),
  Synth: vi.fn(() => ({ toDestination: vi.fn(), triggerAttackRelease: vi.fn(), dispose: vi.fn() })),
  Transport: { bpm: { value: 120 }, seconds: 0, state: 'stopped', start: vi.fn(), stop: vi.fn(), pause: vi.fn(), position: '0:0:0', schedule: vi.fn(), cancel: vi.fn() },
  Destination: { volume: { value: 0 } },
  context: { rawContext: {}, state: 'running' },
  now: vi.fn(() => 0),
}));

// Mock healthCheck to control connection state
const mockHealthCheck = vi.fn().mockResolvedValue(false);
vi.mock('../../../services/aceStepApi', () => ({
  healthCheck: () => mockHealthCheck(),
}));

import { StatusBar, _resetLastKnownConnection } from '../StatusBar';

describe('StatusBar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetLastKnownConnection();
    mockHealthCheck.mockResolvedValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the status bar', () => {
    render(<StatusBar />);
    expect(screen.getByTestId('status-bar')).toBeInTheDocument();
  });

  it('shows connection status indicator', () => {
    render(<StatusBar />);
    const indicator = screen.getByTestId('status-connection');
    expect(indicator).toBeInTheDocument();
  });

  it('shows "Offline" text when backend is disconnected', () => {
    render(<StatusBar />);
    const indicator = screen.getByTestId('status-connection');
    expect(indicator.textContent).toContain('Offline');
  });

  it('shows "Online" text when backend is connected', async () => {
    mockHealthCheck.mockResolvedValue(true);
    _resetLastKnownConnection();

    render(<StatusBar />);

    // Advance past the initial setTimeout delay (HEALTH_POLL_INTERVAL_MS = 10000ms)
    // Use advanceTimersByTimeAsync to flush the async healthCheck() promise
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_100);
    });

    const indicator = screen.getByTestId('status-connection');
    expect(indicator.textContent).toContain('Online');
  });

  it('shows colored dot matching connection state', () => {
    render(<StatusBar />);
    const indicator = screen.getByTestId('status-connection');
    const dot = indicator.querySelector('[data-testid="connection-dot"]');
    expect(dot).toBeInTheDocument();
  });

  it('renders zoom controls', () => {
    render(<StatusBar />);
    expect(screen.getByTestId('status-zoom-controls')).toBeInTheDocument();
  });

  it('renders keyboard shortcuts button', () => {
    render(<StatusBar />);
    expect(screen.getByTestId('status-shortcuts-trigger')).toBeInTheDocument();
  });
});
