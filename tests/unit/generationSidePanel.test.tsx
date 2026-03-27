import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { GenerationSidePanel } from '../../src/components/generation/GenerationSidePanel';
import { useUIStore } from '../../src/store/uiStore';
import { useGenerationStore } from '../../src/store/generationStore';
import { useProjectStore } from '../../src/store/projectStore';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

vi.mock('../../src/services/generationPipeline', () => ({
  generateVariationSession: vi.fn(() => Promise.resolve(true)),
  generateBatch: vi.fn(() => Promise.resolve(undefined)),
}));

describe('GenerationSidePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useUIStore.setState(useUIStore.getInitialState(), true);
    useGenerationStore.setState(useGenerationStore.getInitialState(), true);
    useProjectStore.setState(useProjectStore.getInitialState(), true);

    useProjectStore.getState().createProject({ name: 'AI Panel Test', bpm: 132, keyScale: 'D minor' });
    useProjectStore.getState().addTrack('drums');
    useUIStore.getState().setShowGenerationPanel(true);
  });

  it('switches between Mix and Stems tabs', () => {
    render(<GenerationSidePanel />);

    // Default: Mix tab (Simple sub-mode)
    expect(screen.getByTestId('generation-panel-tab-text-to-music')).toBeInTheDocument();
    expect(screen.getByTestId('simple-mode-form')).toBeInTheDocument();

    // Switch to Stems
    fireEvent.click(screen.getByTestId('generation-panel-tab-multi-track'));
    expect(screen.getByTestId('multi-track-generation-section')).toBeInTheDocument();

    // Switch back to Mix
    fireEvent.click(screen.getByTestId('generation-panel-tab-text-to-music'));
    expect(screen.getByTestId('simple-mode-form')).toBeInTheDocument();

    // Switch to Custom sub-mode
    fireEvent.click(screen.getByTestId('mix-submode-custom'));
    expect(screen.getByTestId('full-song-form')).toBeInTheDocument();
  });

  it('lets users add or remove multi-track rows and choose from the 12 default track roles', () => {
    render(<GenerationSidePanel />);

    fireEvent.click(screen.getByTestId('generation-panel-tab-multi-track'));

    const firstRoleSelect = screen.getByTestId('multi-track-role-select-0');
    expect(within(firstRoleSelect).getAllByRole('option')).toHaveLength(12);

    const beforeCount = screen.getAllByLabelText(/Target track type for row/i).length;
    fireEvent.click(screen.getByTestId('multi-track-add-row'));
    expect(screen.getAllByLabelText(/Target track type for row/i)).toHaveLength(beforeCount + 1);

    const newRoleSelect = screen.getByTestId(`multi-track-role-select-${beforeCount}`);
    fireEvent.change(newRoleSelect, { target: { value: 'vocals' } });
    expect(screen.getAllByPlaceholderText(/Lyrics here/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByLabelText(`Remove track row ${beforeCount + 1}`));
    expect(screen.getAllByLabelText(/Target track type for row/i)).toHaveLength(beforeCount);
  });
});
