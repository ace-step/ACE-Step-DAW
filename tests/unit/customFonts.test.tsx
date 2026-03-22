import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Toolbar } from '../../src/components/layout/Toolbar';
import { useProjectStore } from '../../src/store/projectStore';
import { useUIStore } from '../../src/store/uiStore';
import { useTransportStore } from '../../src/store/transportStore';

// Mock external dependencies (same as toolbarHierarchy test)
vi.mock('../../src/store/collaborationStore', () => ({
  useCollaborationStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({
      setShowShareDialog: vi.fn(),
      isViewerMode: false,
    }),
}));

vi.mock('../../src/hooks/useAudioImport', () => ({
  useAudioImport: () => ({ openFilePicker: vi.fn() }),
}));

vi.mock('../../src/hooks/useTransport', () => ({
  useTransport: () => ({
    isPlaying: false,
    play: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
  }),
}));

vi.mock('../../src/hooks/useRecording', () => ({
  useRecording: () => ({ toggleRecord: vi.fn() }),
}));

vi.mock('../../src/services/midiCaptureService', () => ({
  getMidiCaptureService: vi.fn(),
}));

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('Custom fonts (#549)', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useTransportStore.setState(useTransportStore.getInitialState(), true);
    useProjectStore.getState().createProject({ name: 'Font Test' });
  });

  describe('LCD Display uses monospace font', () => {
    it('applies font-mono class to bars/beats display in toolbar LCD', () => {
      const { container } = render(<Toolbar />);
      const lcdContainer = container.querySelector('.gb-lcd');
      expect(lcdContainer).toBeInTheDocument();
      // All text spans inside LCD should use font-mono
      const monoSpans = lcdContainer!.querySelectorAll('.font-mono');
      expect(monoSpans.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Google Fonts are configured in index.html', () => {
    it('index.html includes Google Fonts link for Inter and JetBrains Mono', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const indexPath = path.resolve(__dirname, '../../index.html');
      const html = fs.readFileSync(indexPath, 'utf-8');
      expect(html).toContain('fonts.googleapis.com');
      expect(html).toContain('Inter');
      expect(html).toContain('JetBrains+Mono');
    });
  });

  describe('CSS configures font families', () => {
    it('index.css sets Inter as the body font family', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const cssPath = path.resolve(__dirname, '../../src/index.css');
      const css = fs.readFileSync(cssPath, 'utf-8');
      expect(css).toContain("font-family: 'Inter'");
    });

    it('index.css sets JetBrains Mono as the mono font via theme', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const cssPath = path.resolve(__dirname, '../../src/index.css');
      const css = fs.readFileSync(cssPath, 'utf-8');
      expect(css).toContain("--font-mono: 'JetBrains Mono'");
    });

    it('index.css sets Inter as the sans font via theme', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const cssPath = path.resolve(__dirname, '../../src/index.css');
      const css = fs.readFileSync(cssPath, 'utf-8');
      expect(css).toContain("--font-sans: 'Inter'");
    });
  });
});
