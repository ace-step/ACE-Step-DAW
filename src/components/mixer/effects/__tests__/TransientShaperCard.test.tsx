import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TransientShaperCard } from '../TransientShaperCard';
import { makeTransientShaperEffect, MOCK_TRACK_ID } from './effectTestHelpers';

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
  effectsEngine: { updateEffectParams: vi.fn() },
}));

vi.mock('../../../../utils/effectAutomation', () => ({
  normalizeEffectParamValue: vi.fn(() => 0.5),
  getEffectAutomationLabel: vi.fn(() => 'Param'),
}));

vi.mock('../../../../types/project', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return { ...actual, automationParamEquals: vi.fn(() => false) };
});

vi.mock('../../TransientShaperDisplay', () => ({
  TransientShaperDisplay: () => <div data-testid="transient-display" />,
}));

describe('TransientShaperCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders attack, sustain, and output knobs', () => {
    render(<TransientShaperCard effect={makeTransientShaperEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('Attack')).toBeDefined();
    expect(screen.getByText('Sustain')).toBeDefined();
    expect(screen.getByText('Output')).toBeDefined();
  });

  it('renders mix slider', () => {
    render(<TransientShaperCard effect={makeTransientShaperEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('Dry/Wet')).toBeDefined();
  });

  it('renders transient shaper visualization', () => {
    render(<TransientShaperCard effect={makeTransientShaperEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByTestId('transient-display')).toBeDefined();
  });
});
