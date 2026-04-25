import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ParametricEQCard } from '../ParametricEQCard';
import { makeParametricEQEffect, MOCK_TRACK_ID } from './effectTestHelpers';

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
    getParametricEQSpectrumData: vi.fn(() => null),
  },
}));

vi.mock('../../../../hooks/useAudioEngine', () => ({
  getAudioEngine: vi.fn(() => ({
    getTrackSpectrum: vi.fn(() => null),
  })),
}));

vi.mock('../../../../utils/effectAutomation', () => ({
  normalizeEffectParamValue: vi.fn(() => 0.5),
  getEffectAutomationLabel: vi.fn(() => 'Param'),
}));

vi.mock('../../../../types/project', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return { ...actual, automationParamEquals: vi.fn(() => false) };
});

describe('ParametricEQCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders mode selector (Simple/Parametric)', () => {
    render(<ParametricEQCard effect={makeParametricEQEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('Simple')).toBeDefined();
    expect(screen.getByText('Parametric')).toBeDefined();
  });

  it('renders simple mode knobs (Low, Mid, High)', () => {
    render(<ParametricEQCard effect={makeParametricEQEffect({ mode: 'simple' })} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('Low')).toBeDefined();
    expect(screen.getByText('Mid')).toBeDefined();
    expect(screen.getByText('High')).toBeDefined();
  });

  it('switches to parametric mode on click', () => {
    render(<ParametricEQCard effect={makeParametricEQEffect({ mode: 'simple' })} trackId={MOCK_TRACK_ID} />);
    fireEvent.click(screen.getByText('Parametric'));
    expect(mockUpdateEffectParams).toHaveBeenCalledWith(
      MOCK_TRACK_ID, 'fx-1',
      expect.objectContaining({ mode: 'parametric' }),
      'parametricEq',
    );
  });

  it('renders frequency sliders in simple mode footer', () => {
    render(<ParametricEQCard effect={makeParametricEQEffect({ mode: 'simple' })} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('Low Freq')).toBeDefined();
    expect(screen.getByText('High Freq')).toBeDefined();
  });
});
