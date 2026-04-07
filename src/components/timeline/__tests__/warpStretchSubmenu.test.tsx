import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ClipContextMenu } from '../ClipContextMenu';
import type { Clip } from '../../../types/project';

vi.mock('../../../store/projectStore', () => ({
  useProjectStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) => {
    const state = {
      setClipStretchMode: vi.fn(),
      tempoMatchClip: vi.fn(),
      resetWarp: vi.fn(),
      setClipPitchShift: vi.fn(),
    };
    return selector(state);
  }),
}));

vi.mock('../../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

const noop = () => {};

function makeClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: 'clip-1',
    trackId: 'track-1',
    startTime: 0,
    duration: 4,
    prompt: 'test',
    lyrics: '',
    generationStatus: 'ready',
    generationJobId: null,
    cumulativeMixKey: 'audio-key',
    isolatedAudioKey: null,
    waveformPeaks: [0.1, 0.2, 0.3, 0.4, 0.5],
    ...overrides,
  };
}

describe('ClipContextMenu — Warp & Stretch submenu', () => {
  it('shows "Warp & Stretch" entry for audio clips', () => {
    render(
      <ClipContextMenu
        x={100}
        y={100}
        onClose={noop}
        onInspireMe={noop}
        onAddLayer={noop}
        onMusicEnhancer={noop}
        onEdit={noop}
        onDuplicate={noop}
        onSplitAtPlayhead={noop}
        onConsolidate={noop}
        onDelete={noop}
        onSelectAll={noop}
        onLoopSelection={noop}
        onToggleMute={noop}
        isMuted={false}
        onAssignColor={noop}
        onResetColor={noop}
        hasCustomColor={false}
        canConsolidate={false}
        isMidiClip={false}
        clip={makeClip()}
      />,
    );
    expect(screen.getByText('Warp & Stretch')).toBeTruthy();
  });

  it('does NOT show "Warp & Stretch" for MIDI clips', () => {
    render(
      <ClipContextMenu
        x={100}
        y={100}
        onClose={noop}
        onInspireMe={noop}
        onAddLayer={noop}
        onMusicEnhancer={noop}
        onEdit={noop}
        onDuplicate={noop}
        onSplitAtPlayhead={noop}
        onConsolidate={noop}
        onDelete={noop}
        onSelectAll={noop}
        onLoopSelection={noop}
        onToggleMute={noop}
        isMuted={false}
        onAssignColor={noop}
        onResetColor={noop}
        hasCustomColor={false}
        canConsolidate={false}
        isMidiClip={true}
        clip={makeClip()}
      />,
    );
    expect(screen.queryByText('Warp & Stretch')).toBeNull();
  });

  it('does NOT show "Warp & Stretch" when no clip prop is given', () => {
    render(
      <ClipContextMenu
        x={100}
        y={100}
        onClose={noop}
        onInspireMe={noop}
        onAddLayer={noop}
        onMusicEnhancer={noop}
        onEdit={noop}
        onDuplicate={noop}
        onSplitAtPlayhead={noop}
        onConsolidate={noop}
        onDelete={noop}
        onSelectAll={noop}
        onLoopSelection={noop}
        onToggleMute={noop}
        isMuted={false}
        onAssignColor={noop}
        onResetColor={noop}
        hasCustomColor={false}
        canConsolidate={false}
        isMidiClip={false}
      />,
    );
    expect(screen.queryByText('Warp & Stretch')).toBeNull();
  });
});
