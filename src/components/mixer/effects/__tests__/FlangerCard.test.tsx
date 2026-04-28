import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FlangerCard } from '../FlangerCard';
import { makeFlangerEffect, MOCK_TRACK_ID } from './effectTestHelpers';

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

vi.mock('../../ModulationDisplay', () => ({
  ModulationDisplay: () => <div data-testid="mod-display" />,
}));

vi.mock('../LfoWaveformPreview', () => ({
  LfoWaveformPreview: () => <div data-testid="lfo-preview" />,
}));

describe('FlangerCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders all four parameter knobs', () => {
    render(<FlangerCard effect={makeFlangerEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('Rate')).toBeDefined();
    expect(screen.getByText('Depth')).toBeDefined();
    expect(screen.getByText('Delay')).toBeDefined();
    expect(screen.getByText('Feedback')).toBeDefined();
  });

  it('renders dry/wet slider', () => {
    render(<FlangerCard effect={makeFlangerEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('Dry/Wet')).toBeDefined();
  });

  it('renders modulation display and LFO preview', () => {
    render(<FlangerCard effect={makeFlangerEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByTestId('mod-display')).toBeDefined();
    expect(screen.getByTestId('lfo-preview')).toBeDefined();
  });
});
