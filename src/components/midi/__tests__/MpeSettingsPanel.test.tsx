import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MpeSettingsPanel } from '../MpeSettingsPanel';
import { useMpeStore, setMpeZoneManager } from '../../../store/mpeStore';
import { MpeZoneManager } from '../../../services/mpeService';

describe('MpeSettingsPanel', () => {
  beforeEach(() => {
    setMpeZoneManager(new MpeZoneManager());
    useMpeStore.setState({
      enabled: false,
      lowerZoneMembers: 0,
      upperZoneMembers: 0,
      pitchBendRange: 48,
      activeNotes: [],
      autoDetected: false,
    });
  });

  it('renders MPE heading and toggle', () => {
    render(<MpeSettingsPanel />);
    expect(screen.getByText('MPE (Polyphonic Expression)')).toBeTruthy();
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeTruthy();
  });

  it('shows Off label when disabled', () => {
    render(<MpeSettingsPanel />);
    expect(screen.getByText('Off')).toBeTruthy();
  });

  it('shows zone config when enabled', () => {
    useMpeStore.setState({ enabled: true });
    render(<MpeSettingsPanel />);
    expect(screen.getByText('On')).toBeTruthy();
    expect(screen.getByText('Lower Zone Members')).toBeTruthy();
    expect(screen.getByText('Upper Zone Members')).toBeTruthy();
    expect(screen.getByText('Pitch Bend Range (semitones)')).toBeTruthy();
    expect(screen.getByText('Channel Map')).toBeTruthy();
  });

  it('hides zone config when disabled', () => {
    useMpeStore.setState({ enabled: false });
    render(<MpeSettingsPanel />);
    expect(screen.queryByText('Lower Zone Members')).toBeNull();
  });

  it('enables MPE when checkbox is toggled', () => {
    render(<MpeSettingsPanel />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(useMpeStore.getState().enabled).toBe(true);
  });

  it('shows auto-detection notice', () => {
    useMpeStore.setState({ enabled: true, autoDetected: true });
    render(<MpeSettingsPanel />);
    expect(screen.getByText('MPE controller auto-detected')).toBeTruthy();
  });

  it('renders 16 channel indicators', () => {
    useMpeStore.setState({ enabled: true, lowerZoneMembers: 5 });
    render(<MpeSettingsPanel />);
    // Channel map should show numbers 1-16
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('16')).toBeTruthy();
  });
});
