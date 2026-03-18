import { test, expect } from '@playwright/test';

test.describe('Project Lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the app to fully load
    await page.waitForLoadState('networkidle');
  });

  test('app loads without errors', async ({ page }) => {
    // Verify the page loaded (check for main app container)
    await expect(page.locator('#root')).toBeVisible();
  });

  test('window.__store is exposed', async ({ page }) => {
    const storeExists = await page.evaluate(() => {
      return typeof (window as any).__store !== 'undefined';
    });
    expect(storeExists).toBe(true);
  });

  test('can create a new project via store API', async ({ page }) => {
    const projectName = await page.evaluate(() => {
      const store = (window as any).__store;
      store.getState().createProject({ name: 'Test Project', bpm: 140 });
      return store.getState().project?.name;
    });
    expect(projectName).toBe('Test Project');
  });

  test('can add tracks via store API', async ({ page }) => {
    const trackCount = await page.evaluate(() => {
      const store = (window as any).__store;
      store.getState().createProject({ name: 'Track Test' });
      store.getState().addTrack('drums');
      store.getState().addTrack('bass');
      store.getState().addTrack('keyboard', 'pianoRoll');
      return store.getState().project?.tracks.length;
    });
    expect(trackCount).toBe(3);
  });

  test('can add and remove a clip via store API', async ({ page }) => {
    const result = await page.evaluate(() => {
      const store = (window as any).__store;
      store.getState().createProject();
      const track = store.getState().addTrack('drums');
      const clip = store.getState().addClip(track.id, {
        startTime: 0,
        duration: 30,
        prompt: 'test drums',
        lyrics: '',
      });
      const countAfterAdd = store.getState().project.tracks[0].clips.length;
      store.getState().removeClip(clip.id);
      const countAfterRemove = store.getState().project.tracks[0].clips.length;
      return { countAfterAdd, countAfterRemove };
    });
    expect(result.countAfterAdd).toBe(1);
    expect(result.countAfterRemove).toBe(0);
  });

  test('can update BPM via store API', async ({ page }) => {
    const bpm = await page.evaluate(() => {
      const store = (window as any).__store;
      store.getState().createProject();
      store.getState().updateProject({ bpm: 160 });
      return store.getState().project.bpm;
    });
    expect(bpm).toBe(160);
  });
});
