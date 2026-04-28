import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DeEsserCard } from '../DeEsserCard';
import { makeDeEsserEffect, MOCK_TRACK_ID } from './effectTestHelpers';

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
    getDeEsserReduction: vi.fn(() => 0),
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

vi.mock('../../DeEsserDisplay', () => ({
  DeEsserDisplay: () => <div data-testid="deesser-display" />,
}));

describe('DeEsserCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders all four parameter knobs', () => {
    render(<DeEsserCard effect={makeDeEsserEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('Freq')).toBeDefined();
    expect(screen.getByText('Width')).toBeDefined();
    expect(screen.getByText('Thresh')).toBeDefined();
    expect(screen.getByText('Range')).toBeDefined();
  });

  it('renders wideband/split mode buttons', () => {
    render(<DeEsserCard effect={makeDeEsserEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('wideband')).toBeDefined();
    expect(screen.getByText('split')).toBeDefined();
  });

  it('renders listen toggle button', () => {
    render(<DeEsserCard effect={makeDeEsserEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('Listen')).toBeDefined();
  });

  it('switches mode on click', () => {
    render(<DeEsserCard effect={makeDeEsserEffect({ mode: 'wideband' })} trackId={MOCK_TRACK_ID} />);
    fireEvent.click(screen.getByText('split'));
    expect(mockUpdateEffectParams).toHaveBeenCalledWith(
      MOCK_TRACK_ID, 'fx-1',
      expect.objectContaining({ mode: 'split' }),
      'deesser',
    );
  });

  it('renders visualization', () => {
    render(<DeEsserCard effect={makeDeEsserEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByTestId('deesser-display')).toBeDefined();
  });
});
