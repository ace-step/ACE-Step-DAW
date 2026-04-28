import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StereoImagerCard } from '../StereoImagerCard';
import { makeStereoImagerEffect, MOCK_TRACK_ID } from './effectTestHelpers';

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

vi.mock('../../StereoFieldDisplay', () => ({
  StereoFieldDisplay: () => <div data-testid="stereo-display" />,
}));

describe('StereoImagerCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders all four parameter knobs', () => {
    render(<StereoImagerCard effect={makeStereoImagerEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('Width')).toBeDefined();
    expect(screen.getByText('Mid')).toBeDefined();
    expect(screen.getByText('Side')).toBeDefined();
    expect(screen.getByText('Mono Bass')).toBeDefined();
  });

  it('renders stereo field visualization', () => {
    render(<StereoImagerCard effect={makeStereoImagerEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByTestId('stereo-display')).toBeDefined();
  });
});
