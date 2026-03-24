import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CompanionStatus } from '../CompanionStatus';
import { useVST3Store } from '../../../store/vst3Store';

describe('CompanionStatus', () => {
  beforeEach(() => {
    useVST3Store.setState({
      connectionStatus: 'disconnected',
      companionVersion: null,
    });
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

  it('calls connect when clicked while disconnected', () => {
    render(<CompanionStatus />);
    fireEvent.click(screen.getByTestId('companion-status'));
    expect(useVST3Store.getState().connectionStatus).toBe('connecting');
  });

  it('calls disconnect when clicked while connected', () => {
    useVST3Store.setState({ connectionStatus: 'connected' });
    render(<CompanionStatus />);
    fireEvent.click(screen.getByTestId('companion-status'));
    expect(useVST3Store.getState().connectionStatus).toBe('disconnected');
  });

  it('shows companion version in tooltip when available', () => {
    useVST3Store.setState({ connectionStatus: 'connected', companionVersion: '1.2.3' });
    render(<CompanionStatus />);
    expect(screen.getByTestId('companion-status')).toHaveAttribute('title', 'VST3 Companion v1.2.3');
  });
});
