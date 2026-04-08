import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReverbCard } from '../ReverbCard';
import { makeReverbEffect, MOCK_TRACK_ID } from './effectTestHelpers';

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

vi.mock('../../../../engine/EffectsEngine', () => ({
  effectsEngine: { updateEffectParams: vi.fn() },
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

describe('ReverbCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders decay and pre-delay knobs', () => {
    render(<ReverbCard effect={makeReverbEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('Decay')).toBeDefined();
    expect(screen.getByText('Pre-Dly')).toBeDefined();
  });

  it('renders dry/wet slider', () => {
    render(<ReverbCard effect={makeReverbEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('Dry/Wet')).toBeDefined();
  });

  it('renders reverb curve visualization', () => {
    render(<ReverbCard effect={makeReverbEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByTestId('reverb-curve')).toBeDefined();
  });
});
