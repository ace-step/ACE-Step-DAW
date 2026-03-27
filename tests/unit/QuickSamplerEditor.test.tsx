import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuickSamplerEditor } from '../../src/components/pianoroll/QuickSamplerEditor';
import type { SamplerConfig, Track } from '../../src/types/project';

vi.mock('../../src/engine/SamplerEngine', () => ({
  samplerEngine: {
    previewTrackNote: vi.fn(),
  },
}));

function makeTrack(overrides?: Partial<Track>): Track {
  return {
    id: 'track-1',
    trackType: 'pianoRoll',
    trackName: 'custom',
    displayName: 'Test Sampler',
    color: '#ff9800',
    order: 0,
    volume: 0.8,
    muted: false,
    soloed: false,
    clips: [],
    synthPreset: 'sampler',
    sampler: {
      audioKey: 'audio:test-key',
      sampleName: 'Test Sound',
      rootNote: 60,
      sampleDuration: 2.0,
    },
    samplerConfig: {
      audioKey: 'audio:test-key',
      rootNote: 60,
      trimStart: 0,
      trimEnd: 2.0,
      playbackMode: 'classic',
      loopStart: 0,
      loopEnd: 2.0,
      attack: 0.005,
      decay: 0.1,
      sustain: 1,
      release: 0.3,
    },
    ...overrides,
  };
}

describe('QuickSamplerEditor', () => {
  const onSamplerConfigChange = vi.fn();
  const onSamplerSettingsChange = vi.fn();
  const onClear = vi.fn();
  const onLoadSample = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderEditor(track?: Track) {
    return render(
      <QuickSamplerEditor
        track={track ?? makeTrack()}
        onSamplerConfigChange={onSamplerConfigChange}
        onSamplerSettingsChange={onSamplerSettingsChange}
        onClear={onClear}
        onLoadSample={onLoadSample}
      />,
    );
  }

  it('renders the Quick Sampler heading', () => {
    renderEditor();
    expect(screen.getByText('Quick Sampler')).toBeInTheDocument();
  });

  it('shows sample name when loaded', () => {
    renderEditor();
    expect(screen.getByText('Test Sound')).toBeInTheDocument();
  });

  it('shows root note input', () => {
    renderEditor();
    const rootInput = screen.getByLabelText('Sampler root note');
    expect(rootInput).toBeInTheDocument();
    expect((rootInput as HTMLInputElement).value).toBe('60');
  });

  it('shows playback mode selector', () => {
    renderEditor();
    const modeSelect = screen.getByLabelText('Quick Sampler playback mode');
    expect(modeSelect).toBeInTheDocument();
    expect((modeSelect as HTMLSelectElement).value).toBe('classic');
  });

  it('calls onSamplerConfigChange when root note changes', () => {
    renderEditor();
    const rootInput = screen.getByLabelText('Sampler root note');
    fireEvent.change(rootInput, { target: { value: '48' } });
    expect(onSamplerConfigChange).toHaveBeenCalledWith(expect.objectContaining({ rootNote: 48 }));
  });

  it('calls onSamplerConfigChange when playback mode changes', () => {
    renderEditor();
    const modeSelect = screen.getByLabelText('Quick Sampler playback mode');
    fireEvent.change(modeSelect, { target: { value: 'oneShot' } });
    expect(onSamplerConfigChange).toHaveBeenCalledWith(expect.objectContaining({ playbackMode: 'oneShot' }));
  });

  it('shows ADSR controls', () => {
    renderEditor();
    expect(screen.getByLabelText('Attack')).toBeInTheDocument();
    expect(screen.getByLabelText('Decay')).toBeInTheDocument();
    expect(screen.getByLabelText('Sustain')).toBeInTheDocument();
    expect(screen.getByLabelText('Release')).toBeInTheDocument();
  });

  it('shows preview button', () => {
    renderEditor();
    expect(screen.getByLabelText('Preview quick sampler root note')).toBeInTheDocument();
  });

  it('shows audition keyboard keys', () => {
    renderEditor();
    expect(screen.getByTestId('audition-keyboard')).toBeInTheDocument();
  });

  it('shows trim controls', () => {
    renderEditor();
    expect(screen.getByLabelText('Quick Sampler trim start')).toBeInTheDocument();
    expect(screen.getByLabelText('Quick Sampler trim end')).toBeInTheDocument();
  });

  it('shows loop controls when mode is loop', () => {
    const track = makeTrack();
    track.samplerConfig!.playbackMode = 'loop';
    renderEditor(track);
    expect(screen.getByLabelText('Quick Sampler loop start')).toBeInTheDocument();
    expect(screen.getByLabelText('Quick Sampler loop end')).toBeInTheDocument();
  });

  it('hides loop controls when mode is classic', () => {
    renderEditor();
    expect(screen.queryByLabelText('Quick Sampler loop start')).toBeNull();
    expect(screen.queryByLabelText('Quick Sampler loop end')).toBeNull();
  });

  it('shows empty state when no sample is loaded', () => {
    const track = makeTrack({
      sampler: { rootNote: 60 },
      samplerConfig: undefined,
    });
    renderEditor(track);
    expect(screen.getByText(/Drop audio here/i)).toBeInTheDocument();
  });

  it('shows Load Sample button', () => {
    renderEditor();
    fireEvent.click(screen.getByText('Swap Sample'));
    expect(onLoadSample).toHaveBeenCalled();
  });

  it('calls onClear when Clear button clicked', () => {
    renderEditor();
    fireEvent.click(screen.getByLabelText(/Clear sampler source/));
    expect(onClear).toHaveBeenCalled();
  });
});
