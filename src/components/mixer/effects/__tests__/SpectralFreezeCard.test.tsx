import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SpectralFreezeCard } from '../SpectralFreezeCard';
import { makeSpectralFreezeEffect, MOCK_TRACK_ID } from './effectTestHelpers';

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
  effectsEngine: {
    updateEffectParams: (...args: unknown[]) => mockUpdateEffectParams(...args),
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

describe('SpectralFreezeCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders decay and brightness knobs', () => {
    render(<SpectralFreezeCard effect={makeSpectralFreezeEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('Decay')).toBeDefined();
    expect(screen.getByText('Bright')).toBeDefined();
  });

  it('renders mix slider', () => {
    render(<SpectralFreezeCard effect={makeSpectralFreezeEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('Dry/Wet')).toBeDefined();
  });

  it('renders freeze toggle button', () => {
    render(<SpectralFreezeCard effect={makeSpectralFreezeEffect({ frozen: false })} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('FREEZE')).toBeDefined();
  });

  it('shows FROZEN state when frozen is true', () => {
    render(<SpectralFreezeCard effect={makeSpectralFreezeEffect({ frozen: true })} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('FROZEN')).toBeDefined();
  });

  it('toggles frozen on button click', () => {
    render(<SpectralFreezeCard effect={makeSpectralFreezeEffect({ frozen: false })} trackId={MOCK_TRACK_ID} />);
    fireEvent.click(screen.getByText('FREEZE'));
    expect(mockUpdateEffectParams).toHaveBeenCalledWith(
      MOCK_TRACK_ID, 'fx-1',
      expect.objectContaining({ frozen: true }),
      'spectralFreeze',
    );
  });
});
