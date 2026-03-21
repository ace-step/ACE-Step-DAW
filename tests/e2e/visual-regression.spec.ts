import { test } from '@playwright/test';
import { loadReturningUserApp } from '../support/e2eStartup';

test.describe('Visual Regression Screenshots', () => {
  test.beforeEach(async ({ page }) => {
    await loadReturningUserApp(page);
  });

  test('empty project screenshot', async ({ page }) => {
    await page.evaluate(() => {
      const store = (window as any).__store;
      store.getState().createProject({ name: 'Visual Regression Test' });
    });
    // Wait for UI to settle
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-screenshots/vr-empty-project.png', fullPage: true });
  });

  test('with tracks screenshot', async ({ page }) => {
    await page.evaluate(() => {
      const store = (window as any).__store;
      store.getState().createProject({ name: 'Visual Regression Test' });
      store.getState().addTrack('guitar');
      store.getState().addTrack('synth');
      store.getState().addTrack('percussion', 'sequencer');
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-screenshots/vr-with-tracks.png', fullPage: true });
  });

  test('arrangement empty-lane alignment screenshot', async ({ page }) => {
    await page.evaluate(() => {
      const store = (window as any).__store;
      const uiStore = (window as any).__uiStore;
      uiStore.getState().setShowNewProjectDialog(false);
      store.getState().createProject({ name: 'Arrangement Alignment Visual Test' });
      store.getState().addTrack('guitar');
      store.getState().addTrack('synth');
    });
    await page.mouse.click(1100, 120);
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-screenshots/vr-arrangement-empty-lanes.png', fullPage: true });
  });

  test('empty stems lane gridlines screenshot', async ({ page }) => {
    await page.evaluate(() => {
      const store = (window as any).__store;
      const uiStore = (window as any).__uiStore;
      uiStore.getState().setShowNewProjectDialog(false);
      store.getState().createProject({ name: 'Empty Stems Lane Gridline Test' });
      store.getState().addTrack('drums');
      store.getState().addTrack('keyboard', 'pianoRoll');
    });
    await page.mouse.click(1100, 120);
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-screenshots/vr-empty-stems-lane-gridlines.png', fullPage: true });
  });

  test('arrangement track-header alignment with clips screenshot', async ({ page }) => {
    await page.evaluate(() => {
      const store = (window as any).__store;
      const uiStore = (window as any).__uiStore;
      uiStore.getState().setShowNewProjectDialog(false);

      store.getState().createProject({ name: 'Arrangement Header Alignment Visual Test', bpm: 120, keyScale: 'C major' });

      const drums = store.getState().addTrack('drums');
      const guitar = store.getState().addTrack('guitar');
      const brass = store.getState().addTrack('brass');
      const bass = store.getState().addTrack('bass');

      const addClip = (track: { id: string }, prompt: string, startTime = 0, duration = 8) => {
        store.getState().addClip(track.id, {
          startTime,
          duration,
          prompt,
          lyrics: '',
          source: 'generated',
        });
      };

      addClip(drums, 'Drums');
      addClip(guitar, 'Rhythm Guitar');
      addClip(brass, 'Jazz Brass');
      addClip(bass, 'Bass');
    });
    await page.mouse.click(1100, 120);
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-screenshots/vr-arrangement-track-alignment.png', fullPage: true });
  });

  test('mixer open screenshot', async ({ page }) => {
    await page.evaluate(() => {
      const store = (window as any).__store;
      store.getState().createProject({ name: 'Visual Regression Test' });
      store.getState().addTrack('guitar');
      store.getState().addTrack('synth');
      store.getState().addTrack('percussion', 'sequencer');
    });
    await page.waitForTimeout(500);
    // Press X to toggle mixer
    await page.keyboard.press('x');
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-screenshots/vr-mixer-open.png', fullPage: true });
  });
});
