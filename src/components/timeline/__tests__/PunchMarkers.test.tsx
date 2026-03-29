import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PunchMarkers } from '../PunchMarkers';
import { useTransportStore } from '../../../store/transportStore';
import { useUIStore } from '../../../store/uiStore';

describe('PunchMarkers', () => {
  beforeEach(() => {
    useTransportStore.setState({
      punchInTime: null,
      punchOutTime: null,
      punchEnabled: false,
    });
    useUIStore.setState({ pixelsPerSecond: 100 });
  });

  it('renders nothing when punch is not enabled', () => {
    const { container } = render(<PunchMarkers />);
    expect(container.querySelector('[data-testid="punch-in-marker"]')).toBeNull();
    expect(container.querySelector('[data-testid="punch-out-marker"]')).toBeNull();
  });

  it('renders nothing when punch is enabled but markers are null', () => {
    useTransportStore.setState({ punchEnabled: true });
    const { container } = render(<PunchMarkers />);
    expect(container.querySelector('[data-testid="punch-in-marker"]')).toBeNull();
  });

  it('renders punch-in and punch-out markers when enabled with valid times', () => {
    useTransportStore.setState({
      punchEnabled: true,
      punchInTime: 2,
      punchOutTime: 8,
    });
    render(<PunchMarkers />);

    const punchIn = screen.getByTestId('punch-in-marker');
    const punchOut = screen.getByTestId('punch-out-marker');
    expect(punchIn).toBeDefined();
    expect(punchOut).toBeDefined();
  });

  it('renders the punch region overlay between markers', () => {
    useTransportStore.setState({
      punchEnabled: true,
      punchInTime: 2,
      punchOutTime: 8,
    });
    render(<PunchMarkers />);
    const region = screen.getByTestId('punch-region');
    expect(region).toBeDefined();
  });

  it('positions markers based on pixelsPerSecond', () => {
    useTransportStore.setState({
      punchEnabled: true,
      punchInTime: 2,
      punchOutTime: 8,
    });
    render(<PunchMarkers />);

    const punchIn = screen.getByTestId('punch-in-marker');
    // At 100px/s, punch-in at 2s = 200px
    expect(punchIn.style.left).toBe('200px');

    const punchOut = screen.getByTestId('punch-out-marker');
    expect(punchOut.style.left).toBe('800px');
  });
});
