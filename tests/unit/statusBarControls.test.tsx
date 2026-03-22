import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { StatusBar } from '../../src/components/layout/StatusBar';
import { useProjectStore } from '../../src/store/projectStore';
import { useUIStore } from '../../src/store/uiStore';
import { useGenerationStore } from '../../src/store/generationStore';
import { TIMELINE_ZOOM_LEVELS } from '../../src/utils/timelineZoom';

vi.mock('../../src/services/aceStepApi', () => ({
  healthCheck: vi.fn().mockResolvedValue(false),
}));

describe('StatusBar controls', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useGenerationStore.setState(useGenerationStore.getInitialState(), true);
    useProjectStore.getState().createProject({ name: 'Status Bar Test' });
  });

  it('opens keyboard shortcuts from the bottom-right launcher', () => {
    render(<StatusBar />);

    fireEvent.click(screen.getByTestId('status-shortcuts-trigger'));

    expect(useUIStore.getState().showKeyboardShortcutsDialog).toBe(true);
  });

  it('updates timeline zoom from the bottom-right slider', () => {
    render(<StatusBar />);

    fireEvent.change(screen.getByTestId('status-zoom-slider'), { target: { value: '14' } });

    expect(useUIStore.getState().pixelsPerSecond).toBe(TIMELINE_ZOOM_LEVELS[14]);
  });
});
