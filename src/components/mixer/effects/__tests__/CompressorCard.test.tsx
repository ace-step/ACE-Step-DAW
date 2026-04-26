import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CompressorCard } from '../CompressorCard';
import { makeCompressorEffect, MOCK_TRACK_ID } from './effectTestHelpers';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockUpdateTrackEffect = vi.fn();
const mockSetSidechainSource = vi.fn();
const mockTracks = [
  { id: 'track-1', displayName: 'Kick', clips: [], type: 'audio' as const },
  { id: 'track-2', displayName: 'Snare', clips: [], type: 'audio' as const },
  { id: 'track-3', displayName: 'Bass', clips: [], type: 'audio' as const },
];

vi.mock('../../../../store/projectStore', () => ({
  useProjectStore: vi.fn((selector: Function) =>
    selector({
      updateTrackEffect: mockUpdateTrackEffect,
      setSidechainSource: mockSetSidechainSource,
      project: { tracks: mockTracks },
    }),
  ),
}));

vi.mock('../../../../engine/EffectsEngine', () => ({
  effectsEngine: {
    updateEffectParams: vi.fn(),
    getCompressorReduction: vi.fn(() => 0),
    getSidechainReduction: vi.fn(() => 0),
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

// Mock canvas for CompressorCurve visualization
vi.mock('../../CompressorCurve', () => ({
  CompressorCurve: () => <div data-testid="compressor-curve" />,
}));

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('CompressorCard', () => {
  let rafId = 0;
  const originalRaf = globalThis.requestAnimationFrame;
  const originalCaf = globalThis.cancelAnimationFrame;

  beforeEach(() => {
    vi.clearAllMocks();
    rafId = 0;
    globalThis.requestAnimationFrame = vi.fn(() => ++rafId) as unknown as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = vi.fn();
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCaf;
  });

  it('renders all five parameter knobs', () => {
    const effect = makeCompressorEffect();
    render(<CompressorCard effect={effect} trackId={MOCK_TRACK_ID} />);

    expect(screen.getByText('Thresh')).toBeDefined();
    expect(screen.getByText('Ratio')).toBeDefined();
    expect(screen.getByText('Attack')).toBeDefined();
    expect(screen.getByText('Release')).toBeDefined();
    expect(screen.getByText('Knee')).toBeDefined();
  });

  it('renders the compressor curve visualization', () => {
    const effect = makeCompressorEffect();
    render(<CompressorCard effect={effect} trackId={MOCK_TRACK_ID} />);

    expect(screen.getByTestId('compressor-curve')).toBeDefined();
  });

  it('renders gain reduction meter section', () => {
    const effect = makeCompressorEffect();
    render(<CompressorCard effect={effect} trackId={MOCK_TRACK_ID} />);

    expect(screen.getByText('GR')).toBeDefined();
  });

  it('renders sidechain source selector', () => {
    const effect = makeCompressorEffect();
    render(<CompressorCard effect={effect} trackId={MOCK_TRACK_ID} />);

    const select = screen.getByTestId('sidechain-source-select');
    expect(select).toBeDefined();
    // Should show "None" + other tracks (excluding self)
    const options = select.querySelectorAll('option');
    expect(options.length).toBe(3); // None + Snare + Bass (not Kick which is self)
  });

  it('shows other track names in sidechain dropdown excluding self', () => {
    const effect = makeCompressorEffect();
    render(<CompressorCard effect={effect} trackId={MOCK_TRACK_ID} />);

    const select = screen.getByTestId('sidechain-source-select');
    const options = Array.from(select.querySelectorAll('option'));
    const labels = options.map((o) => o.textContent);
    expect(labels).toContain('None');
    expect(labels).toContain('Snare');
    expect(labels).toContain('Bass');
    expect(labels).not.toContain('Kick');
  });

  it('calls setSidechainSource when sidechain source changes', () => {
    const effect = makeCompressorEffect();
    render(<CompressorCard effect={effect} trackId={MOCK_TRACK_ID} />);

    const select = screen.getByTestId('sidechain-source-select');
    fireEvent.change(select, { target: { value: 'track-2' } });
    expect(mockSetSidechainSource).toHaveBeenCalledWith(MOCK_TRACK_ID, 'fx-1', 'track-2');
  });

  it('clears sidechain when "None" is selected', () => {
    const effect = makeCompressorEffect({ sidechainSourceTrackId: 'track-2' });
    render(<CompressorCard effect={effect} trackId={MOCK_TRACK_ID} />);

    const select = screen.getByTestId('sidechain-source-select');
    fireEvent.change(select, { target: { value: '' } });
    expect(mockSetSidechainSource).toHaveBeenCalledWith(MOCK_TRACK_ID, 'fx-1', undefined);
  });

  it('shows sidechain GR meter when sidechain is active', () => {
    const effect = makeCompressorEffect({ sidechainSourceTrackId: 'track-2' });
    render(<CompressorCard effect={effect} trackId={MOCK_TRACK_ID} />);

    const scLabels = screen.getAllByText('SC');
    // One is the "SC" label in header, the other is the sidechain GR meter
    expect(scLabels.length).toBeGreaterThanOrEqual(2);
  });

  it('hides sidechain GR meter when no sidechain source', () => {
    const effect = makeCompressorEffect();
    render(<CompressorCard effect={effect} trackId={MOCK_TRACK_ID} />);

    const scLabels = screen.getAllByText('SC');
    // Only the header "SC" label, no sidechain GR meter
    expect(scLabels.length).toBe(1);
  });

  it('starts animation frame loop for GR meter', () => {
    const effect = makeCompressorEffect();
    render(<CompressorCard effect={effect} trackId={MOCK_TRACK_ID} />);

    expect(globalThis.requestAnimationFrame).toHaveBeenCalled();
  });

  it('cancels animation frame on unmount', () => {
    const effect = makeCompressorEffect();
    const { unmount } = render(<CompressorCard effect={effect} trackId={MOCK_TRACK_ID} />);

    unmount();
    expect(globalThis.cancelAnimationFrame).toHaveBeenCalled();
  });
});
