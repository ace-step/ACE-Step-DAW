import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  MiniWaveform,
  SvgMiniWaveform,
  fmtDuration,
  PresetLoopItem,
  AssetLoopItem,
} from '../LoopBrowserItems';
import type { LoopDefinition } from '../../../engine/LoopLibrary';
import type { AssetClip } from '../../../types/project';

function makePresetDef(overrides: Partial<LoopDefinition> = {}): LoopDefinition {
  return {
    id: 'loop-test',
    name: 'Test Loop',
    category: 'Drums',
    bpm: 120,
    bars: 4,
    description: 'A test loop',
    generate: vi.fn(),
    ...overrides,
  };
}

function makeAsset(overrides: Partial<AssetClip> = {}): AssetClip {
  return {
    id: 'asset-1',
    clipId: 'clip-1',
    trackDisplayName: 'Drums',
    prompt: 'lofi drums',
    source: 'generated',
    isolatedAudioKey: null,
    cumulativeMixKey: null,
    waveformPeaks: [0.2, 0.5, 0.8],
    starred: false,
    createdAt: Date.now(),
    duration: 8,
    ...overrides,
  };
}

// ── fmtDuration ───────────────────────────────────────────────

describe('fmtDuration', () => {
  it('formats 0 seconds as 0:00', () => {
    expect(fmtDuration(0)).toBe('0:00');
  });

  it('formats seconds under one minute', () => {
    expect(fmtDuration(5)).toBe('0:05');
    expect(fmtDuration(59)).toBe('0:59');
  });

  it('formats multi-minute durations with zero-padded seconds', () => {
    expect(fmtDuration(60)).toBe('1:00');
    expect(fmtDuration(125)).toBe('2:05');
    expect(fmtDuration(600)).toBe('10:00');
  });

  it('floors fractional seconds', () => {
    expect(fmtDuration(3.7)).toBe('0:03');
    expect(fmtDuration(61.99)).toBe('1:01');
  });
});

// ── MiniWaveform (canvas-based) ───────────────────────────────

