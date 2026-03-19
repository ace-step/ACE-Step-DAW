import { test, expect } from '@playwright/test';

const modKey = process.platform === 'darwin' ? 'Meta' : 'Control';

type ConsolidateTestWindow = Window & typeof globalThis & {
  __store: {
    getState(): {
      createProject: (input: { name: string }) => void;
      addTrack: (name: string, type: 'pianoRoll') => { id: string };
      addClip: (
        trackId: string,
        clip: {
          startTime: number;
          duration: number;
          prompt: string;
          globalCaption: string;
          lyrics: string;
          midiData: {
            grid: '1/16';
            notes: Array<{ id: string; pitch: number; startBeat: number; durationBeats: number; velocity: number }>;
          };
          source: 'uploaded';
        },
      ) => { id: string };
      project?: {
        tracks?: Array<{
          clips?: Array<{
            midiData?: {
              notes?: Array<unknown>;
            };
          }>;
        }>;
      };
    };
  };
  __uiStore: {
    getState(): {
      setShowNewProjectDialog: (value: boolean) => void;
      selectClips: (clipIds: string[]) => void;
    };
  };
};

test.describe('Consolidate Clips Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(
      () => typeof (window as unknown as Partial<ConsolidateTestWindow>).__store !== 'undefined',
      null,
      { timeout: 10000 },
    );
    await page.evaluate(() => {
      const testWindow = window as unknown as ConsolidateTestWindow;
      testWindow.__store.getState().createProject({ name: 'Consolidate E2E' });
      testWindow.__uiStore.getState().setShowNewProjectDialog(false);
    });
    await page.getByText('Click anywhere to enable audio').click();
  });

  test('consolidates selected clips with the keyboard shortcut', async ({ page }) => {
    const clipIds = await page.evaluate(() => {
      const store = (window as unknown as ConsolidateTestWindow).__store;
      const track = store.getState().addTrack('keyboard', 'pianoRoll');
      const clipA = store.getState().addClip(track.id, {
        startTime: 0,
        duration: 1,
        prompt: 'phrase-a',
        globalCaption: '',
        lyrics: '',
        midiData: {
          grid: '1/16',
          notes: [{ id: 'note-a', pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.8 }],
        },
        source: 'uploaded',
      });
      const clipB = store.getState().addClip(track.id, {
        startTime: 1,
        duration: 1,
        prompt: 'phrase-b',
        globalCaption: '',
        lyrics: '',
        midiData: {
          grid: '1/16',
          notes: [{ id: 'note-b', pitch: 64, startBeat: 0.5, durationBeats: 0.5, velocity: 0.7 }],
        },
        source: 'uploaded',
      });
      return [clipA.id, clipB.id];
    });

    await page.evaluate((ids) => {
      (window as unknown as ConsolidateTestWindow).__uiStore.getState().selectClips(ids);
    }, clipIds);

    await page.evaluate((mod) => {
      window.dispatchEvent(new KeyboardEvent('keydown', {
        code: 'KeyJ',
        key: 'j',
        bubbles: true,
        ctrlKey: mod === 'Control',
        metaKey: mod === 'Meta',
      }));
    }, modKey);

    await page.waitForFunction(() => {
      const testWindow = window as unknown as ConsolidateTestWindow;
      return testWindow.__store.getState().project?.tracks?.[0]?.clips?.length === 1;
    });
    await expect(page.getByTestId(`clip-${clipIds[0]}`)).toHaveCount(0);
    await expect(page.getByTestId(`clip-${clipIds[1]}`)).toHaveCount(0);

    const consolidated = await page.evaluate(() => {
      const clips = (window as unknown as ConsolidateTestWindow).__store.getState().project?.tracks?.[0]?.clips ?? [];
      return {
        count: clips.length,
        noteCount: clips[0]?.midiData?.notes?.length ?? 0,
      };
    });

    expect(consolidated).toEqual({ count: 1, noteCount: 2 });
  });

  test('shows consolidate in the clip context menu and merges the current selection', async ({ page }) => {
    const clipIds = await page.evaluate(() => {
      const store = (window as unknown as ConsolidateTestWindow).__store;
      const track = store.getState().addTrack('keyboard', 'pianoRoll');
      const clipA = store.getState().addClip(track.id, {
        startTime: 0,
        duration: 1,
        prompt: 'riff-a',
        globalCaption: '',
        lyrics: '',
        midiData: {
          grid: '1/16',
          notes: [{ id: 'note-a', pitch: 67, startBeat: 0, durationBeats: 1, velocity: 0.9 }],
        },
        source: 'uploaded',
      });
      const clipB = store.getState().addClip(track.id, {
        startTime: 1,
        duration: 1,
        prompt: 'riff-b',
        globalCaption: '',
        lyrics: '',
        midiData: {
          grid: '1/16',
          notes: [{ id: 'note-b', pitch: 69, startBeat: 0, durationBeats: 1, velocity: 0.75 }],
        },
        source: 'uploaded',
      });
      return [clipA.id, clipB.id];
    });

    await page.evaluate((ids) => {
      (window as unknown as ConsolidateTestWindow).__uiStore.getState().selectClips(ids);
    }, clipIds);

    await page.evaluate((clipId) => {
      const node = document.querySelector(`[data-testid="clip-${clipId}"]`);
      if (!node) return;
      node.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 240,
        clientY: 180,
        button: 2,
      }));
    }, clipIds[1]);
    await expect(page.getByRole('button', { name: 'Consolidate' })).toBeVisible();
    await page.getByRole('button', { name: 'Consolidate' }).click();

    await page.waitForFunction(() => {
      const testWindow = window as unknown as ConsolidateTestWindow;
      return testWindow.__store.getState().project?.tracks?.[0]?.clips?.length === 1;
    });
    const count = await page.evaluate(() => (
      (window as unknown as ConsolidateTestWindow).__store.getState().project?.tracks?.[0]?.clips?.length ?? 0
    ));
    expect(count).toBe(1);
  });
});
