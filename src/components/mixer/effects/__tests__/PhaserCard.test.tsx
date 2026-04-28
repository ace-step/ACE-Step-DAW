import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PhaserCard } from '../PhaserCard';
import { makePhaserEffect, MOCK_TRACK_ID } from './effectTestHelpers';

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

vi.mock('../../ModulationDisplay', () => ({
  ModulationDisplay: () => <div data-testid="mod-display" />,
}));

describe('PhaserCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders all four parameter knobs', () => {
    render(<PhaserCard effect={makePhaserEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('Rate')).toBeDefined();
    expect(screen.getByText('Octaves')).toBeDefined();
    expect(screen.getByText('Q')).toBeDefined();
    expect(screen.getByText('Base')).toBeDefined();
  });

  it('renders dry/wet slider', () => {
    render(<PhaserCard effect={makePhaserEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByText('Dry/Wet')).toBeDefined();
  });

  it('renders modulation display', () => {
    render(<PhaserCard effect={makePhaserEffect()} trackId={MOCK_TRACK_ID} />);
    expect(screen.getByTestId('mod-display')).toBeDefined();
  });
});