describe('MiniWaveform', () => {
  it('renders a canvas element with aria-label', () => {
    render(<MiniWaveform data={[0.5, 0.8, 0.3]} color="#8b5cf6" />);
    const canvas = screen.getByRole('img', { name: 'Loop waveform preview' });
    expect(canvas).toBeInTheDocument();
    expect(canvas.tagName).toBe('CANVAS');
  });

  it('renders with null data without crashing', () => {
    render(<MiniWaveform data={null} color="#ff0000" />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('renders with empty array without crashing', () => {
    render(<MiniWaveform data={[]} color="#ff0000" />);
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('applies custom height', () => {
    render(<MiniWaveform data={[0.5]} color="#ff0000" height={40} />);
    const canvas = screen.getByRole('img');
    expect(canvas).toHaveStyle({ height: '40px' });
  });
});

// ── SvgMiniWaveform ───────────────────────────────────────────

describe('SvgMiniWaveform', () => {
  it('renders SVG bars from peaks data', () => {
    const { container } = render(<SvgMiniWaveform peaks={[0.5, 0.8, 0.3]} color="#6b7280" />);
    const rects = container.querySelectorAll('rect');
    expect(rects.length).toBe(3);
  });

  it('renders a fallback div when peaks is null', () => {
    const { container } = render(<SvgMiniWaveform peaks={null} color="#6b7280" />);
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('div')).toBeTruthy();
  });

  it('renders a fallback div when peaks is empty', () => {
    const { container } = render(<SvgMiniWaveform peaks={[]} color="#6b7280" />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('sets correct bar heights proportional to peak values', () => {
    const { container } = render(<SvgMiniWaveform peaks={[1.0]} color="#aaa" />);
    const rect = container.querySelector('rect')!;
    const height = parseFloat(rect.getAttribute('height')!);
    // With peak=1.0, height = max(1.0 * (20-2), 0.5) = 18
    expect(height).toBe(18);
  });
});

// ── PresetLoopItem ────────────────────────────────────────────

describe('PresetLoopItem', () => {
  it('renders loop name and category', () => {
    const def = makePresetDef({ name: 'Funky Bass', category: 'Bass', bpm: 110 });
    render(
      <PresetLoopItem
        def={def}
        isPreviewing={false}
        onPreview={vi.fn()}
        onDragStart={vi.fn()}
      />,
    );

    expect(screen.getByText('Funky Bass')).toBeInTheDocument();
    expect(screen.getByText('Bass')).toBeInTheDocument();
    expect(screen.getByText('110')).toBeInTheDocument();
  });

  it('renders key when provided', () => {
    const def = makePresetDef({ key: 'Am' });
    render(
      <PresetLoopItem
        def={def}
        isPreviewing={false}
        onPreview={vi.fn()}
        onDragStart={vi.fn()}
      />,
    );

    expect(screen.getByText('Am')).toBeInTheDocument();
  });

  it('does not render key when not provided', () => {
    const def = makePresetDef({ key: undefined });
    render(
      <PresetLoopItem
        def={def}
        isPreviewing={false}
        onPreview={vi.fn()}
        onDragStart={vi.fn()}
      />,
    );

    expect(screen.queryByText('Am')).not.toBeInTheDocument();
  });

  it('calls onPreview when play button is clicked', () => {
    const onPreview = vi.fn();
    const def = makePresetDef();
    render(
      <PresetLoopItem
        def={def}
        isPreviewing={false}
        onPreview={onPreview}
        onDragStart={vi.fn()}
      />,
    );

    // The play button is the only button in the component
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);

    expect(onPreview).toHaveBeenCalledWith(def);
  });

  it('is draggable and calls onDragStart', () => {
    const onDragStart = vi.fn();
    const def = makePresetDef();
    const { container } = render(
      <PresetLoopItem
        def={def}
        isPreviewing={false}
        onPreview={vi.fn()}
        onDragStart={onDragStart}
      />,
    );

    const draggable = container.querySelector('[draggable="true"]')!;
    fireEvent.dragStart(draggable);

    expect(onDragStart).toHaveBeenCalled();
  });

  it('shows stop icon when previewing', () => {
    const def = makePresetDef();
    const { container } = render(
      <PresetLoopItem
        def={def}
        isPreviewing={true}
        onPreview={vi.fn()}
        onDragStart={vi.fn()}
      />,
    );

    // When previewing, the button should have violet background
    const previewBtn = container.querySelector('.bg-violet-500');
    expect(previewBtn).toBeTruthy();
  });

  it('applies correct category color for Drums', () => {
    const def = makePresetDef({ category: 'Drums' });
    const { container } = render(
      <PresetLoopItem
        def={def}
        isPreviewing={false}
        onPreview={vi.fn()}
        onDragStart={vi.fn()}
      />,
    );

    const badge = container.querySelector('.bg-orange-500\\/20');
    expect(badge).toBeTruthy();
  });

  it('applies correct category color for Keys', () => {
    const def = makePresetDef({ category: 'Keys' });
    const { container } = render(
      <PresetLoopItem
        def={def}
        isPreviewing={false}
        onPreview={vi.fn()}
        onDragStart={vi.fn()}
      />,
    );

    const badge = container.querySelector('.bg-green-500\\/20');
    expect(badge).toBeTruthy();
  });
});

// ── AssetLoopItem ─────────────────────────────────────────────

describe('AssetLoopItem', () => {
  it('renders asset prompt, track name, and duration', () => {
    const asset = makeAsset({ prompt: 'chill beat', trackDisplayName: 'Lo-Fi', duration: 16 });
    render(
      <AssetLoopItem
        asset={asset}
        isPreviewing={false}
        onPreview={vi.fn()}
        onStar={vi.fn()}
        onDelete={vi.fn()}
        onDragStart={vi.fn()}
      />,
    );

    expect(screen.getByText('chill beat')).toBeInTheDocument();
    expect(screen.getByText('Lo-Fi')).toBeInTheDocument();
    expect(screen.getByText('0:16')).toBeInTheDocument();
  });

  it('shows AI badge for generated assets', () => {
    const asset = makeAsset({ source: 'generated' });
    render(
      <AssetLoopItem
        asset={asset}
        isPreviewing={false}
        onPreview={vi.fn()}
        onStar={vi.fn()}
        onDelete={vi.fn()}
        onDragStart={vi.fn()}
      />,
    );

    // "AI" source badge
    const aiBadge = screen.getByText('AI');
    expect(aiBadge).toBeInTheDocument();
  });

  it('shows IMP badge for uploaded assets', () => {
    const asset = makeAsset({ source: 'uploaded' });
    render(
      <AssetLoopItem
        asset={asset}
        isPreviewing={false}
        onPreview={vi.fn()}
        onStar={vi.fn()}
        onDelete={vi.fn()}
        onDragStart={vi.fn()}
      />,
    );

    expect(screen.getByText('IMP')).toBeInTheDocument();
  });

  it('calls onPreview when play button is clicked', () => {
    const onPreview = vi.fn();
    const asset = makeAsset();
    render(
      <AssetLoopItem
        asset={asset}
        isPreviewing={false}
        onPreview={onPreview}
        onStar={vi.fn()}
        onDelete={vi.fn()}
        onDragStart={vi.fn()}
      />,
    );

    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);

    expect(onPreview).toHaveBeenCalledWith(asset);
  });

  it('calls onStar with asset id', () => {
    const onStar = vi.fn();
    const asset = makeAsset({ id: 'asset-42', starred: false });
    render(
      <AssetLoopItem
        asset={asset}
        isPreviewing={false}
        onPreview={vi.fn()}
        onStar={onStar}
        onDelete={vi.fn()}
        onDragStart={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTitle('Star'));

    expect(onStar).toHaveBeenCalledWith(expect.any(Object), 'asset-42');
  });

  it('calls onDelete with asset id', () => {
    const onDelete = vi.fn();
    const asset = makeAsset({ id: 'asset-99' });
    render(
      <AssetLoopItem
        asset={asset}
        isPreviewing={false}
        onPreview={vi.fn()}
        onStar={vi.fn()}
        onDelete={onDelete}
        onDragStart={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTitle('Remove'));

    expect(onDelete).toHaveBeenCalledWith(expect.any(Object), 'asset-99');
  });

  it('shows filled star for starred assets', () => {
    const asset = makeAsset({ starred: true });
    render(
      <AssetLoopItem
        asset={asset}
        isPreviewing={false}
        onPreview={vi.fn()}
        onStar={vi.fn()}
        onDelete={vi.fn()}
        onDragStart={vi.fn()}
      />,
    );

    expect(screen.getByTitle('Remove star')).toBeInTheDocument();
  });

  it('is draggable', () => {
    const onDragStart = vi.fn();
    const asset = makeAsset();
    const { container } = render(
      <AssetLoopItem
        asset={asset}
        isPreviewing={false}
        onPreview={vi.fn()}
        onStar={vi.fn()}
        onDelete={vi.fn()}
        onDragStart={onDragStart}
      />,
    );

    const draggable = container.querySelector('[draggable="true"]')!;
    fireEvent.dragStart(draggable);

    expect(onDragStart).toHaveBeenCalled();
  });

  it('renders SVG mini waveform with peaks', () => {
    const asset = makeAsset({ waveformPeaks: [0.2, 0.5, 0.8, 0.3] });
    const { container } = render(
      <AssetLoopItem
        asset={asset}
        isPreviewing={false}
        onPreview={vi.fn()}
        onStar={vi.fn()}
        onDelete={vi.fn()}
        onDragStart={vi.fn()}
      />,
    );

    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    const rects = container.querySelectorAll('rect');
    expect(rects.length).toBe(4);
  });
});
