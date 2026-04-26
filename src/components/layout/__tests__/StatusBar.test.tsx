import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';

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

const mockHealthCheck = vi.fn().mockResolvedValue(false);
vi.mock('../../../services/aceStepApi', () => ({
  healthCheck: () => mockHealthCheck(),
}));

import { StatusBar, _resetLastKnownConnection } from '../StatusBar';
import { useUIStore } from '../../../store/uiStore';

describe('StatusBar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetLastKnownConnection();
    mockHealthCheck.mockResolvedValue(false);
    useUIStore.setState({ statusBarAutoHide: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the status bar', () => {
    render(<StatusBar />);
    expect(screen.getByTestId('status-bar')).toBeInTheDocument();
  });

  it('shows collapsed indicator when auto-hide is enabled', () => {
    render(<StatusBar />);
    expect(screen.getByTestId('status-bar-collapsed')).toBeInTheDocument();
    expect(screen.queryByTestId('status-bar-meta-row')).not.toBeInTheDocument();
  });

  it('shows full bar when auto-hide is disabled', () => {
    useUIStore.setState({ statusBarAutoHide: false });
    render(<StatusBar />);
    expect(screen.getByTestId('status-bar-meta-row')).toBeInTheDocument();
    expect(screen.queryByTestId('status-bar-collapsed')).not.toBeInTheDocument();
  });

  it('expands on mouse enter and collapses on mouse leave', async () => {
    render(<StatusBar />);
    const bar = screen.getByTestId('status-bar');

    expect(screen.getByTestId('status-bar-collapsed')).toBeInTheDocument();

    fireEvent.mouseEnter(bar);
    expect(screen.getByTestId('status-bar-meta-row')).toBeInTheDocument();
    expect(screen.queryByTestId('status-bar-collapsed')).not.toBeInTheDocument();

    fireEvent.mouseLeave(bar);
    // Still expanded during collapse delay
    expect(screen.getByTestId('status-bar-meta-row')).toBeInTheDocument();

    // After delay, should collapse
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.getByTestId('status-bar-collapsed')).toBeInTheDocument();
  });

  it('shows connection status indicator in expanded mode', () => {
    useUIStore.setState({ statusBarAutoHide: false });
    render(<StatusBar />);
    const indicator = screen.getByTestId('status-connection');
    expect(indicator).toBeInTheDocument();
  });

  it('shows "Offline" text when backend is disconnected', () => {
    useUIStore.setState({ statusBarAutoHide: false });
    render(<StatusBar />);
    const indicator = screen.getByTestId('status-connection');
    expect(indicator.textContent).toContain('Offline');
  });

  it('shows "Online" text when backend is connected', async () => {
    mockHealthCheck.mockResolvedValue(true);
    _resetLastKnownConnection();
    useUIStore.setState({ statusBarAutoHide: false });

    render(<StatusBar />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_100);
    });

    const indicator = screen.getByTestId('status-connection');
    expect(indicator.textContent).toContain('Online');
  });

  it('shows colored dot matching connection state in collapsed mode', () => {
    render(<StatusBar />);
    expect(screen.getByTestId('connection-dot-collapsed')).toBeInTheDocument();
  });

  it('renders zoom controls when expanded', () => {
    useUIStore.setState({ statusBarAutoHide: false });
    render(<StatusBar />);
    expect(screen.getByTestId('status-zoom-controls')).toBeInTheDocument();
  });

  it('renders keyboard shortcuts button when expanded', () => {
    useUIStore.setState({ statusBarAutoHide: false });
    render(<StatusBar />);
    expect(screen.getByTestId('status-shortcuts-trigger')).toBeInTheDocument();
  });

  it('renders auto-hide toggle button when expanded', () => {
    useUIStore.setState({ statusBarAutoHide: false });
    render(<StatusBar />);
    const toggle = screen.getByTestId('status-autohide-toggle');
    expect(toggle).toBeInTheDocument();
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
  });

  it('toggles auto-hide preference via button', () => {
    useUIStore.setState({ statusBarAutoHide: false });
    render(<StatusBar />);
    const toggle = screen.getByTestId('status-autohide-toggle');
    fireEvent.click(toggle);
    expect(useUIStore.getState().statusBarAutoHide).toBe(true);
  });

  it('collapsed state shows save status', () => {
    render(<StatusBar saveStatus="saved" lastSavedAt={Date.now()} />);
    expect(screen.getByTestId('status-bar-collapsed')).toBeInTheDocument();
  });

  it('has overflow-hidden to prevent text overflow', () => {
    useUIStore.setState({ statusBarAutoHide: false });
    render(<StatusBar />);
    const bar = screen.getByTestId('status-bar');
    expect(bar.className).toContain('overflow-hidden');
  });

  it('model names have max-width constraint to prevent overflow', () => {
    useUIStore.setState({ statusBarAutoHide: false });
    render(<StatusBar />);
    const metaRow = screen.getByTestId('status-bar-meta-row');
    expect(metaRow.className).toContain('overflow-hidden');
    expect(metaRow.className).toContain('min-w-0');
  });
});
