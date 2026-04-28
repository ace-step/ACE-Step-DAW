import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LimiterCard } from '../LimiterCard';
import { makeLimiterEffect, MOCK_TRACK_ID } from './effectTestHelpers';

vi.mock('../../../../store/projectStore', () => ({
  useProjectStore: vi.fn((selector: Function) =>
    selector({
      updateTrackEffect: vi.fn(),
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
    getLimiterReduction: vi.fn(() => 0),
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

vi.mock('../../LimiterCurve', () => ({
  LimiterCurve: () => <div data-testid="limiter-curve" />,
}));

describe('LimiterCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders all four parameter knobs', () => {
    const effect = makeLimiterEffect();
    render(<LimiterCard effect={effect} trackId={MOCK_TRACK_ID} />);

    expect(screen.getByText('Gain')).toBeDefined();
    expect(screen.getByText('Ceiling')).toBeDefined();
    expect(screen.getByText('Release')).toBeDefined();
    expect(screen.getByText('L.Ahead')).toBeDefined();
  });

  it('renders limiter curve visualization', () => {
    const effect = makeLimiterEffect();
    render(<LimiterCard effect={effect} trackId={MOCK_TRACK_ID} />);

    expect(screen.getByTestId('limiter-curve')).toBeDefined();
  });

  it('renders style mode selector with three options', () => {
    const effect = makeLimiterEffect();
    render(<LimiterCard effect={effect} trackId={MOCK_TRACK_ID} />);

    expect(screen.getByText('transparent')).toBeDefined();
    expect(screen.getByText('aggressive')).toBeDefined();
    expect(screen.getByText('warm')).toBeDefined();
  });

  it('highlights the active style via CSS class', () => {
    const effect = makeLimiterEffect({ style: 'aggressive' });
    render(<LimiterCard effect={effect} trackId={MOCK_TRACK_ID} />);

    const aggressiveBtn = screen.getByText('aggressive');
    expect(aggressiveBtn.className).toContain('bg-amber-500/25');
    const transparentBtn = screen.getByText('transparent');
    expect(transparentBtn.className).not.toContain('bg-amber-500/25');
  });

  it('updates style when mode button is clicked', () => {
    const effect = makeLimiterEffect({ style: 'transparent' });
    render(<LimiterCard effect={effect} trackId={MOCK_TRACK_ID} />);

    fireEvent.click(screen.getByText('warm'));
    expect(mockUpdateEffectParams).toHaveBeenCalledWith(
      MOCK_TRACK_ID,
      'fx-1',
      expect.objectContaining({ style: 'warm' }),
      'limiter',
    );
  });
});
