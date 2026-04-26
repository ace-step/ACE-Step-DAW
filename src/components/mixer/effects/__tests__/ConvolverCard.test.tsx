import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConvolverCard } from '../ConvolverCard';
import { makeConvolverEffect, MOCK_TRACK_ID } from './effectTestHelpers';

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

vi.mock('../../ConvolverDisplay', () => ({
  ConvolverDisplay: () => <div data-testid="convolver-display" />,
}));

describe('ConvolverCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders pre-delay knob', () => {
    render(<ConvolverCard effect={makeConvolverEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('Pre-Dly')).toBeDefined();
  });

  it('renders dry/wet slider', () => {
    render(<ConvolverCard effect={makeConvolverEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('Dry/Wet')).toBeDefined();
  });

  it('renders IR type dropdown', () => {
    render(<ConvolverCard effect={makeConvolverEffect()} trackId={MOCK_TRACK_ID} />);
    const select = screen.getByRole('combobox');
    expect(select).toBeDefined();
  });

  it('changes IR type when dropdown changes', () => {
    render(<ConvolverCard effect={makeConvolverEffect()} trackId={MOCK_TRACK_ID} />);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'largeHall' } });
    expect(mockUpdateEffectParams).toHaveBeenCalledWith(
      MOCK_TRACK_ID, 'fx-1',
      expect.objectContaining({ irType: 'largeHall' }),
      'convolver',
    );
  });

  it('renders visualization', () => {
    render(<ConvolverCard effect={makeConvolverEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByTestId('convolver-display')).toBeDefined();
  });
});
