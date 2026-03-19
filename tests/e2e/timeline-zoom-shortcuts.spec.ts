import { test, expect } from '@playwright/test';

type ZoomTestWindow = Window & typeof globalThis & {
  __store: {
    getState(): {
      createProject: (input: { name: string }) => void;
      addTrack: (name: string) => { id: string };
      addClip: (
        trackId: string,
        clip: {
          startTime: number;
          duration: number;
          prompt: string;
          globalCaption?: string;
          lyrics: string;
          source: 'generated';
        },
      ) => { id: string };
    };
  };
  __uiStore: {
    getState(): {
      setShowNewProjectDialog: (value: boolean) => void;
      skipOnboarding?: () => void;
      selectClips: (clipIds: string[]) => void;
      setSelectWindow: (value: { startTime: number; endTime: number; trackIds: string[] } | null) => void;
      pixelsPerSecond: number;
    };
  };
};

test.describe('Arrangement zoom shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(
      () => typeof (window as unknown as Partial<ZoomTestWindow>).__store !== 'undefined',
      null,
      { timeout: 10000 },
    );
    await page.evaluate(() => {
      const testWindow = window as unknown as ZoomTestWindow;
      testWindow.__uiStore.getState().skipOnboarding?.();
      testWindow.__store.getState().createProject({ name: 'Zoom Shortcuts E2E' });
      testWindow.__uiStore.getState().setShowNewProjectDialog(false);
    });
    await page.getByText('Click anywhere to enable audio').click();
  });

  test('zooms to the selected arrangement clips with Z and resets with Shift+Z', async ({ page }) => {
    const clipIds = await page.evaluate(() => {
      const testWindow = window as unknown as ZoomTestWindow;
      const track = testWindow.__store.getState().addTrack('drums');
      const intro = testWindow.__store.getState().addClip(track.id, {
        startTime: 8,
        duration: 4,
        prompt: 'intro',
        lyrics: '',
        source: 'generated',
      });
      const fill = testWindow.__store.getState().addClip(track.id, {
        startTime: 24,
        duration: 6,
        prompt: 'fill',
        lyrics: '',
        source: 'generated',
      });
      const outro = testWindow.__store.getState().addClip(track.id, {
        startTime: 88,
        duration: 8,
        prompt: 'outro',
        lyrics: '',
        source: 'generated',
      });
      return { fill: fill.id, outro: outro.id, selected: [fill.id, outro.id] };
    });

    await page.evaluate(({ selected }) => {
      const ui = (window as unknown as ZoomTestWindow).__uiStore.getState();
      ui.setSelectWindow(null);
      ui.selectClips(selected);
    }, clipIds);

    const timeline = page.getByRole('grid');
    await timeline.click({ position: { x: 200, y: 120 } });
    await page.keyboard.press('z');

    await page.waitForFunction(() => {
      const ui = (window as unknown as ZoomTestWindow).__uiStore.getState();
      return ui.pixelsPerSecond < 20;
    });

    await expect(page.getByTestId(`clip-${clipIds.fill}`)).toBeVisible();
    await expect(page.getByTestId(`clip-${clipIds.outro}`)).toBeVisible();

    const zoomedSelectionPps = await page.evaluate(() => (
      (window as unknown as ZoomTestWindow).__uiStore.getState().pixelsPerSecond
    ));
    expect(zoomedSelectionPps).toBeLessThan(20);

    await page.keyboard.press('Shift+z');

    await page.waitForFunction(() => {
      const ui = (window as unknown as ZoomTestWindow).__uiStore.getState();
      return ui.pixelsPerSecond === 10;
    });

    const fullProjectPps = await page.evaluate(() => (
      (window as unknown as ZoomTestWindow).__uiStore.getState().pixelsPerSecond
    ));
    expect(fullProjectPps).toBe(10);
  });
});
