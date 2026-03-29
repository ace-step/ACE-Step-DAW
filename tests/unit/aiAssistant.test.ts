import { beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from '../../src/store/uiStore';
import { useProjectStore } from '../../src/store/projectStore';
import { useTransportStore } from '../../src/store/transportStore';
import { buildAssistantContext } from '../../src/utils/aiAssistantContext';

describe('AI Assistant', () => {
  beforeEach(() => {
    localStorage.clear();
    useUIStore.setState(useUIStore.getInitialState(), true);
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useTransportStore.setState(useTransportStore.getInitialState(), true);
  });

  describe('uiStore assistant state', () => {
    it('assistant panel is closed by default', () => {
      expect(useUIStore.getState().showAIAssistant).toBe(false);
    });

    it('toggles assistant panel open and closed', () => {
      useUIStore.getState().toggleAIAssistant();
      expect(useUIStore.getState().showAIAssistant).toBe(true);

      useUIStore.getState().toggleAIAssistant();
      expect(useUIStore.getState().showAIAssistant).toBe(false);
    });

    it('persists assistant panel open state', () => {
      useUIStore.getState().setShowAIAssistant(true);
      const persisted = JSON.parse(localStorage.getItem('ace-step-daw-ui') || '{}');
      expect(persisted.state.showAIAssistant).toBe(true);
    });

    it('closes other right panels when opening assistant', () => {
      useUIStore.setState({ showMixer: true });
      useUIStore.getState().setShowAIAssistant(true);
      expect(useUIStore.getState().showMixer).toBe(false);
      expect(useUIStore.getState().showAIAssistant).toBe(true);
    });
  });

  describe('buildAssistantContext', () => {
    it('returns minimal context when no project is loaded', () => {
      const ctx = buildAssistantContext(null);
      expect(ctx.summary).toContain('No project loaded');
    });

    it('includes project info in context', () => {
      useProjectStore.getState().createProject({ name: 'My Song', bpm: 128 });
      const ctx = buildAssistantContext(useProjectStore.getState().project);

      expect(ctx.summary).toContain('My Song');
      expect(ctx.summary).toContain('128');
    });

    it('includes focused track details and effects', () => {
      useProjectStore.getState().createProject({ name: 'FX Test' });
      const track = useProjectStore.getState().addTrack('vocals');
      useProjectStore.getState().addTrackEffect(track.id, 'reverb');

      const ctx = buildAssistantContext(useProjectStore.getState().project, {
        expandedTrackId: track.id,
      });

      expect(ctx.summary).toContain('Focused track');
      expect(ctx.summary).toContain('reverb');
    });

    it('includes active panels and transport state', () => {
      useProjectStore.getState().createProject({ name: 'Context Panels', bpm: 110 });
      useTransportStore.getState().toggleLoop();

      const ctx = buildAssistantContext(
        useProjectStore.getState().project,
        {
          showMixer: true,
          showLibrary: true,
          showAIAssistant: true,
        },
        useTransportStore.getState(),
      );

      expect(ctx.summary).toContain('Open panels: Mixer, Library, AI Assistant');
      expect(ctx.summary).toContain('loop enabled');
    });
  });
});
