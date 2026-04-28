import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SpectralFilterCard } from '../SpectralFilterCard';
import { makeSpectralFilterEffect, MOCK_TRACK_ID } from './effectTestHelpers';

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

describe('SpectralFilterCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders smoothness knob', () => {
    render(<SpectralFilterCard effect={makeSpectralFilterEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('Smooth')).toBeDefined();
  });

  it('renders mix slider', () => {
    render(<SpectralFilterCard effect={makeSpectralFilterEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('Dry/Wet')).toBeDefined();
  });

  it('shows point count', () => {
    render(<SpectralFilterCard effect={makeSpectralFilterEffect({
      points: [{ frequency: 500, gain: 0 }, { frequency: 2000, gain: -6 }],
    })} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('2 pts')).toBeDefined();
  });

  it('renders reset button', () => {
    render(<SpectralFilterCard effect={makeSpectralFilterEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('Reset')).toBeDefined();
  });
});
