import { test, expect } from '@playwright/test';

test.describe('Visual Regression Screenshots', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(
      () => typeof (window as any).__store !== 'undefined' && typeof (window as any).__uiStore !== 'undefined',
      null,
      { timeout: 10000 }
    );
  });

  test('empty project', async ({ page }) => {
    await page.evaluate(() => {
      (window as any).__store.getState().createProject({ name: 'Visual Regression Test' });
    });
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('empty-project.png', { fullPage: true });
  });

  test('with tracks', async ({ page }) => {
    await page.evaluate(() => {
      const store = (window as any).__store;
      store.getState().createProject({ name: 'Visual Regression Test' });
      store.getState().addTrack('stems');
      store.getState().addTrack('sample');
      store.getState().addTrack('sequencer');
    });
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('with-tracks.png', { fullPage: true });
  });

  test('mixer open', async ({ page }) => {
    await page.evaluate(() => {
      const store = (window as any).__store;
      store.getState().createProject({ name: 'Visual Regression Test' });
      store.getState().addTrack('stems');
      store.getState().addTrack('sample');
      store.getState().addTrack('sequencer');
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      (window as any).__uiStore.getState().setShowMixer(true);
    });
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('mixer-open.png', { fullPage: true });
  });

  test('piano roll open', async ({ page }) => {
    await page.evaluate(() => {
      const store = (window as any).__store;
      store.getState().createProject({ name: 'Visual Regression Test' });
      const track = store.getState().addTrack('keyboard', 'pianoRoll');
      const clip = store.getState().ensureMidiClip(track.id);
      store.getState().addMidiNote(clip.id, { pitch: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
      store.getState().addMidiNote(clip.id, { pitch: 64, startBeat: 1, durationBeats: 1, velocity: 80 });
      store.getState().addMidiNote(clip.id, { pitch: 67, startBeat: 2, durationBeats: 1, velocity: 90 });
      (window as any).__uiStore.getState().setOpenPianoRoll(track.id, clip.id);
    });
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('piano-roll-open.png', { fullPage: true });
  });

  test('sequencer open', async ({ page }) => {
    await page.evaluate(() => {
      const store = (window as any).__store;
      store.getState().createProject({ name: 'Visual Regression Test' });
      const track = store.getState().addTrack('percussion', 'sequencer');
      const pattern = store.getState().project?.tracks[0]?.sequencerPattern;
      if (pattern && pattern.rows.length > 0) {
        const rowId = pattern.rows[0].id;
        store.getState().batchSetSequencerSteps(track.id, [
          { rowId, stepIndex: 0, active: true, velocity: 100 },
          { rowId, stepIndex: 4, active: true, velocity: 80 },
          { rowId, stepIndex: 8, active: true, velocity: 100 },
          { rowId, stepIndex: 12, active: true, velocity: 80 },
        ]);
      }
      (window as any).__uiStore.getState().setOpenSequencerTrackId(track.id);
    });
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot('sequencer-open.png', { fullPage: true });
  });
});
