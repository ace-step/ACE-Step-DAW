import { test, expect } from '@playwright/test';

test.describe('MIDI Export Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => typeof (window as any).__store !== 'undefined', null, { timeout: 10000 });
    await page.evaluate(() => {
      (window as any).__store.getState().createProject({ name: 'MIDI Export E2E' });
      (window as any).__uiStore.getState().setShowNewProjectDialog(false);
    });
  });

  test('exports a piano roll clip as a .mid download', async ({ page }) => {
    const clipId = await page.evaluate(() => {
      const store = (window as any).__store;
      const track = store.getState().addTrack('keyboard', 'pianoRoll');
      store.getState().updateTrack(track.id, { displayName: 'Agent Keys' });
      const clip = store.getState().ensureMidiClip(track.id);
      store.getState().updateClip(clip.id, { prompt: 'Export Hook' });
      store.getState().addMidiNote(clip.id, { pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.8 });
      store.getState().addMidiNote(clip.id, { pitch: 64, startBeat: 1, durationBeats: 1, velocity: 0.7 });
      store.getState().addMidiNote(clip.id, { pitch: 67, startBeat: 2, durationBeats: 0.5, velocity: 0.9 });
      return clip.id;
    });

    await page.getByText('Click anywhere to enable audio').click();

    const clip = page.getByTestId(`clip-${clipId}`);
    await expect(clip).toBeVisible();

    await clip.click({ button: 'right', force: true });
    await expect(page.getByText('Open Piano Roll')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export MIDI Clip' })).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export MIDI Clip' }).click(),
    ]);

    expect(download.suggestedFilename()).toBe('MIDI Export E2E_Agent Keys_Export Hook.mid');
  });
});
