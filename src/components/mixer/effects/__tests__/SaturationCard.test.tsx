import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SaturationCard } from '../SaturationCard';
import { makeSaturationEffect, MOCK_TRACK_ID } from './effectTestHelpers';

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

vi.mock('../../SaturationCurve', () => ({
  SaturationCurve: () => <div data-testid="saturation-curve" />,
}));

describe('SaturationCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders all four parameter knobs', () => {
    render(<SaturationCard effect={makeSaturationEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('Drive')).toBeDefined();
    expect(screen.getByText('Harmonics')).toBeDefined();
    expect(screen.getByText('Input')).toBeDefined();
    expect(screen.getByText('Output')).toBeDefined();
  });

  it('renders mix slider', () => {
    render(<SaturationCard effect={makeSaturationEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('Dry/Wet')).toBeDefined();
  });

  it('renders saturation type selector with 5 options', () => {
    render(<SaturationCard effect={makeSaturationEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('Tape')).toBeDefined();
    expect(screen.getByText('Tube')).toBeDefined();
    expect(screen.getByText('Transistor')).toBeDefined();
    expect(screen.getByText('Soft')).toBeDefined();
    expect(screen.getByText('Hard')).toBeDefined();
  });

  it('switches saturation type on click', () => {
    render(<SaturationCard effect={makeSaturationEffect({ saturationType: 'tape' })} trackId={MOCK_TRACK_ID} />);
    fireEvent.click(screen.getByText('Tube'));
    expect(mockUpdateEffectParams).toHaveBeenCalledWith(
      MOCK_TRACK_ID, 'fx-1',
      expect.objectContaining({ saturationType: 'tube' }),
      'saturation',
    );
  });
});
