import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Toolbar } from '../Toolbar';
import { StatusBar } from '../StatusBar';
import { useProjectStore } from '../../../store/projectStore';

vi.mock('../../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

vi.mock('../../../hooks/useAudioEngine', () => ({
  useAudioEngine: () => ({
    resumeOnGesture: vi.fn(),
  }),
}));

vi.mock('../../../hooks/useTransport', () => ({
  useTransport: () => ({
    isPlaying: false,
    play: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
  }),
}));

vi.mock('../../../hooks/useRecording', () => ({
  useRecording: () => ({
    toggleRecord: vi.fn(),
    armedTrackIds: [],
    toggleArmTrack: vi.fn(),
  }),
}));

vi.mock('../../../services/midiCaptureService', () => ({
  getMidiCaptureService: () => ({
    getBufferedNotes: () => [],
  }),
}));

describe('ARIA Landmark Roles', () => {
  describe('Toolbar', () => {
    it('has role="toolbar" on the main container', () => {
      useProjectStore.getState().createProject();
      render(<Toolbar />);

      const toolbar = screen.getByTestId('main-toolbar');
      expect(toolbar.getAttribute('role')).toBe('toolbar');
    });

    it('has a descriptive aria-label', () => {
      useProjectStore.getState().createProject();
      render(<Toolbar />);

      const toolbar = screen.getByTestId('main-toolbar');
      expect(toolbar.getAttribute('aria-label')).toBeTruthy();
      expect(toolbar.getAttribute('aria-label')).toContain('toolbar');
    });
  });

  describe('StatusBar', () => {
    it('has role="contentinfo" on the status bar', () => {
      useProjectStore.getState().createProject();
      render(<StatusBar saveStatus="saved" />);

      const statusBar = screen.getByTestId('status-bar');
      expect(statusBar.getAttribute('role')).toBe('contentinfo');
    });

    it('has a descriptive aria-label', () => {
      useProjectStore.getState().createProject();
      render(<StatusBar saveStatus="saved" />);

      const statusBar = screen.getByTestId('status-bar');
      expect(statusBar.getAttribute('aria-label')).toBeTruthy();
    });
  });
});
