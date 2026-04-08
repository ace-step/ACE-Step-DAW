import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChannelStripPresetBrowser } from '../ChannelStripPresetBrowser';
import { useProjectStore } from '../../../store/projectStore';
import { addPresetToLibrary, getFactoryPresets } from '../../../services/channelStripPresetService';
import type { ChannelStripPreset } from '../../../types/project';

vi.mock('../../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

function makeUserPreset(overrides: Partial<ChannelStripPreset> = {}): ChannelStripPreset {
  return {
    id: 'user-1',
    name: 'My Vocal Preset',
    description: 'A user vocal preset',
    category: 'vocal',
    tags: ['warm'],
    isFactory: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    effects: [],
    ...overrides,
  };
}

function setup(trackId?: string) {
  localStorage.clear();
  useProjectStore.getState().createProject();
  const track = useProjectStore.getState().addTrack('vocals');
  const id = trackId ?? track.id;
  const onClose = vi.fn();
  const utils = render(<ChannelStripPresetBrowser trackId={id} onClose={onClose} />);
  return { ...utils, onClose, trackId: id };
}

describe('ChannelStripPresetBrowser', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders with factory presets listed', () => {
    setup();
    const factoryCount = getFactoryPresets().length;
    const list = screen.getByTestId('preset-list');
    expect(list.querySelectorAll('[data-testid^="preset-item-"]').length).toBe(factoryCount);
  });

  it('shows "Built-in" badge for factory presets', () => {
    setup();
    expect(screen.getAllByText('Built-in').length).toBeGreaterThan(0);
  });

  it('filters presets by category', () => {
    setup();
    fireEvent.click(screen.getByTestId('preset-cat-drums'));
    const list = screen.getByTestId('preset-list');
    const items = list.querySelectorAll('[data-testid^="preset-item-"]');
    // Factory has at least 1 drums preset
    expect(items.length).toBeGreaterThanOrEqual(1);
  });

  it('searches presets by name', () => {
    setup();
    fireEvent.change(screen.getByTestId('preset-search'), { target: { value: 'vocal warmth' } });
    const list = screen.getByTestId('preset-list');
    const items = list.querySelectorAll('[data-testid^="preset-item-"]');
    expect(items.length).toBe(1);
  });

  it('shows "No presets found" when search yields no results', () => {
    setup();
    fireEvent.change(screen.getByTestId('preset-search'), { target: { value: 'xyznonexistent' } });
    expect(screen.getByText('No presets found')).toBeInTheDocument();
  });

  it('opens and closes save form', () => {
    setup();
    fireEvent.click(screen.getByTestId('preset-save-btn'));
    expect(screen.getByTestId('preset-save-form')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('preset-save-cancel'));
    expect(screen.queryByTestId('preset-save-form')).toBeNull();
  });

  it('saves a new preset from the form', () => {
    const { trackId } = setup();
    fireEvent.click(screen.getByTestId('preset-save-btn'));

    fireEvent.change(screen.getByTestId('preset-save-name'), { target: { value: 'My New Preset' } });
    fireEvent.change(screen.getByTestId('preset-save-category'), { target: { value: 'guitar' } });
    fireEvent.change(screen.getByTestId('preset-save-description'), { target: { value: 'Test desc' } });

    fireEvent.click(screen.getByTestId('preset-save-confirm'));

    // Save form should close
    expect(screen.queryByTestId('preset-save-form')).toBeNull();
    // New preset should appear in the list
    expect(screen.getByText('My New Preset')).toBeInTheDocument();
  });

  it('applies a preset when clicked and calls onClose', () => {
    const { onClose } = setup();
    const factoryPresets = getFactoryPresets();
    const firstPreset = factoryPresets[0];

    fireEvent.click(screen.getByTestId(`preset-item-${firstPreset.id}`));
    expect(onClose).toHaveBeenCalled();
  });

  it('deletes a user preset', () => {
    localStorage.clear();
    addPresetToLibrary(makeUserPreset());
    useProjectStore.getState().createProject();
    const track = useProjectStore.getState().addTrack('vocals');
    const onClose = vi.fn();
    render(<ChannelStripPresetBrowser trackId={track.id} onClose={onClose} />);

    expect(screen.getByText('My Vocal Preset')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('preset-delete-user-1'));
    expect(screen.queryByText('My Vocal Preset')).toBeNull();
  });

  it('duplicates a preset', () => {
    localStorage.clear();
    addPresetToLibrary(makeUserPreset());
    useProjectStore.getState().createProject();
    const track = useProjectStore.getState().addTrack('vocals');
    const onClose = vi.fn();
    render(<ChannelStripPresetBrowser trackId={track.id} onClose={onClose} />);

    fireEvent.click(screen.getByTestId('preset-duplicate-user-1'));
    expect(screen.getByText('My Vocal Preset (Copy)')).toBeInTheDocument();
  });

  it('closes when close button is clicked', () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByTestId('preset-browser-close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('disable save button when name is empty', () => {
    setup();
    fireEvent.click(screen.getByTestId('preset-save-btn'));
    const confirmBtn = screen.getByTestId('preset-save-confirm');
    expect(confirmBtn).toBeDisabled();
  });
});
