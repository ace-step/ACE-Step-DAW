import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DistortionCard } from '../DistortionCard';
import { makeDistortionEffect, MOCK_TRACK_ID } from './effectTestHelpers';

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
  effectsEngine: { updateEffectParams: (...args: unknown[]) => mockUpdateEffectParams(...args) },
}));

vi.mock('../../../../utils/effectAutomation', () => ({
  normalizeEffectParamValue: vi.fn(() => 0.5),
  getEffectAutomationLabel: vi.fn(() => 'Param'),
}));

vi.mock('../../../../types/project', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return { ...actual, automationParamEquals: vi.fn(() => false) };
});

vi.mock('../../DistortionCurve', () => ({
  DistortionCurve: () => <div data-testid="distortion-curve" />,
}));

describe('DistortionCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders amount knob', () => {
    render(<DistortionCard effect={makeDistortionEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('Amount')).toBeDefined();
  });

  it('renders dry/wet slider', () => {
    render(<DistortionCard effect={makeDistortionEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('Dry/Wet')).toBeDefined();
  });

  it('renders distortion type mode buttons', () => {
    render(<DistortionCard effect={makeDistortionEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('soft')).toBeDefined();
    expect(screen.getByText('overdrive')).toBeDefined();
    expect(screen.getByText('fuzz')).toBeDefined();
  });

  it('switches distortion type on click', () => {
    render(<DistortionCard effect={makeDistortionEffect({ distortionType: 'soft' })} trackId={MOCK_TRACK_ID} />);
    fireEvent.click(screen.getByText('fuzz'));
    expect(mockUpdateEffectParams).toHaveBeenCalledWith(
      MOCK_TRACK_ID, 'fx-1',
      expect.objectContaining({ distortionType: 'fuzz' }),
      'distortion',
    );
  });

  it('renders distortion curve visualization', () => {
    render(<DistortionCard effect={makeDistortionEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByTestId('distortion-curve')).toBeDefined();
  });
});
