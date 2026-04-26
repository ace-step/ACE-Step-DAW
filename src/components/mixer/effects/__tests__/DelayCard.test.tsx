import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DelayCard } from '../DelayCard';
import { makeDelayEffect, MOCK_TRACK_ID } from './effectTestHelpers';

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

vi.mock('../../DelayTapTimeline', () => ({
  DelayTapTimeline: () => <div data-testid="delay-timeline" />,
}));

describe('DelayCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders time and feedback knobs', () => {
    render(<DelayCard effect={makeDelayEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('Time')).toBeDefined();
    expect(screen.getByText('Feedback')).toBeDefined();
  });

  it('renders dry/wet slider in footer', () => {
    render(<DelayCard effect={makeDelayEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('Dry/Wet')).toBeDefined();
  });

  it('renders delay timeline visualization', () => {
    render(<DelayCard effect={makeDelayEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByTestId('delay-timeline')).toBeDefined();
  });

  it('displays formatted wet percentage', () => {
    render(<DelayCard effect={makeDelayEffect({ wet: 0.45 })} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('45%')).toBeDefined();
  });
});
