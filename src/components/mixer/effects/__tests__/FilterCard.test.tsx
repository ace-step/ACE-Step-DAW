import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilterCard } from '../FilterCard';
import { makeFilterEffect, MOCK_TRACK_ID } from './effectTestHelpers';

const mockUpdateTrackEffect = vi.fn();

vi.mock('../../../../store/projectStore', () => ({
  useProjectStore: vi.fn((selector: Function) =>
    selector({
      updateTrackEffect: mockUpdateTrackEffect,
      ensureAutomationLane: vi.fn(),
      clearAutomationLane: vi.fn(),
      project: { tracks: [] },
    }),
  ),
}));

const mockUpdateEffectParams = vi.fn();
vi.mock('../../../../engine/EffectsEngine', () => ({
  effectsEngine: {
    updateEffectParams: (...args: unknown[]) => mockUpdateEffectParams(...args),
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

vi.mock('../../FilterResponseCurve', () => ({
  FilterResponseCurve: () => <div data-testid="filter-curve" />,
}));

vi.mock('../LfoWaveformPreview', () => ({
  LfoWaveformPreview: () => <div data-testid="lfo-preview" />,
}));

describe('FilterCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders cutoff and resonance knobs', () => {
    const effect = makeFilterEffect();
    render(<FilterCard effect={effect} trackId={MOCK_TRACK_ID} />);

    expect(screen.getByText('Cutoff')).toBeDefined();
    expect(screen.getByText('Reso')).toBeDefined();
  });

  it('renders filter curve visualization', () => {
    const effect = makeFilterEffect();
    render(<FilterCard effect={effect} trackId={MOCK_TRACK_ID} />);

    expect(screen.getByTestId('filter-curve')).toBeDefined();
  });

  it('renders filter type mode buttons (LP/HP/BP)', () => {
    const effect = makeFilterEffect();
    render(<FilterCard effect={effect} trackId={MOCK_TRACK_ID} />);

    expect(screen.getByText('LP')).toBeDefined();
    expect(screen.getByText('HP')).toBeDefined();
    expect(screen.getByText('BP')).toBeDefined();
  });

  it('switches filter type on button click', () => {
    const effect = makeFilterEffect({ filterType: 'lowpass' });
    render(<FilterCard effect={effect} trackId={MOCK_TRACK_ID} />);

    fireEvent.click(screen.getByText('HP'));
    expect(mockUpdateEffectParams).toHaveBeenCalledWith(
      MOCK_TRACK_ID,
      'fx-1',
      expect.objectContaining({ filterType: 'highpass' }),
      'filter',
    );
  });

  it('renders LFO toggle button', () => {
    const effect = makeFilterEffect({ lfoEnabled: false });
    render(<FilterCard effect={effect} trackId={MOCK_TRACK_ID} />);

    expect(screen.getByText('LFO OFF')).toBeDefined();
  });

  it('shows LFO controls when enabled', () => {
    const effect = makeFilterEffect({ lfoEnabled: true });
    render(<FilterCard effect={effect} trackId={MOCK_TRACK_ID} />);

    expect(screen.getByText('LFO ON')).toBeDefined();
    expect(screen.getByText('Rate')).toBeDefined();
    expect(screen.getByText('Depth')).toBeDefined();
    expect(screen.getByTestId('lfo-preview')).toBeDefined();
  });

  it('hides LFO controls when disabled', () => {
    const effect = makeFilterEffect({ lfoEnabled: false });
    render(<FilterCard effect={effect} trackId={MOCK_TRACK_ID} />);

    expect(screen.queryByText('Rate')).toBeNull();
    expect(screen.queryByText('Depth')).toBeNull();
  });

  it('toggles LFO on button click', () => {
    const effect = makeFilterEffect({ lfoEnabled: false });
    render(<FilterCard effect={effect} trackId={MOCK_TRACK_ID} />);

    fireEvent.click(screen.getByText('LFO OFF'));
    expect(mockUpdateEffectParams).toHaveBeenCalledWith(
      MOCK_TRACK_ID,
      'fx-1',
      expect.objectContaining({ lfoEnabled: true }),
      'filter',
    );
  });
});
