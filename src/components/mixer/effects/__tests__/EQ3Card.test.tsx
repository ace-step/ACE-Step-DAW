import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EQ3Card } from '../EQ3Card';
import { makeEQ3Effect, MOCK_TRACK_ID } from './effectTestHelpers';

vi.mock('../../../../store/projectStore', () => ({
  useProjectStore: vi.fn((selector: Function) =>
    selector({
      updateTrackEffect: vi.fn(),
      ensureAutomationLane: vi.fn(),
      clearAutomationLane: vi.fn(),
      project: { tracks: [] },
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

// EQ3Card uses an inline EQ curve canvas — mock it
vi.mock('../../FilterResponseCurve', () => ({
  FilterResponseCurve: () => <div data-testid="eq-curve" />,
}));

describe('EQ3Card', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders three band knobs', () => {
    const effect = makeEQ3Effect();
    render(<EQ3Card effect={effect} trackId={MOCK_TRACK_ID} />);

    expect(screen.getByText('Low')).toBeDefined();
    expect(screen.getByText('Mid')).toBeDefined();
    expect(screen.getByText('High')).toBeDefined();
  });

  it('renders frequency sliders in footer', () => {
    const effect = makeEQ3Effect();
    render(<EQ3Card effect={effect} trackId={MOCK_TRACK_ID} />);

    // Footer should show low and high frequency slider labels
    expect(screen.getByText('Low Freq')).toBeDefined();
    expect(screen.getByText('High Freq')).toBeDefined();
  });

  it('displays current frequency values', () => {
    const effect = makeEQ3Effect({ lowFrequency: 400, highFrequency: 2500 });
    render(<EQ3Card effect={effect} trackId={MOCK_TRACK_ID} />);

    expect(screen.getByText('400 Hz')).toBeDefined();
    expect(screen.getByText('2500 Hz')).toBeDefined();
  });
});
