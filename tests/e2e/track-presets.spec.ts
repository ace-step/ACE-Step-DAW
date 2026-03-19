import { expect, test } from '@playwright/test';

test.describe('Track Presets', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => typeof (window as any).__store !== 'undefined', null, { timeout: 10000 });
  });

  test('can save a track preset and apply it to a new track via the browser store API', async ({ page }) => {
    const result = await page.evaluate(() => {
      const store = (window as any).__store;
      store.getState().createProject({ name: 'Track Preset E2E' });

      const sourceTrack = store.getState().addTrack('keyboard', 'pianoRoll');
      store.getState().updateTrack(sourceTrack.id, { color: '#123456', synthPreset: 'pad' });
      store.getState().updateTrackMixer(sourceTrack.id, { pan: -0.25, eqHighGain: 4 });
      store.getState().addTrackEffect(sourceTrack.id, 'reverb');

      const preset = store.getState().saveTrackPreset(sourceTrack.id, 'Dream Keys');
      const appliedTrack = store.getState().applyTrackPreset(preset.id);

      return {
        presetCount: store.getState().project?.trackPresets?.length ?? 0,
        trackCount: store.getState().project?.tracks?.length ?? 0,
        appliedTrack: appliedTrack
          ? {
              trackType: appliedTrack.trackType,
              synthPreset: appliedTrack.synthPreset,
              color: appliedTrack.color,
              pan: appliedTrack.pan,
              eqHighGain: appliedTrack.eqHighGain,
              effectTypes: (appliedTrack.effects ?? []).map((effect: { type: string }) => effect.type),
            }
          : null,
      };
    });

    expect(result).toEqual({
      presetCount: 1,
      trackCount: 2,
      appliedTrack: {
        trackType: 'pianoRoll',
        synthPreset: 'pad',
        color: '#123456',
        pan: -0.25,
        eqHighGain: 4,
        effectTypes: ['reverb'],
      },
    });
  });
});
