import { expect, test } from '@playwright/test';

test.describe('Clip fade handles', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(
      () => (window as any).__store !== undefined && (window as any).__uiStore !== undefined,
      null,
      { timeout: 10000 },
    );

    await page.evaluate(() => {
      const store = (window as any).__store;
      const uiStore = (window as any).__uiStore;

      store.getState().createProject({ name: 'Clip Fade E2E', bpm: 120 });
      uiStore.getState().setShowNewProjectDialog(false);
      const track = store.getState().addTrack('vocals');
      const clip = store.getState().addClip(track.id, {
        startTime: 0,
        duration: 4,
        prompt: 'Fade test',
        lyrics: '',
        source: 'uploaded',
      });

      store.getState().updateClipStatus(clip.id, 'ready', {
        isolatedAudioKey: 'stub-audio',
        waveformPeaks: [0.2, 0.4, 0.6, 0.3, 0.8],
      });

      uiStore.getState().setPixelsPerSecond(80);
    });
  });

  test('supports keyboard-adjustable fade handles on audio clips', async ({ page }) => {
    await expect(page.getByRole('slider', { name: /fade in handle/i })).toHaveCount(0);
    await expect(page.getByRole('slider', { name: /fade out handle/i })).toHaveCount(0);

    await page.evaluate(() => {
      const store = (window as any).__store;
      const clip = store.getState().project.tracks[0].clips[0];
      store.getState().setClipFade(clip.id, { fadeInDuration: 0.2, fadeOutDuration: 0.4 });
    });

    const fadeInHandle = page.getByRole('slider', { name: /fade in handle/i });
    await expect(fadeInHandle).toBeVisible();

    await fadeInHandle.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');

    const fadeState = await page.evaluate(() => {
      const clip = (window as any).__store.getState().project.tracks[0].clips[0];
      return {
        fadeInDuration: clip.fadeInDuration,
        fadeOutDuration: clip.fadeOutDuration ?? 0,
      };
    });

    expect(fadeState.fadeInDuration).toBe(0.8);
    expect(fadeState.fadeOutDuration).toBe(0.4);

    const fadeOutHandle = page.getByRole('slider', { name: /fade out handle/i });
    await fadeOutHandle.dblclick();

    const fadeOutAfterReset = await page.evaluate(() => {
      return (window as any).__store.getState().project.tracks[0].clips[0].fadeOutDuration ?? 0;
    });

    expect(fadeOutAfterReset).toBe(0);
    await expect(page.getByRole('slider', { name: /fade out handle/i })).toHaveCount(0);
  });
});
