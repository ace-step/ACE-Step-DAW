import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { StatusBar, _resetLastKnownConnection } from '../../src/components/layout/StatusBar';
import { useGenerationStore } from '../../src/store/generationStore';
import { useProjectStore } from '../../src/store/projectStore';
import { useUIStore } from '../../src/store/uiStore';

const healthCheckMock = vi.fn().mockResolvedValue(false);

vi.mock('../../src/services/aceStepApi', () => ({
  healthCheck: () => healthCheckMock(),
}));

afterEach(() => {
  vi.useRealTimers();
});

describe('StatusBar auto-hide', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    useGenerationStore.setState(useGenerationStore.getInitialState(), true);
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    _resetLastKnownConnection();
  });

  it('renders in expanded mode by default (auto-hide off)', () => {
    render(<StatusBar />);
    const bar = screen.getByTestId('status-bar');
    expect(bar.className).not.toContain('status-bar-collapsed');
  });

  it('collapses when statusBarAutoHide is enabled and mouse is not hovering', () => {
    useUIStore.setState({ statusBarAutoHide: true });
    render(<StatusBar />);
    const bar = screen.getByTestId('status-bar');
    expect(bar.className).toContain('status-bar-collapsed');
  });

  it('expands on mouseenter when auto-hide is enabled', () => {
    useUIStore.setState({ statusBarAutoHide: true });
    render(<StatusBar />);
    const hoverZone = screen.getByTestId('status-bar-hover-zone');
    const bar = screen.getByTestId('status-bar');
    fireEvent.mouseEnter(hoverZone);
    expect(bar.className).not.toContain('status-bar-collapsed');
  });

  it('collapses when the status bar hover zone is left', () => {
    useUIStore.setState({ statusBarAutoHide: true });
    render(<StatusBar />);
    const hoverZone = screen.getByTestId('status-bar-hover-zone');
    const bar = screen.getByTestId('status-bar');

    fireEvent.mouseEnter(hoverZone);
    expect(bar.className).not.toContain('status-bar-collapsed');

    fireEvent.mouseLeave(hoverZone);
    expect(bar.className).toContain('status-bar-collapsed');
  });

  it('keeps the bar expanded while the pointer is inside the hover zone outside proximity', () => {
    useUIStore.setState({ statusBarAutoHide: true });
    render(<StatusBar />);
    const hoverZone = screen.getByTestId('status-bar-hover-zone');
    const bar = screen.getByTestId('status-bar');

    fireEvent.mouseEnter(hoverZone);
    fireEvent.pointerMove(window, { clientY: window.innerHeight - 48 });

    expect(bar.className).not.toContain('status-bar-collapsed');
  });

  it('shows dedicated collapsed row with connection dot', () => {
    useUIStore.setState({ statusBarAutoHide: true });
    render(<StatusBar />);
    const collapsedRow = screen.getByTestId('status-bar-collapsed-row');
    expect(collapsedRow).toBeInTheDocument();
  });

  it('shows save dot in collapsed state when saveStatus is provided', () => {
    useUIStore.setState({ statusBarAutoHide: true });
    render(<StatusBar saveStatus="saved" lastSavedAt={Date.now()} />);
    const saveDot = screen.getByTestId('collapsed-save-dot');
    expect(saveDot).toBeInTheDocument();
  });

  it('does not render hidden interactive controls while collapsed', () => {
    useUIStore.setState({ statusBarAutoHide: true });
    render(<StatusBar saveStatus="saved" lastSavedAt={Date.now()} />);

    expect(screen.queryByTestId('status-bar-meta-row')).not.toBeInTheDocument();
    expect(screen.queryByTestId('status-shortcuts-trigger')).not.toBeInTheDocument();
    expect(screen.queryByTestId('status-zoom-slider')).not.toBeInTheDocument();
    expect(screen.getByTestId('status-bar-collapsed-row')).toBeInTheDocument();
  });

  it('does not render a proximity overlay that can intercept bottom-edge clicks', () => {
    useUIStore.setState({ statusBarAutoHide: true });
    render(<StatusBar />);
    expect(screen.queryByTestId('status-bar-sentinel')).not.toBeInTheDocument();
  });

  it('expands when the pointer moves within the bottom proximity zone', () => {
    useUIStore.setState({ statusBarAutoHide: true });
    render(<StatusBar />);
    fireEvent.pointerMove(window, { clientY: window.innerHeight - 12 });
    const bar = screen.getByTestId('status-bar');
    expect(bar.className).not.toContain('status-bar-collapsed');
  });

  it('collapses after pointer proximity expansion when the pointer moves away', () => {
    useUIStore.setState({ statusBarAutoHide: true });
    render(<StatusBar />);
    const bar = screen.getByTestId('status-bar');

    fireEvent.pointerMove(window, { clientY: window.innerHeight - 12 });
    expect(bar.className).not.toContain('status-bar-collapsed');

    fireEvent.pointerMove(window, { clientY: window.innerHeight - 48 });
    expect(bar.className).toContain('status-bar-collapsed');
  });

  it('does not render sentinel when auto-hide is off', () => {
    render(<StatusBar />);
    expect(screen.queryByTestId('status-bar-sentinel')).not.toBeInTheDocument();
  });

  it('model names have max-width truncation to prevent overflow', () => {
    render(<StatusBar />);
    const modelSection = screen.getByTestId('status-model-name');
    expect(modelSection.className).toContain('truncate');
  });
});

describe('StatusBar overflow prevention', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    useGenerationStore.setState(useGenerationStore.getInitialState(), true);
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    _resetLastKnownConnection();
  });

  it('expanded container does not clip popovers', () => {
    render(<StatusBar />);
    const bar = screen.getByTestId('status-bar');
    expect(bar.className).not.toContain('overflow-hidden');
  });

  it('collapsed container clips to the mini-row', () => {
    useUIStore.setState({ statusBarAutoHide: true });
    render(<StatusBar />);
    const bar = screen.getByTestId('status-bar');
    expect(bar.className).toContain('overflow-hidden');
  });

  it('meta row has min-w-0 to allow flex children to shrink', () => {
    render(<StatusBar />);
    const metaRow = screen.getByTestId('status-bar-meta-row');
    expect(metaRow.className).toContain('min-w-0');
  });
});

describe('StatusBar auto-hide persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('statusBarAutoHide is included in persisted state', () => {
    useUIStore.getState().setStatusBarAutoHide(true);
    expect(useUIStore.getState().statusBarAutoHide).toBe(true);
    let persisted = JSON.parse(localStorage.getItem('ace-step-daw-ui') || '{}');
    expect(persisted.state.statusBarAutoHide).toBe(true);

    useUIStore.getState().setStatusBarAutoHide(false);
    expect(useUIStore.getState().statusBarAutoHide).toBe(false);
    persisted = JSON.parse(localStorage.getItem('ace-step-daw-ui') || '{}');
    expect(persisted.state.statusBarAutoHide).toBe(false);
  });
});
