import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NoiseReductionCard } from '../NoiseReductionCard';
import { makeNoiseReductionEffect, MOCK_TRACK_ID } from './effectTestHelpers';

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

vi.mock('../../NoiseReductionDisplay', () => ({
  NoiseReductionDisplay: () => <div data-testid="nr-display" />,
}));

describe('NoiseReductionCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders three parameter knobs', () => {
    render(<NoiseReductionCard effect={makeNoiseReductionEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('Amount')).toBeDefined();
    expect(screen.getByText('Threshold')).toBeDefined();
    expect(screen.getByText('HF Focus')).toBeDefined();
  });

  it('renders fast/smooth mode buttons', () => {
    render(<NoiseReductionCard effect={makeNoiseReductionEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('fast')).toBeDefined();
    expect(screen.getByText('smooth')).toBeDefined();
  });

  it('renders mix slider', () => {
    render(<NoiseReductionCard effect={makeNoiseReductionEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('Dry/Wet')).toBeDefined();
  });

  it('switches mode on click', () => {
    render(<NoiseReductionCard effect={makeNoiseReductionEffect({ mode: 'fast' })} trackId={MOCK_TRACK_ID} />);
    fireEvent.click(screen.getByText('smooth'));
    expect(mockUpdateEffectParams).toHaveBeenCalledWith(
      MOCK_TRACK_ID, 'fx-1',
      expect.objectContaining({ mode: 'smooth' }),
      'noiseReduction',
    );
  });
});
