import { test, expect } from '@playwright/test';

test.describe('Mixer Operations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => typeof (window as any).__store !== 'undefined', null, { timeout: 10000 });
    await page.evaluate(() => {
      const store = (window as any).__store;
      store.getState().createProject({ name: 'Mixer Test' });
      store.getState().addTrack('drums');
      store.getState().addTrack('bass');
    });
  });

  test('tracks have default volume of 0.8', async ({ page }) => {
    const volumes = await page.evaluate(() => {
      const store = (window as any).__store;
      return store.getState().project?.tracks.map((t: any) => t.volume);
    });
    expect(volumes).toEqual([0.8, 0.8]);
  });

  test('can update track volume', async ({ page }) => {
    const volume = await page.evaluate(() => {
      const store = (window as any).__store;
      const trackId = store.getState().project?.tracks[0]?.id;
      store.getState().updateTrack(trackId, { volume: 0.5 });
      return store.getState().project?.tracks[0]?.volume;
    });
    expect(volume).toBe(0.5);
  });

  test('can mute a track', async ({ page }) => {
    const muted = await page.evaluate(() => {
      const store = (window as any).__store;
      const trackId = store.getState().project?.tracks[0]?.id;
      store.getState().updateTrack(trackId, { muted: true });
      return store.getState().project?.tracks[0]?.muted;
    });
    expect(muted).toBe(true);
  });

  test('can solo a track', async ({ page }) => {
    const result = await page.evaluate(() => {
      const store = (window as any).__store;
      const trackId = store.getState().project?.tracks[0]?.id;
      store.getState().updateTrack(trackId, { soloed: true });
      const tracks = store.getState().project?.tracks;
      return {
        track0Soloed: tracks[0].soloed,
        track1Soloed: tracks[1].soloed,
      };
    });
    expect(result.track0Soloed).toBe(true);
    expect(result.track1Soloed).toBe(false);
  });

  test('can update track pan via mixer API', async ({ page }) => {
    const pan = await page.evaluate(() => {
      const store = (window as any).__store;
      const trackId = store.getState().project?.tracks[0]?.id;
      store.getState().updateTrackMixer(trackId, { pan: -0.5 });
      return store.getState().project?.tracks[0]?.pan;
    });
    expect(pan).toBe(-0.5);
  });

  test('can add and remove effects', async ({ page }) => {
    const result = await page.evaluate(() => {
      const store = (window as any).__store;
      const trackId = store.getState().project?.tracks[0]?.id;
      const effectId = store.getState().addTrackEffect(trackId, 'reverb');
      const countAfterAdd = store.getState().project?.tracks[0]?.effects?.length ?? 0;
      if (effectId) store.getState().removeTrackEffect(trackId, effectId);
      const countAfterRemove = store.getState().project?.tracks[0]?.effects?.length ?? 0;
      return { countAfterAdd, countAfterRemove };
    });
    expect(result.countAfterAdd).toBe(1);
    expect(result.countAfterRemove).toBe(0);
  });

  test('can duplicate a track', async ({ page }) => {
    const trackCount = await page.evaluate(() => {
      const store = (window as any).__store;
      const trackId = store.getState().project?.tracks[0]?.id;
      store.getState().duplicateTrack(trackId);
      return store.getState().project?.tracks.length;
    });
    expect(trackCount).toBe(3); // 2 original + 1 duplicate
  });
});
