import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeCoreKeyboardAction, type CoreKeyboardActionDeps } from '../../src/services/coreKeyboardActions';
import { useProjectStore } from '../../src/store/projectStore';
import { useUIStore } from '../../src/store/uiStore';

/**
 * Tests for the Z (zoom-to-selection) and Shift+Z (zoom-to-fit-project) shortcuts.
 *
 * The store actions (`zoomTimelineToSelection`, `zoomTimelineToProject`) set a
 * `timelineZoomRequest` that the Timeline component consumes. These tests
 * verify the action dispatch layer exposed through `executeCoreKeyboardAction`,
 * which is the integration point between the keyboard handler and the store.
 */

function makeDeps(): CoreKeyboardActionDeps {
  return {
    play: vi.fn(),
    pause: vi.fn(),
    toggleRecord: vi.fn(),
    toggleArmTrack: vi.fn(),
  };
}

describe('Zoom shortcut actions (Z / Shift+Z)', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useProjectStore.getState().createProject({ name: 'Zoom Shortcut Test' });
  });

  describe('view.zoomToSelection (Z)', () => {
    it('dispatches a selection zoom request when in timeline context', async () => {
      // Default keyboard context is 'timeline'
      const result = await executeCoreKeyboardAction('view.zoomToSelection', makeDeps());

      expect(result).toBe(true);
      expect(useUIStore.getState().timelineZoomRequest).toEqual({
        id: 1,
        mode: 'selection',
      });
    });

    it('increments the request id on repeated invocations', async () => {
      await executeCoreKeyboardAction('view.zoomToSelection', makeDeps());
      await executeCoreKeyboardAction('view.zoomToSelection', makeDeps());

      expect(useUIStore.getState().timelineZoomRequest).toEqual({
        id: 2,
        mode: 'selection',
      });
    });

    it('does nothing when keyboard context is not timeline', async () => {
      useUIStore.getState().setKeyboardContext('mixer');

      const result = await executeCoreKeyboardAction('view.zoomToSelection', makeDeps());

      expect(result).toBe(false);
      expect(useUIStore.getState().timelineZoomRequest).toBeNull();
    });

    it('does nothing when keyboard context is pianoRoll', async () => {
      useUIStore.getState().setKeyboardContext('pianoRoll');

      const result = await executeCoreKeyboardAction('view.zoomToSelection', makeDeps());

      expect(result).toBe(false);
      expect(useUIStore.getState().timelineZoomRequest).toBeNull();
    });
  });

  describe('view.zoomToFit (Shift+Z)', () => {
    it('dispatches a project zoom request when in timeline context', async () => {
      const result = await executeCoreKeyboardAction('view.zoomToFit', makeDeps());

      expect(result).toBe(true);
      expect(useUIStore.getState().timelineZoomRequest).toEqual({
        id: 1,
        mode: 'project',
      });
    });

    it('does nothing when keyboard context is not timeline', async () => {
      useUIStore.getState().setKeyboardContext('pianoRoll');

      const result = await executeCoreKeyboardAction('view.zoomToFit', makeDeps());

      expect(result).toBe(false);
      expect(useUIStore.getState().timelineZoomRequest).toBeNull();
    });
  });

  describe('undo history isolation', () => {
    it('does not push viewport changes to the project undo stack', async () => {
      const track = useProjectStore.getState().addTrack('drums');
      useProjectStore.getState().addClip(track.id, {
        startTime: 0,
        duration: 4,
        prompt: 'beat',
        lyrics: '',
        source: 'generated',
      });

      const historyBefore = useProjectStore.getState().historyIndex;

      await executeCoreKeyboardAction('view.zoomToSelection', makeDeps());
      await executeCoreKeyboardAction('view.zoomToFit', makeDeps());

      const historyAfter = useProjectStore.getState().historyIndex;
      expect(historyAfter).toBe(historyBefore);
    });
  });

  describe('store actions are stable when nothing is selected', () => {
    it('zoomTimelineToSelection still produces a request even with no selection', () => {
      // The store action always fires — the Timeline component handles the
      // fallback-to-project logic and shows a toast. This test verifies the
      // store side does not throw or skip the request.
      useUIStore.getState().zoomTimelineToSelection();

      expect(useUIStore.getState().timelineZoomRequest).toEqual({
        id: 1,
        mode: 'selection',
      });
    });
  });

  describe('shortcut defaults are registered', () => {
    it('has view.zoomToSelection mapped to KeyZ', async () => {
      const { SHORTCUT_ACTION_MAP } = await import('../../src/constants/shortcutDefaults');
      const action = SHORTCUT_ACTION_MAP['view.zoomToSelection'];

      expect(action).not.toBeUndefined();
      expect(action.defaultCombo).toEqual({ code: 'KeyZ' });
      expect(action.contexts).toContain('timeline');
    });

    it('has view.zoomToFit mapped to Shift+KeyZ', async () => {
      const { SHORTCUT_ACTION_MAP } = await import('../../src/constants/shortcutDefaults');
      const action = SHORTCUT_ACTION_MAP['view.zoomToFit'];

      expect(action).not.toBeUndefined();
      expect(action.defaultCombo).toEqual({ code: 'KeyZ', shift: true });
      expect(action.contexts).toContain('timeline');
    });
  });
});
