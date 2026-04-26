import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SpectralMorphCard } from '../SpectralMorphCard';
import { makeSpectralMorphEffect, MOCK_TRACK_ID } from './effectTestHelpers';

const mockTracks = [
  { id: 'track-1', displayName: 'Kick', clips: [] },
  { id: 'track-2', displayName: 'Snare', clips: [] },
];

vi.mock('../../../../store/projectStore', () => ({
  useProjectStore: vi.fn((selector: Function) =>
    selector({
      updateTrackEffect: vi.fn(),
      ensureAutomationLane: vi.fn(),
      clearAutomationLane: vi.fn(),
      project: { tracks: mockTracks, automationLanes: [] },
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

describe('SpectralMorphCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders morph amount knob', () => {
    render(<SpectralMorphCard effect={makeSpectralMorphEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('Morph')).toBeDefined();
  });

  it('renders mix slider', () => {
    render(<SpectralMorphCard effect={makeSpectralMorphEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('Dry/Wet')).toBeDefined();
  });

  it('renders lock B toggle', () => {
    render(<SpectralMorphCard effect={makeSpectralMorphEffect({ frozen: false })} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('LOCK B')).toBeDefined();
  });

  it('shows LOCKED when frozen', () => {
    render(<SpectralMorphCard effect={makeSpectralMorphEffect({ frozen: true })} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('LOCKED')).toBeDefined();
  });

  it('renders source track selector', () => {
    render(<SpectralMorphCard effect={makeSpectralMorphEffect()} trackId={MOCK_TRACK_ID} />);
    // Should have a select dropdown for morph source
    const selects = screen.getAllByRole('combobox');
    expect(selects.length).toBeGreaterThanOrEqual(1);
  });

  it('toggles frozen on lock button click', () => {
    render(<SpectralMorphCard effect={makeSpectralMorphEffect({ frozen: false })} trackId={MOCK_TRACK_ID} />);
    fireEvent.click(screen.getByText('LOCK B'));
    expect(mockUpdateEffectParams).toHaveBeenCalledWith(
      MOCK_TRACK_ID, 'fx-1',
      expect.objectContaining({ frozen: true }),
      'spectralMorph',
    );
  });
});
