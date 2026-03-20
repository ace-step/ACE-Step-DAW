import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PianoRoll } from '../../src/components/pianoroll/PianoRoll';
import { useProjectStore } from '../../src/store/projectStore';
import { useUIStore } from '../../src/store/uiStore';
import { useTransportStore } from '../../src/store/transportStore';

vi.mock('../../src/hooks/useAudioImport', () => ({
  useAudioImport: () => ({
    importAudioFileAsSampler: vi.fn(),
    importAssetAsQuickSampler: vi.fn(),
    openSamplerFilePicker: vi.fn(),
  }),
}));

vi.mock('../../src/components/pianoroll/PianoRollCanvas', () => ({
  PianoRollCanvas: () => <div aria-label="Piano roll canvas stub">canvas</div>,
}));

vi.mock('../../src/components/pianoroll/QuickSamplerEditor', () => ({
  QuickSamplerEditor: () => <div>sampler</div>,
}));

vi.mock('../../src/components/pianoroll/GeneratePatternDialog', () => ({
  GeneratePatternDialog: () => null,
}));

vi.mock('../../src/components/pianoroll/QuantizeDialog', () => ({
  QuantizeDialog: () => null,
}));

vi.mock('../../src/components/pianoroll/TransformMenu', () => ({
  TransformMenu: () => <div>transform</div>,
}));

describe('Piano roll background colors (#554)', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useTransportStore.setState(useTransportStore.getInitialState(), true);

    useProjectStore.getState().createProject({ name: 'BG Test' });
    const track = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
    const clip = useProjectStore.getState().ensureMidiClip(track.id);
    useUIStore.getState().setOpenPianoRoll(track.id, clip.id);
  });

  it('uses neutral gray background (#1a1a1e) on the container instead of dark blue (#0a0a1e)', () => {
    render(<PianoRoll />);
    const container = screen.getByRole('region');
    // The container should have the neutral gray background class, not the old dark blue
    expect(container.className).toContain('bg-[#1a1a1e]');
    expect(container.className).not.toContain('bg-[#0a0a1e]');
  });

  it('uses neutral gray background (#1e1e22) on the toolbar instead of dark blue (#0e0e24)', () => {
    render(<PianoRoll />);
    const container = screen.getByRole('region');
    // The toolbar is the first div with border-b inside the container (after the resize handle)
    const toolbar = container.querySelector('.border-b');
    expect(toolbar).not.toBeNull();
    expect(toolbar!.className).toContain('bg-[#1e1e22]');
    expect(toolbar!.className).not.toContain('bg-[#0e0e24]');
  });
});

describe('PianoRollCanvas background fill', () => {
  it('uses neutral gray (#1a1a1e) as the canvas background fill color', async () => {
    // Verify the source code uses the correct color by importing the module
    // We read the actual source to confirm the canvas fill color
    const source = await import('../../src/components/pianoroll/PianoRollCanvas?raw');
    const code = typeof source === 'string' ? source : source.default;
    expect(code).toContain("'#1a1a1e'");
    expect(code).not.toContain("'#0a0a1e'");
  });
});
