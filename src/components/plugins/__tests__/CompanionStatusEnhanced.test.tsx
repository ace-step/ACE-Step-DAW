import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CompanionStatus } from '../CompanionStatus';
import { useVST3Store } from '../../../store/vst3Store';
import { useUIStore } from '../../../store/uiStore';

vi.mock('../../../hooks/useVST3Connection', () => ({
  _getBridgeClient: () => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    status: 'disconnected',
    isConnected: false,
    companionVersion: null,
  }),
}));

describe('CompanionStatus enhanced states', () => {
  beforeEach(() => {
    useVST3Store.setState({
      connectionStatus: 'disconnected',
      companionVersion: null,
      companionAppStatus: 'unknown',
      connectionError: null,
    });
    useUIStore.setState({ showVST3Panel: false });
  });

  it('shows "Not Installed" when companion app status is not-installed', () => {
    useVST3Store.setState({ companionAppStatus: 'not-installed' });
    render(<CompanionStatus />);
    expect(screen.getByText('Not Installed')).toBeInTheDocument();
  });

  it('shows "Update Available" when companion app status is outdated', () => {
    useVST3Store.setState({
      connectionStatus: 'connected',
      companionAppStatus: 'outdated',
      companionVersion: '0.9.0',
    });
    render(<CompanionStatus />);
    expect(screen.getByText('Update Available')).toBeInTheDocument();
  });

  it('shows download link when not-installed', () => {
    useVST3Store.setState({ companionAppStatus: 'not-installed' });
    render(<CompanionStatus />);
    expect(screen.getByTestId('companion-download-cta')).toBeInTheDocument();
  });

  it('shows connection error message when error exists', () => {
    useVST3Store.setState({
      connectionStatus: 'error',
      connectionError: 'Connection refused',
      companionAppStatus: 'not-installed',
    });
    render(<CompanionStatus />);
    expect(screen.getByTestId('companion-error-msg')).toBeInTheDocument();
  });

  it('shows "Stopped" when companion was previously running but stopped', () => {
    useVST3Store.setState({ companionAppStatus: 'not-running' });
    render(<CompanionStatus />);
    expect(screen.getByText('Stopped')).toBeInTheDocument();
  });
});
