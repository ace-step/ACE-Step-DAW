import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GateCard } from '../GateCard';
import { makeGateEffect, MOCK_TRACK_ID } from './effectTestHelpers';

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
    getGateReduction: vi.fn(() => 0),
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

vi.mock('../../GateCurve', () => ({
  GateCurve: () => <div data-testid="gate-curve" />,
}));

describe('GateCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders all six parameter knobs', () => {
    const effect = makeGateEffect();
    render(<GateCard effect={effect} trackId={MOCK_TRACK_ID} />);

    expect(screen.getByText('Thresh')).toBeDefined();
    expect(screen.getByText('Range')).toBeDefined();
    expect(screen.getByText('Attack')).toBeDefined();
    expect(screen.getByText('Hold')).toBeDefined();
    expect(screen.getByText('Release')).toBeDefined();
    expect(screen.getByText('Hyst')).toBeDefined();
  });

  it('renders gate curve visualization', () => {
    const effect = makeGateEffect();
    render(<GateCard effect={effect} trackId={MOCK_TRACK_ID} />);

    expect(screen.getByTestId('gate-curve')).toBeDefined();
  });

  it('renders gate/expander mode buttons', () => {
    const effect = makeGateEffect();
    render(<GateCard effect={effect} trackId={MOCK_TRACK_ID} />);

    expect(screen.getByText('gate')).toBeDefined();
    expect(screen.getByText('expander')).toBeDefined();
  });

  it('highlights the active mode via CSS class', () => {
    const effect = makeGateEffect({ mode: 'expander' });
    render(<GateCard effect={effect} trackId={MOCK_TRACK_ID} />);

    const expanderBtn = screen.getByText('expander');
    expect(expanderBtn.className).toContain('bg-white/[0.08]');
    const gateBtn = screen.getByText('gate');
    expect(gateBtn.className).not.toContain('bg-white/[0.08]');
  });

  it('switches mode when button is clicked', () => {
    const effect = makeGateEffect({ mode: 'gate' });
    render(<GateCard effect={effect} trackId={MOCK_TRACK_ID} />);

    fireEvent.click(screen.getByText('expander'));
    expect(mockUpdateEffectParams).toHaveBeenCalledWith(
      MOCK_TRACK_ID,
      'fx-1',
      expect.objectContaining({ mode: 'expander' }),
      'gate',
    );
  });
});
