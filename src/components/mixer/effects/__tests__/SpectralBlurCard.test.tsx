import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SpectralBlurCard } from '../SpectralBlurCard';
import { makeSpectralBlurEffect, MOCK_TRACK_ID } from './effectTestHelpers';

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
  effectsEngine: {
    updateEffectParams: vi.fn(),
    getSpectralData: vi.fn(() => new Float32Array(128)),
    getSpectralProcessor: vi.fn(() => ({
      getMagnitude: vi.fn(() => new Float32Array(128).fill(0.1)),
    })),
  },
}));

vi.mock('../../../../utils/effectAutomation', () => ({
  normalizeEffectParamValue: vi.fn(() => 0.5),
  getEffectAutomationLabel: vi.fn(() => 'Param'),
}));

vi.mock('../../../../types/project', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return { ...actual, automationParamEquals: vi.fn(() => false) };
});

describe('SpectralBlurCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders three parameter knobs', () => {
    render(<SpectralBlurCard effect={makeSpectralBlurEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('Blur')).toBeDefined();
    expect(screen.getByText('Spread')).toBeDefined();
    expect(screen.getByText('Bright')).toBeDefined();
  });

  it('renders mix slider', () => {
    render(<SpectralBlurCard effect={makeSpectralBlurEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('Dry/Wet')).toBeDefined();
  });
});
