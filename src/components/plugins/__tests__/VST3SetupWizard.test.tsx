import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VST3SetupWizard } from '../VST3SetupWizard';
import { useVST3Store } from '../../../store/vst3Store';

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

describe('VST3SetupWizard', () => {
  beforeEach(() => {
    mockConnect.mockClear();
    localStorage.clear();
    useVST3Store.setState({
      connectionStatus: 'disconnected',
      companionAppStatus: 'unknown',
      setupWizardDismissed: false,
      companionVersion: null,
      connectionError: null,
    });
  });

  it('renders the setup wizard when not dismissed', () => {
    render(<VST3SetupWizard />);
    expect(screen.getByTestId('vst3-setup-wizard')).toBeInTheDocument();
  });

  it('does not render when wizard is dismissed', () => {
    useVST3Store.setState({ setupWizardDismissed: true });
    render(<VST3SetupWizard />);
    expect(screen.queryByTestId('vst3-setup-wizard')).not.toBeInTheDocument();
  });

  it('does not render when companion is connected', () => {
    useVST3Store.setState({
      connectionStatus: 'connected',
      companionAppStatus: 'running',
    });
    render(<VST3SetupWizard />);
    expect(screen.queryByTestId('vst3-setup-wizard')).not.toBeInTheDocument();
  });

  it('shows step 1: download companion', () => {
    render(<VST3SetupWizard />);
    expect(screen.getByTestId('wizard-step-download')).toBeInTheDocument();
    expect(screen.getByText('Download Companion App')).toBeInTheDocument();
  });

  it('shows platform download buttons', () => {
    render(<VST3SetupWizard />);
    expect(screen.getByTestId('download-windows')).toBeInTheDocument();
    expect(screen.getByTestId('download-macos')).toBeInTheDocument();
    expect(screen.getByTestId('download-linux')).toBeInTheDocument();
  });

  it('shows step 2: connect', () => {
    render(<VST3SetupWizard />);
    expect(screen.getByTestId('wizard-step-connect')).toBeInTheDocument();
  });

  it('connect button triggers store connect action', () => {
    render(<VST3SetupWizard />);
    fireEvent.click(screen.getByTestId('wizard-connect-btn'));
    // Store's connect() sets status to 'connecting' and calls bridge
    expect(useVST3Store.getState().connectionStatus).toBe('connecting');
    expect(mockConnect).toHaveBeenCalledOnce();
  });

  it('dismiss button hides wizard and persists', () => {
    render(<VST3SetupWizard />);
    fireEvent.click(screen.getByTestId('wizard-dismiss-btn'));
    expect(useVST3Store.getState().setupWizardDismissed).toBe(true);
  });

  it('shows connection success when connected after wizard opened', () => {
    const { rerender } = render(<VST3SetupWizard />);
    useVST3Store.setState({
      connectionStatus: 'connected',
      companionAppStatus: 'running',
      companionVersion: '1.0.0',
    });
    rerender(<VST3SetupWizard />);
    expect(screen.queryByTestId('vst3-setup-wizard')).not.toBeInTheDocument();
  });

  it('shows error state when connection fails', () => {
    useVST3Store.setState({
      connectionStatus: 'error',
      companionAppStatus: 'not-installed',
      connectionError: 'Connection refused',
    });
    render(<VST3SetupWizard />);
    expect(screen.getByTestId('wizard-error')).toBeInTheDocument();
  });
});
