import { test, expect } from '@playwright/test';

type E2EProjectStore = {
  getState(): {
    createProject(input: { name: string }): void;
    addTrack(trackName: string, trackType: string): { id: string };
    addClip(trackId: string, input: {
      startTime: number;
      duration: number;
      prompt: string;
      lyrics: string;
      midiData: {
        notes: Array<{ pitch: number; startBeat: number; durationBeats: number; velocity: number }>;
        grid: string;
      };
      source: string;
    }): { id: string };
    updateClipStatus(clipId: string, status: string): void;
    project: {
      tracks: Array<{ id: string; clips: Array<{ id: string }> }>;
    };
  };
};

type E2EUIStore = {
  getState(): {
    setShowNewProjectDialog(value: boolean): void;
    setMainView(value: 'arrangement' | 'session'): void;
    mainView: 'arrangement' | 'session';
  };
};

type E2ETransportStore = {
  getState(): {
    launchSessionClip(trackId: string, clipId: string, sceneIndex: number, launchedAt: number): void;
    launchedSessionClips: Record<string, { clipId: string; sceneIndex: number; launchedAt: number }>;
  };
};

test.describe('Session View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => typeof (window as { __store?: unknown }).__store !== 'undefined');

    await page.evaluate(() => {
      const store = (window as unknown as { __store: E2EProjectStore }).__store;
      const uiStore = (window as unknown as { __uiStore: E2EUIStore }).__uiStore;
      store.getState().createProject({ name: 'Session View Test' });
      uiStore.getState().setShowNewProjectDialog(false);
      const track = store.getState().addTrack('synth', 'pianoRoll');
      const clip = store.getState().addClip(track.id, {
        startTime: 0,
        duration: 2,
        prompt: 'Bass motif',
        lyrics: '',
        midiData: {
          notes: [
            { pitch: 48, startBeat: 0, durationBeats: 1, velocity: 0.8 },
            { pitch: 50, startBeat: 1, durationBeats: 1, velocity: 0.8 },
          ],
          grid: '1/16',
        },
        source: 'uploaded',
      });
      store.getState().updateClipStatus(clip.id, 'ready');
    });

    await page.evaluate(() => {
      const overlay = Array.from(document.querySelectorAll('div')).find((node) =>
        node.textContent?.includes('Click anywhere to enable audio'),
      );
      if (overlay instanceof HTMLElement) {
        overlay.style.display = 'none';
      }
    });
  });

  test('switches to Session View and exposes launch state through the transport store', async ({ page }) => {
    await page.evaluate(() => {
      const uiStore = (window as unknown as { __uiStore: E2EUIStore }).__uiStore;
      uiStore.getState().setMainView('session');
    });
    await page.waitForFunction(() => document.body.textContent?.includes('Session View clip launcher'));

    const launch = await page.evaluate(() => {
      const uiStore = (window as unknown as { __uiStore: E2EUIStore }).__uiStore;
      const store = (window as unknown as { __store: E2EProjectStore }).__store;
      const transportStore = (window as unknown as { __transportStore: E2ETransportStore }).__transportStore;
      const project = store.getState().project;
      const track = project.tracks[0];
      const clip = track.clips[0];

      transportStore.getState().launchSessionClip(track.id, clip.id, 0, 0);

      return {
        mainView: uiStore.getState().mainView,
        bodyText: document.body.textContent ?? '',
        launch: Object.values(transportStore.getState().launchedSessionClips)[0] ?? null,
      };
    });

    expect(launch.mainView).toBe('session');
    expect(launch.bodyText).toContain('Session View clip launcher');
    expect(launch.launch).toMatchObject({
      clipId: expect.any(String),
      sceneIndex: 0,
      launchedAt: 0,
    });
  });
});
