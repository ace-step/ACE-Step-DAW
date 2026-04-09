import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AssetsPanel } from '../AssetsPanel';
import { useProjectStore } from '../../../store/projectStore';
import { useUIStore } from '../../../store/uiStore';
import type { AssetClip } from '../../../types/project';

vi.mock('../../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

function makeAsset(overrides: Partial<AssetClip> = {}): AssetClip {
  return {
    id: 'asset-1',
    clipId: 'clip-1',
    trackDisplayName: 'Drums',
    prompt: 'lofi drum loop',
    source: 'generated',
    isolatedAudioKey: null,
    cumulativeMixKey: null,
    waveformPeaks: [0.2, 0.5, 0.8, 0.3],
    starred: false,
    createdAt: Date.now(),
    duration: 8,
    ...overrides,
  };
}

function setupProject(assets: AssetClip[] = []) {
  useProjectStore.getState().createProject();
  const project = useProjectStore.getState().project!;
  useProjectStore.setState({
    project: { ...project, assets },
  });
}

describe('AssetsPanel', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useUIStore.setState({
      showLibrary: true,
      assetsPanelWidth: 240,
    });
  });

  it('renders nothing when showLibrary is false', () => {
    useUIStore.setState({ showLibrary: false });
    setupProject([makeAsset()]);

    const { container } = render(<AssetsPanel />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when project is null', () => {
    useUIStore.setState({ showLibrary: true });

    const { container } = render(<AssetsPanel />);
    expect(container.innerHTML).toBe('');
  });

  it('renders the Library header and search input', () => {
    setupProject([]);

    render(<AssetsPanel />);

    expect(screen.getByText('Library')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search loops...')).toBeInTheDocument();
  });

  it('shows filter buttons: All, starred, AI, Imported', () => {
    setupProject([]);

    render(<AssetsPanel />);

    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('★')).toBeInTheDocument();
    expect(screen.getByText('AI')).toBeInTheDocument();
    expect(screen.getByText('Imported')).toBeInTheDocument();
  });

  it('shows "No matching loops" when empty', () => {
    setupProject([]);

    render(<AssetsPanel />);

    expect(screen.getByText('No matching loops')).toBeInTheDocument();
  });

  it('displays asset items with prompt, track name, and duration', () => {
    setupProject([
      makeAsset({ id: 'a1', prompt: 'jazzy piano riff', trackDisplayName: 'Piano', duration: 12 }),
    ]);

    render(<AssetsPanel />);

    expect(screen.getByText('jazzy piano riff')).toBeInTheDocument();
    expect(screen.getByText('Piano')).toBeInTheDocument();
    expect(screen.getByText('0:12')).toBeInTheDocument();
  });

  it('displays trackDisplayName when prompt is empty', () => {
    setupProject([
      makeAsset({ id: 'a1', prompt: '', trackDisplayName: 'Bass Line' }),
    ]);

    render(<AssetsPanel />);

    // The truncate span should show "Bass Line" as fallback (first occurrence is the title)
    const bassElements = screen.getAllByText('Bass Line');
    expect(bassElements.length).toBeGreaterThanOrEqual(1);
  });

  it('shows correct item count', () => {
    setupProject([
      makeAsset({ id: 'a1' }),
      makeAsset({ id: 'a2', clipId: 'clip-2' }),
      makeAsset({ id: 'a3', clipId: 'clip-3' }),
    ]);

    render(<AssetsPanel />);

    expect(screen.getByText('3 items')).toBeInTheDocument();
  });

  it('filters by search text matching prompt', () => {
    setupProject([
      makeAsset({ id: 'a1', prompt: 'jazz piano', trackDisplayName: 'Piano' }),
      makeAsset({ id: 'a2', prompt: 'rock drums', trackDisplayName: 'Drums' }),
    ]);

    render(<AssetsPanel />);

    const searchInput = screen.getByPlaceholderText('Search loops...');
    fireEvent.change(searchInput, { target: { value: 'jazz' } });

    expect(screen.getByText('jazz piano')).toBeInTheDocument();
    expect(screen.queryByText('rock drums')).not.toBeInTheDocument();
    expect(screen.getByText('1 items')).toBeInTheDocument();
  });

  it('filters by search text matching trackDisplayName', () => {
    setupProject([
      makeAsset({ id: 'a1', prompt: 'loop one', trackDisplayName: 'Synth Lead' }),
      makeAsset({ id: 'a2', prompt: 'loop two', trackDisplayName: 'Bass' }),
    ]);

    render(<AssetsPanel />);

    const searchInput = screen.getByPlaceholderText('Search loops...');
    fireEvent.change(searchInput, { target: { value: 'synth' } });

    expect(screen.getByText('loop one')).toBeInTheDocument();
    expect(screen.queryByText('loop two')).not.toBeInTheDocument();
  });

  it('filters starred assets', () => {
    setupProject([
      makeAsset({ id: 'a1', prompt: 'starred loop', starred: true }),
      makeAsset({ id: 'a2', prompt: 'normal loop', starred: false }),
    ]);

    render(<AssetsPanel />);

    // Click the ★ filter button (not the star on an asset row)
    const starButtons = screen.getAllByText('★');
    const starFilterBtn = starButtons.find(
      (el) => el.tagName === 'BUTTON' && el.classList.contains('px-2'),
    )!;
    fireEvent.click(starFilterBtn);

    expect(screen.getByText('starred loop')).toBeInTheDocument();
    expect(screen.queryByText('normal loop')).not.toBeInTheDocument();
  });

  it('filters AI-generated assets', () => {
    setupProject([
      makeAsset({ id: 'a1', prompt: 'ai loop', source: 'generated' }),
      makeAsset({ id: 'a2', prompt: 'user loop', source: 'uploaded' }),
    ]);

    render(<AssetsPanel />);

    // Click the AI filter button (not the badge) — filter buttons are in the flex-wrap container
    const filterButtons = screen.getAllByText('AI');
    // The filter button is the one inside the filter bar (button element)
    const aiFilterBtn = filterButtons.find(
      (el) => el.tagName === 'BUTTON' && el.textContent === 'AI',
    )!;
    fireEvent.click(aiFilterBtn);

    expect(screen.getByText('ai loop')).toBeInTheDocument();
    expect(screen.queryByText('user loop')).not.toBeInTheDocument();
  });

  it('filters imported/uploaded assets', () => {
    setupProject([
      makeAsset({ id: 'a1', prompt: 'ai loop', source: 'generated' }),
      makeAsset({ id: 'a2', prompt: 'user upload', source: 'uploaded' }),
    ]);

    render(<AssetsPanel />);

    fireEvent.click(screen.getByText('Imported'));

    expect(screen.queryByText('ai loop')).not.toBeInTheDocument();
    expect(screen.getByText('user upload')).toBeInTheDocument();
  });

  it('shows source badge: AI for generated, arrow for uploaded', () => {
    setupProject([
      makeAsset({ id: 'a1', prompt: 'gen loop', source: 'generated' }),
      makeAsset({ id: 'a2', prompt: 'imp loop', source: 'uploaded' }),
    ]);

    render(<AssetsPanel />);

    // The source badges — "AI" badge for generated, "↑" badge for uploaded
    const badges = screen.getAllByText((content, element) => {
      return element?.tagName === 'SPAN' && (content === 'AI' || content === '↑');
    });
    expect(badges.length).toBe(2);
  });

  it('calls toggleAssetStar when star button is clicked', () => {
    const originalToggle = useProjectStore.getState().toggleAssetStar;
    const toggleSpy = vi.fn();
    setupProject([makeAsset({ id: 'a1', starred: false })]);
    useProjectStore.setState({ toggleAssetStar: toggleSpy });

    try {
      render(<AssetsPanel />);
      fireEvent.click(screen.getByTitle('Star'));
      expect(toggleSpy).toHaveBeenCalledWith('a1');
    } finally {
      useProjectStore.setState({ toggleAssetStar: originalToggle });
    }
  });

  it('calls removeAsset when delete button is clicked', () => {
    const originalRemove = useProjectStore.getState().removeAsset;
    const removeSpy = vi.fn();
    setupProject([makeAsset({ id: 'a1' })]);
    useProjectStore.setState({ removeAsset: removeSpy });

    try {
      render(<AssetsPanel />);
      fireEvent.click(screen.getByTitle('Remove'));
      expect(removeSpy).toHaveBeenCalledWith('a1');
    } finally {
      useProjectStore.setState({ removeAsset: originalRemove });
    }
  });

  it('shows filled star for starred assets', () => {
    setupProject([makeAsset({ id: 'a1', starred: true })]);

    render(<AssetsPanel />);

    expect(screen.getByTitle('Remove star')).toBeInTheDocument();
  });

  it('formats duration correctly for multi-minute clips', () => {
    setupProject([
      makeAsset({ id: 'a1', duration: 125 }),  // 2:05
    ]);

    render(<AssetsPanel />);

    expect(screen.getByText('2:05')).toBeInTheDocument();
  });

  it('applies reduced opacity for assets whose clips are deleted from the timeline', () => {
    // getClipById returns null for deleted clips
    const getClipByIdMock = vi.fn().mockReturnValue(null);
    setupProject([makeAsset({ id: 'a1', clipId: 'deleted-clip' })]);
    useProjectStore.setState({ getClipById: getClipByIdMock });

    const { container } = render(<AssetsPanel />);

    // The asset row should have opacity-50
    const opacityRow = container.querySelector('.opacity-50');
    expect(opacityRow).toBeTruthy();
  });
});
