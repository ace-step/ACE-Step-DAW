import { test, expect } from '@playwright/test';

test.describe('Mixer Operations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => typeof (window as any).__store !== 'undefined', null, { timeout: 10000 });
    await page.waitForFunction(() => typeof (window as any).__uiStore !== 'undefined', null, { timeout: 10000 });
    await page.waitForFunction(() => typeof (window as any).__getAudioEngine === 'function', null, { timeout: 10000 });
    await page.evaluate(() => {
      const store = (window as any).__store;
      const uiStore = (window as any).__uiStore;
      uiStore.getState().setShowNewProjectDialog(false);
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

  test('keeps the AI Master panel and master fader separated at minimum mixer height', async ({ page }) => {
    await page.getByText('Click anywhere to enable audio').click();

    await page.evaluate(async () => {
      const store = (window as any).__store;
      const ui = (window as any).__uiStore;
      ui.getState().setShowMixer(true);
      ui.getState().setMixerHeight(160);
      await store.getState().analyzeMastering();
    });

    await page.waitForFunction(() => (window as any).__uiStore?.getState().showMixer === true);
    await expect(page.getByRole('button', { name: 'Re-analyze master bus' })).toBeVisible();
    await expect(page.getByRole('slider', { name: 'Master volume fader' })).toBeVisible();
    await expect(page.getByRole('slider', { name: /volume fader/i }).first()).toBeVisible();

    const layout = await page.evaluate(() => {
      const analyzeButton = document.querySelector('[aria-label="Re-analyze master bus"]') as HTMLElement | null;
      const masterSlider = document.querySelector('[aria-label="Master volume fader"]') as HTMLElement | null;
      const trackSlider = document.querySelector('[aria-label$="volume fader"]:not([aria-label="Master volume fader"])') as HTMLElement | null;
      const masteringPanel = analyzeButton?.closest('div[class*="rounded-lg"]') as HTMLElement | null;
      const controls = masteringPanel?.parentElement as HTMLElement | null;
      const fader = masterSlider?.parentElement?.parentElement as HTMLElement | null;
      if (!controls || !fader || !masterSlider || !trackSlider) return null;

      const controlsRect = controls.getBoundingClientRect();
      const faderRect = fader.getBoundingClientRect();
      const masterSliderRect = masterSlider.getBoundingClientRect();
      const trackSliderRect = trackSlider.getBoundingClientRect();

      return {
        controlsBottom: controlsRect.bottom,
        faderTop: faderRect.top,
        masterSliderHeight: masterSliderRect.height,
        trackSliderHeight: trackSliderRect.height,
        controlsScrollable: controls.scrollHeight > controls.clientHeight,
      };
    });

    expect(layout).not.toBeNull();
    expect(layout!.controlsBottom).toBeLessThanOrEqual(layout!.faderTop + 1);
    expect(layout!.masterSliderHeight).toBeGreaterThanOrEqual(96);
    expect(layout!.trackSliderHeight).toBeGreaterThanOrEqual(96);
    expect(layout!.controlsScrollable).toBe(true);

    await page.screenshot({ path: 'test-screenshots/issue-296-master-layout.png', fullPage: true });
  });

  test('shows and resets the track clip indicator', async ({ page }) => {
    const trackId = await page.evaluate(() => {
      const store = (window as any).__store;
      const uiStore = (window as any).__uiStore;
      const engine = (window as any).__getAudioEngine();

      let rafId = 0;
      (window as any).requestAnimationFrame = (cb: FrameRequestCallback) => {
        const id = ++rafId;
        window.setTimeout(() => cb(performance.now()), 16);
        return id;
      };
      (window as any).cancelAnimationFrame = () => {};

      uiStore.getState().setShowMixer(true);

      const firstTrackId = store.getState().project?.tracks[0]?.id;
      let clipped = true;
      engine.getTrackMeter = (id: string) => (
        id === firstTrackId
          ? { level: clipped ? 1 : 0.25, clipped }
          : { level: 0, clipped: false }
      );
      engine.resetTrackClip = (id: string) => {
        if (id === firstTrackId) clipped = false;
      };

      return firstTrackId;
    });

    await expect(page.getByLabel(`Mixer level meter for ${trackId}`)).toBeVisible();

    const resetButton = page.getByRole('button', { name: `Reset clip indicator for ${trackId}` });
    await expect(resetButton).toBeVisible();
    const enableAudioOverlay = page.getByText('Click anywhere to enable audio');
    if (await enableAudioOverlay.isVisible()) {
      await enableAudioOverlay.click();
    }
    await resetButton.click();
    await expect(resetButton).toBeHidden();
  });
});
