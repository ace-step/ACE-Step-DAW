import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChorusCard } from '../ChorusCard';
import { makeChorusEffect, MOCK_TRACK_ID } from './effectTestHelpers';

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

describe('ChorusCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders all four parameter knobs', () => {
    render(<ChorusCard effect={makeChorusEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('Rate')).toBeDefined();
    expect(screen.getByText('Depth')).toBeDefined();
    expect(screen.getByText('Delay')).toBeDefined();
    expect(screen.getByText('Feedback')).toBeDefined();
  });

  it('renders dry/wet slider', () => {
    render(<ChorusCard effect={makeChorusEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('Dry/Wet')).toBeDefined();
  });

  it('renders modulation display visualization', () => {
    render(<ChorusCard effect={makeChorusEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByTestId('mod-display')).toBeDefined();
  });

  it('displays formatted wet percentage', () => {
    render(<ChorusCard effect={makeChorusEffect({ wet: 0.75 })} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('75%')).toBeDefined();
  });
});
