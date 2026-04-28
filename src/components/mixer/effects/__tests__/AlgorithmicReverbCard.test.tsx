import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AlgorithmicReverbCard } from '../AlgorithmicReverbCard';
import { makeAlgorithmicReverbEffect, MOCK_TRACK_ID } from './effectTestHelpers';

vi.mock('../../../../store/projectStore', () => ({
  useProjectStore: vi.fn((selector: Function) =>
    selector({
      updateTrackEffect: vi.fn(),
      ensureAutomationLane: vi.fn(),
      clearAutomationLane: vi.fn(),
      project: { tracks: [], automationLanes: [] },
    }),
  ),
}));

const mockUpdateEffectParams = vi.fn();
vi.mock('../../../../engine/EffectsEngine', () => ({
  effectsEngine: { updateEffectParams: (...args: unknown[]) => mockUpdateEffectParams(...args) },
}));

vi.mock('../../../../utils/effectAutomation', () => ({
  normalizeEffectParamValue: vi.fn(() => 0.5),
  getEffectAutomationLabel: vi.fn(() => 'Param'),
}));

vi.mock('../../../../types/project', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return { ...actual, automationParamEquals: vi.fn(() => false) };
});

vi.mock('../../ReverbDecayCurve', () => ({
  ReverbDecayCurve: () => <div data-testid="reverb-curve" />,
}));

describe('AlgorithmicReverbCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders four parameter knobs', () => {
    render(<AlgorithmicReverbCard effect={makeAlgorithmicReverbEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('Decay')).toBeDefined();
    expect(screen.getByText('Size')).toBeDefined();
    expect(screen.getByText('Damping')).toBeDefined();
    expect(screen.getByText('Pre-Dly')).toBeDefined();
  });

  it('renders reverb type selector with 5 types', () => {
    render(<AlgorithmicReverbCard effect={makeAlgorithmicReverbEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('Plate')).toBeDefined();
    expect(screen.getByText('Hall')).toBeDefined();
    expect(screen.getByText('Room')).toBeDefined();
    expect(screen.getByText('Chamber')).toBeDefined();
    expect(screen.getByText('Spring')).toBeDefined();
  });

  it('renders mix slider', () => {
    render(<AlgorithmicReverbCard effect={makeAlgorithmicReverbEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('Dry/Wet')).toBeDefined();
  });

  it('switches reverb type on click', () => {
    render(<AlgorithmicReverbCard effect={makeAlgorithmicReverbEffect({ reverbType: 'plate' })} trackId={MOCK_TRACK_ID} />);
    fireEvent.click(screen.getByText('Hall'));
    expect(mockUpdateEffectParams).toHaveBeenCalledWith(
      MOCK_TRACK_ID, 'fx-1',
      expect.objectContaining({ reverbType: 'hall' }),
      'algorithmicReverb',
    );
  });
});
