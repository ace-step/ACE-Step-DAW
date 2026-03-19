import { expect, test } from '@playwright/test';

const modKey = process.platform === 'darwin' ? 'Meta' : 'Control';

test.describe('Bounce In Place', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => typeof (window as any).__store !== 'undefined', null, { timeout: 10000 });
    await page.evaluate(() => {
      const store = (window as any).__store;
      const ui = (window as any).__uiStore;

      store.getState().createProject({ name: 'Bounce E2E' });
      ui.getState().setShowNewProjectDialog(false);

      const track = store.getState().addTrack('keyboard', 'pianoRoll');
      store.getState().updateTrack(track.id, { displayName: 'Agent Keys', synthPreset: 'pad' });
      const clip = store.getState().ensureMidiClip(track.id, 1, 2);
      store.getState().addMidiNote(clip.id, { pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.8 });
      store.getState().addMidiNote(clip.id, { pitch: 64, startBeat: 1, durationBeats: 1, velocity: 0.75 });
      store.getState().addMidiNote(clip.id, { pitch: 67, startBeat: 2, durationBeats: 0.5, velocity: 0.7 });
    });
  });

  test('opens from shortcut and context menu, then bounces the track in place', async ({ page }) => {
    await page.getByText('Click anywhere to enable audio').click();

    const clip = page.getByTestId(/clip-/).first();
    await expect(clip).toBeVisible();
    await page.evaluate(() => {
      const store = (window as any).__store;
      const ui = (window as any).__uiStore;
      const clipId = store.getState().project?.tracks?.[0]?.clips?.[0]?.id;
      if (clipId) {
        ui.getState().selectClip(clipId, false);
      }
    });

    await page.keyboard.press(`${modKey}+B`);
    await page.waitForFunction(() => (window as any).__uiStore.getState().bounceInPlaceTrackId !== null);
    await expect(page.getByRole('heading', { name: 'Bounce In Place' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();

    await page.getByText('Agent Keys').click({ button: 'right', force: true });
    await expect(page.getByRole('button', { name: 'Bounce in Place...' }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Bounce in Place...' }).first().click();

    await expect(page.getByLabel('Include effects')).toBeVisible();
    await Promise.all([
      page.waitForFunction(() => {
        const project = (window as any).__store.getState().project;
        return project?.tracks?.[0]?.trackType === 'sample' && project?.tracks?.[0]?.clips?.[0]?.isolatedAudioKey;
      }),
      page.getByRole('button', { name: 'Bounce Track' }).click(),
    ]);

    const bounced = await page.evaluate(() => {
      const track = (window as any).__store.getState().project?.tracks?.[0];
      return {
        trackType: track?.trackType,
        clipCount: track?.clips?.length ?? 0,
        audioKey: track?.clips?.[0]?.isolatedAudioKey ?? null,
      };
    });

    expect(bounced).toEqual({
      trackType: 'sample',
      clipCount: 1,
      audioKey: expect.any(String),
    });
  });
});
