import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ClipStatusOverlay } from '../ClipStatusOverlay';
import type { Clip } from '../../../types/project';

vi.mock('../../../services/generationPipeline', () => ({
  regenerateClip: vi.fn(),
}));

function makeClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: 'clip-1',
    trackId: 'track-1',
    startTime: 0,
    duration: 4,
    prompt: '',
    lyrics: '',
    generationStatus: 'ready',
    generationJobId: null,
    cumulativeMixKey: null,
    isolatedAudioKey: null,
    waveformPeaks: null,
    ...overrides,
  };
}

describe('ClipStatusOverlay', () => {
  it('shows nothing for ready clips without metadata', () => {
    const { container } = render(
      <ClipStatusOverlay clip={makeClip()} generatingProgress={null} isMidiClip={false} />,
    );
    expect(container.textContent).toBe('');
  });

  it('shows "Queued" label when clip is queued with null progress', () => {
    render(
      <ClipStatusOverlay
        clip={makeClip({ generationStatus: 'queued' })}
        generatingProgress={null}
        isMidiClip={false}
      />,
    );
    expect(screen.getByText('Queued')).toBeTruthy();
  });

  it('shows "Queued" label even when generatingProgress is non-null for queued clips', () => {
    // In ClipBlock, the selector may return a progress string for queued jobs
    render(
      <ClipStatusOverlay
        clip={makeClip({ generationStatus: 'queued' })}
        generatingProgress="Queued"
        isMidiClip={false}
      />,
    );
    expect(screen.getByText('Queued')).toBeTruthy();
  });

  it('shows spinner and progress during generation', () => {
    render(
      <ClipStatusOverlay
        clip={makeClip({ generationStatus: 'generating' })}
        generatingProgress="Generating 45%"
        isMidiClip={false}
      />,
    );
    expect(screen.getByText('Generating 45%')).toBeTruthy();
  });

  it('shows error message and retry button for failed clips', () => {
    render(
      <ClipStatusOverlay
        clip={makeClip({ generationStatus: 'error', errorMessage: 'Server timeout' })}
        generatingProgress={null}
        isMidiClip={false}
      />,
    );
    expect(screen.getByText('Server timeout')).toBeTruthy();
    expect(screen.getByText('Retry')).toBeTruthy();
  });

  it('shows default error message when errorMessage is empty', () => {
    render(
      <ClipStatusOverlay
        clip={makeClip({ generationStatus: 'error' })}
        generatingProgress={null}
        isMidiClip={false}
      />,
    );
    expect(screen.getByText('Generation failed')).toBeTruthy();
  });

  it('retry button triggers regenerateClip', async () => {
    const { regenerateClip } = await import('../../../services/generationPipeline');
    render(
      <ClipStatusOverlay
        clip={makeClip({ generationStatus: 'error', errorMessage: 'Failed' })}
        generatingProgress={null}
        isMidiClip={false}
      />,
    );
    fireEvent.click(screen.getByText('Retry'));
    expect(regenerateClip).toHaveBeenCalledWith('clip-1');
  });

  it('retry button stops mouseDown propagation to prevent clip drag', () => {
    render(
      <ClipStatusOverlay
        clip={makeClip({ generationStatus: 'error', errorMessage: 'Failed' })}
        generatingProgress={null}
        isMidiClip={false}
      />,
    );
    const retryBtn = screen.getByText('Retry');
    const mouseDownEvent = new MouseEvent('mousedown', { bubbles: true });
    const stopProp = vi.spyOn(mouseDownEvent, 'stopPropagation');
    retryBtn.dispatchEvent(mouseDownEvent);
    expect(stopProp).toHaveBeenCalled();
  });

  it('shows inferred metadata for ready clips', () => {
    render(
      <ClipStatusOverlay
        clip={makeClip({
          generationStatus: 'ready',
          inferredMetas: { bpm: 120, keyScale: 'C Major' },
        })}
        generatingProgress={null}
        isMidiClip={false}
      />,
    );
    expect(screen.getByText('120bpm | C Major')).toBeTruthy();
  });

  it('shows MIDI clip indicator', () => {
    render(
      <ClipStatusOverlay
        clip={makeClip({ generationStatus: 'ready' })}
        generatingProgress={null}
        isMidiClip={true}
      />,
    );
    expect(screen.getByText(/MIDI clip/)).toBeTruthy();
  });
});
