import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SynthParameterEditor } from '../SynthParameterEditor';
import { useProjectStore } from '../../../store/projectStore';

// Minimal track for testing
const makePianoRollTrack = (overrides = {}) => ({
  id: 'track-1',
  trackType: 'pianoRoll' as const,
  trackName: 'vocals' as const,
  displayName: 'Test Synth',
  color: '#4A5FFF',
  order: 0,
  volume: 1,
  muted: false,
  soloed: false,
  clips: [],
  synthPreset: 'lead' as const,
  ...overrides,
});

describe('SynthParameterEditor', () => {
  beforeEach(() => {
    const state = useProjectStore.getState();
    state.createProject('test-project', 120, 'C', 'major');
    // Replace tracks with our test track
    const project = useProjectStore.getState().project!;
    useProjectStore.setState({
      project: { ...project, tracks: [makePianoRollTrack()] },
    });
  });

  it('renders all synth parameter sections', () => {
    render(<SynthParameterEditor trackId="track-1" />);
    expect(screen.getByTestId('synth-parameter-editor')).toBeDefined();
    // Oscillator section
    screen.getByText('Oscillator');
    // ADSR section
    screen.getByText('Envelope');
    // Filter section
    screen.getByText('Filter');
    // LFO section
    screen.getByText('LFO');
    // Unison section
    screen.getByText('Unison');
  });

  it('shows correct oscillator waveform for lead preset', () => {
    render(<SynthParameterEditor trackId="track-1" />);
    // Lead preset defaults to square
    const squareBtn = screen.getByRole('button', { name: /square/i });
    expect(squareBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('shows correct oscillator waveform for pad preset', () => {
    const project = useProjectStore.getState().project!;
    useProjectStore.setState({
      project: { ...project, tracks: [makePianoRollTrack({ synthPreset: 'pad' })] },
    });

    render(<SynthParameterEditor trackId="track-1" />);
    const sineBtn = screen.getByRole('button', { name: /sine/i });
    expect(sineBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('uses explicit oscillator type over preset default', () => {
    const project = useProjectStore.getState().project!;
    useProjectStore.setState({
      project: { ...project, tracks: [makePianoRollTrack({ synthPreset: 'lead', synthOscillatorType: 'sawtooth' })] },
    });

    render(<SynthParameterEditor trackId="track-1" />);
    const sawBtn = screen.getByRole('button', { name: /sawtooth/i });
    expect(sawBtn.getAttribute('aria-pressed')).toBe('true');
    // Square (lead default) should NOT be active
    const squareBtn = screen.getByRole('button', { name: /square/i });
    expect(squareBtn.getAttribute('aria-pressed')).toBe('false');
  });

  it('renders nothing when track is not found', () => {
    const { container } = render(<SynthParameterEditor trackId="nonexistent" />);
    expect(container.innerHTML).toBe('');
  });

  it('renders ADSR knobs for envelope editing', () => {
    render(<SynthParameterEditor trackId="track-1" />);
    // Both amp and filter envelope have ATK, so use getAllByLabelText
    const atkKnobs = screen.getAllByLabelText('ATK knob');
    expect(atkKnobs.length).toBeGreaterThanOrEqual(2); // amp + filter envelope
    const susKnobs = screen.getAllByLabelText('SUS knob');
    expect(susKnobs.length).toBeGreaterThanOrEqual(2);
  });

  it('renders filter Freq and Res knobs', () => {
    render(<SynthParameterEditor trackId="track-1" />);
    // Filter section has both Freq and Res
    screen.getByLabelText('Freq knob');
    screen.getByLabelText('Res knob');
  });
});
