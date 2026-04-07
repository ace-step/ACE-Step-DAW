import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CompanionStatus } from '../CompanionStatus';
import { useVST3Store } from '../../../store/vst3Store';
import { useUIStore } from '../../../store/uiStore';

// Mock the bridge client singleton (still needed by store's connect/disconnect)
const mockConnect = vi.fn();
const mockDisconnect = vi.fn();

vi.mock('../../../hooks/useVST3Connection', () => ({
  _getBridgeClient: () => ({
    connect: mockConnect,
    disconnect: mockDisconnect,
    status: 'disconnected',
    isConnected: false,
    companionVersion: null,
  }),
}));

describe('CompanionStatus', () => {
  beforeEach(() => {
    mockConnect.mockClear();
    mockDisconnect.mockClear();
    useVST3Store.setState({
      connectionStatus: 'disconnected',
      companionVersion: null,
      companionAppStatus: 'unknown',
    });
    useUIStore.setState({ showVST3Panel: false });
  });

  it('renders "Disconnected" when disconnected', () => {
    render(<CompanionStatus />);
    expect(screen.getByText('Disconnected')).toBeInTheDocument();
    expect(screen.getByTestId('companion-status-dot')).toHaveClass('bg-red-500');
  });

  it('renders "Connecting..." when connecting', () => {
    useVST3Store.setState({ connectionStatus: 'connecting' });
    render(<CompanionStatus />);
    expect(screen.getByText('Connecting...')).toBeInTheDocument();
    expect(screen.getByTestId('companion-status-dot')).toHaveClass('bg-amber-400');
  });

  it('renders "Connected" when connected', () => {
    useVST3Store.setState({ connectionStatus: 'connected' });
    render(<CompanionStatus />);
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getByTestId('companion-status-dot')).toHaveClass('bg-emerald-500');
  });

  it('calls store connect when clicked while disconnected', () => {
    render(<CompanionStatus />);
    fireEvent.click(screen.getByTestId('companion-status'));
    // Store's connect() sets status to 'connecting' and calls bridge
    expect(useVST3Store.getState().connectionStatus).toBe('connecting');
    expect(mockConnect).toHaveBeenCalledOnce();
  });

  it('toggles VST3 panel when clicked while connected', () => {
    useVST3Store.setState({ connectionStatus: 'connected' });
    render(<CompanionStatus />);
    fireEvent.click(screen.getByTestId('companion-status'));
    expect(useUIStore.getState().showVST3Panel).toBe(true);
  });

  it('closes VST3 panel when clicked again while connected', () => {
    useVST3Store.setState({ connectionStatus: 'connected' });
    useUIStore.setState({ showVST3Panel: true });
    render(<CompanionStatus />);
    fireEvent.click(screen.getByTestId('companion-status'));
    expect(useUIStore.getState().showVST3Panel).toBe(false);
  });

  it('disconnects on right-click when connected', () => {
    useVST3Store.setState({ connectionStatus: 'connected' });
    render(<CompanionStatus />);
    fireEvent.contextMenu(screen.getByTestId('companion-status'));
    // Store's disconnect() sets status and calls bridge
    expect(useVST3Store.getState().connectionStatus).toBe('disconnected');
    expect(mockDisconnect).toHaveBeenCalledOnce();
  });

  it('shows companion version in tooltip when available', () => {
    useVST3Store.setState({ connectionStatus: 'connected', companionVersion: '1.2.3' });
    render(<CompanionStatus />);
    expect(screen.getByTestId('companion-status')).toHaveAttribute('title', 'VST3 Companion v1.2.3');
  });

  it('highlights button when panel is open', () => {
    useVST3Store.setState({ connectionStatus: 'connected' });
    useUIStore.setState({ showVST3Panel: true });
    render(<CompanionStatus />);
    expect(screen.getByTestId('companion-status')).toHaveClass('bg-white/10');
  });
});
