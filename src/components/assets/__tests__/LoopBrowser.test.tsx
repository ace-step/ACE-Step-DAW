import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LoopBrowser } from '../LoopBrowser';
import { useUIStore } from '../../../store/uiStore';
import { useProjectStore } from '../../../store/projectStore';
import type { AssetClip } from '../../../types/project';

// Mock Tone.js
vi.mock('tone', () => ({
  start: vi.fn(),
  Player: vi.fn().mockImplementation(() => ({
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    dispose: vi.fn(),
  })),
  Gain: vi.fn().mockImplementation(() => ({
    toDestination: vi.fn().mockReturnThis(),
  })),
  ToneAudioBuffer: vi.fn(),
}));

vi.mock('../../../services/audioFileManager', () => ({
  loadAudioBlobByKey: vi.fn(),
}));

vi.mock('../../../hooks/useAudioEngine', () => ({
  getAudioEngine: vi.fn().mockReturnValue({
    resume: vi.fn(),
    ctx: {
      decodeAudioData: vi.fn().mockResolvedValue(new Float32Array()),
    },
  }),
}));

vi.mock('../../../engine/LoopLibrary', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../engine/LoopLibrary')>();
  return {
    ...original,
    loadLoop: vi.fn().mockResolvedValue({
      audioBuffer: new Float32Array(),
      waveformData: [0.5, 0.3, 0.8],
    }),
  };
});

