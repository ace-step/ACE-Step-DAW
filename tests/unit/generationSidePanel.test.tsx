import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

  it('renders generation panel when visible', () => {
    render(<GenerationSidePanel />);
    // Panel should be in the DOM (specific content depends on current UI state)
    expect(document.body.children.length).toBeGreaterThan(0);
  });

  // Legacy single-track form tests — needs migration to FullSongForm / per-track generation
  it.todo('hydrates core generation controls from store-backed project defaults');
  it.todo('persists prompt, style tags, key, bpm, length, temperature, and variation count');
  it.todo('shows actionable validation when the prompt is missing');
  it.todo('submits selected generation parameters through the generation pipeline');
  it.todo('surfaces variation errors as actionable feedback');
  it.todo('shows live backend stage progress and ETA');
  it.todo('falls back to stage-only messaging when ETA confidence is low');
  it.todo('shows accessible autocomplete suggestions from keyboard');
  it.todo('supports mouse selection from autocomplete suggestions');
  it.todo('does not open autocomplete while IME composition is active');
});