vi.mock('../../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

function makeAsset(overrides: Partial<AssetClip> = {}): AssetClip {
  return {
    id: 'asset-1',
    clipId: 'clip-1',
    trackDisplayName: 'Drums',
    prompt: 'lofi drums',
    source: 'generated',
    isolatedAudioKey: 'key-1',
    cumulativeMixKey: null,
    waveformPeaks: [0.2, 0.5, 0.8],
    starred: false,
    createdAt: Date.now(),
    duration: 8,
    ...overrides,
  };
}

function setupStore(opts: { open?: boolean; assets?: AssetClip[] } = {}) {
  useUIStore.setState({
    loopBrowserOpen: opts.open ?? true,
    loopBrowserCategory: 'All',
    loopBrowserSearch: '',
    previewingLoopId: null,
  });

  useProjectStore.getState().createProject();
  if (opts.assets) {
    const project = useProjectStore.getState().project!;
    useProjectStore.setState({
      project: { ...project, assets: opts.assets },
    });
  }
}

describe('LoopBrowser', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useUIStore.setState({
      loopBrowserOpen: false,
      loopBrowserCategory: 'All',
      loopBrowserSearch: '',
      previewingLoopId: null,
    });
  });

  it('has zero width and opacity when closed', () => {
    setupStore({ open: false });

    const { container } = render(<LoopBrowser />);

    const panel = container.querySelector('[data-testid="loop-browser-panel"]');
    expect(panel).toBeTruthy();
    expect(panel!.getAttribute('style')).toContain('width: 0');
    expect(panel!.getAttribute('style')).toContain('opacity: 0');
  });

  it('renders with full width and opacity when open', () => {
    setupStore({ open: true });

    const { container } = render(<LoopBrowser />);

    const panel = container.querySelector('[data-testid="loop-browser-panel"]');
    expect(panel!.getAttribute('style')).toContain('opacity: 1');
  });

  it('renders Loop Library header', () => {
    setupStore({ open: true });

    render(<LoopBrowser />);

    expect(screen.getByText('Loop Library')).toBeInTheDocument();
  });

  it('renders search input', () => {
    setupStore({ open: true });

    render(<LoopBrowser />);

    expect(screen.getByPlaceholderText('Search loops...')).toBeInTheDocument();
  });

  it('renders Presets and My Loops tabs', () => {
    setupStore({ open: true });

    render(<LoopBrowser />);

    expect(screen.getByText('Presets')).toBeInTheDocument();
    expect(screen.getByText(/My Loops/)).toBeInTheDocument();
  });

  it('shows category pills on Presets tab', () => {
    setupStore({ open: true });

    render(<LoopBrowser />);

    // Category pills are buttons with rounded-full class
    const categories = ['Drums', 'Bass', 'Keys', 'Synth', 'FX', 'Vocals'];
    for (const cat of categories) {
      const buttons = screen.getAllByText(cat);
      const pill = buttons.find(
        (el) => el.tagName === 'BUTTON' && el.classList.contains('rounded-full'),
      );
      expect(pill).toBeTruthy();
    }
  });

  it('filters presets when category is clicked', () => {
    setupStore({ open: true });

    render(<LoopBrowser />);

    // Initially all presets are shown
    expect(screen.getByText('808 Boom')).toBeInTheDocument();

    // Click Bass category pill (the one with rounded-full class)
    const bassButtons = screen.getAllByText('Bass');
    const bassCategoryBtn = bassButtons.find(
      (el) => el.tagName === 'BUTTON' && el.classList.contains('rounded-full'),
    )!;
    fireEvent.click(bassCategoryBtn);

    // Drum presets should be filtered out
    expect(screen.queryByText('808 Boom')).not.toBeInTheDocument();
    // Bass presets should remain
    expect(screen.getByText('Sub Bass')).toBeInTheDocument();
  });

  it('filters presets by search text', () => {
    setupStore({ open: true });

    render(<LoopBrowser />);

    const searchInput = screen.getByPlaceholderText('Search loops...');
    fireEvent.change(searchInput, { target: { value: '808' } });

    expect(screen.getByText('808 Boom')).toBeInTheDocument();
    expect(screen.queryByText('Rock Steady')).not.toBeInTheDocument();
  });

  it('shows "No loops found" when no presets match', () => {
    setupStore({ open: true });

    render(<LoopBrowser />);

    const searchInput = screen.getByPlaceholderText('Search loops...');
    fireEvent.change(searchInput, { target: { value: 'zzz_nonexistent_zzz' } });

    expect(screen.getByText('No loops found')).toBeInTheDocument();
  });

  it('switches to My Loops tab', () => {
    setupStore({ open: true, assets: [makeAsset()] });

    render(<LoopBrowser />);

    fireEvent.click(screen.getByText(/My Loops/));

    // Should show filter pills for assets
    expect(screen.getByText('Imported')).toBeInTheDocument();
  });

  it('shows asset count badge in My Loops tab', () => {
    setupStore({ open: true, assets: [makeAsset(), makeAsset({ id: 'asset-2' })] });

    render(<LoopBrowser />);

    expect(screen.getByText('(2)')).toBeInTheDocument();
  });

  it('shows empty state in My Loops when no assets', () => {
    setupStore({ open: true, assets: [] });

    render(<LoopBrowser />);

    fireEvent.click(screen.getByText(/My Loops/));

    expect(screen.getByText('No loops yet')).toBeInTheDocument();
    expect(screen.getByText('Generate or import audio to see it here')).toBeInTheDocument();
  });

  it('filters My Loops by starred', () => {
    setupStore({
      open: true,
      assets: [
        makeAsset({ id: 'a1', prompt: 'starred one', starred: true }),
        makeAsset({ id: 'a2', prompt: 'normal one', starred: false }),
      ],
    });

    render(<LoopBrowser />);

    fireEvent.click(screen.getByText(/My Loops/));

    // Click the starred filter
    const starButtons = screen.getAllByText('\u2605');
    const starFilterBtn = starButtons.find(
      (el) => el.tagName === 'BUTTON' && el.classList.contains('rounded-full'),
    );
    if (starFilterBtn) fireEvent.click(starFilterBtn);

    expect(screen.getByText('starred one')).toBeInTheDocument();
    expect(screen.queryByText('normal one')).not.toBeInTheDocument();
  });

  it('shows item count in My Loops filter bar', () => {
    setupStore({
      open: true,
      assets: [makeAsset({ id: 'a1' }), makeAsset({ id: 'a2' })],
    });

    render(<LoopBrowser />);
    fireEvent.click(screen.getByText(/My Loops/));

    expect(screen.getByText('2 items')).toBeInTheDocument();
  });

  it('calls toggleLoopBrowser when close button is clicked', () => {
    const originalToggle = useUIStore.getState().toggleLoopBrowser;
    const toggleSpy = vi.fn();
    setupStore({ open: true });
    useUIStore.setState({ toggleLoopBrowser: toggleSpy });

    try {
      render(<LoopBrowser />);

      // The close button is in the header — it's the only button with an X SVG
      const header = screen.getByText('Loop Library').closest('div')!;
      const closeBtn = header.querySelector('button')!;
      fireEvent.click(closeBtn);

      expect(toggleSpy).toHaveBeenCalled();
    } finally {
      useUIStore.setState({ toggleLoopBrowser: originalToggle });
    }
  });

  it('filters My Loops by search text', () => {
    setupStore({
      open: true,
      assets: [
        makeAsset({ id: 'a1', prompt: 'funk bass line' }),
        makeAsset({ id: 'a2', prompt: 'ambient pad' }),
      ],
    });

    render(<LoopBrowser />);
    fireEvent.click(screen.getByText(/My Loops/));

    const searchInput = screen.getByPlaceholderText('Search loops...');
    fireEvent.change(searchInput, { target: { value: 'funk' } });

    expect(screen.getByText('funk bass line')).toBeInTheDocument();
    expect(screen.queryByText('ambient pad')).not.toBeInTheDocument();
  });
});
