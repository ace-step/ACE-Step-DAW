import { test, expect } from '@playwright/test';

/**
 * Exploratory tests for recently merged features:
 * - Comping / take lanes (#154, #180)
 * - Punch in/out (#149, #176)
 * - Timeline markers (#181)
 * - Track groups (#143) - if exposed
 * - Crossfade (#135) - if exposed
 * - Sends/Returns (#138) - if exposed
 */

test.describe('New Feature Verification', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => (window as any).__store !== undefined, null, { timeout: 5000 });
    // Create a project
    await page.evaluate(() => {
      const s = (window as any).__store;
      if (s.getState().createProject) s.getState().createProject('Test Project', 120);
    });
  });

  test('Punch in/out: can set punch times and toggle punch mode', async ({ page }) => {
    const result = await page.evaluate(() => {
      const s = (window as any).__store;
      const state = s.getState();
      // Initial state
      const initial = {
        punchInTime: state.punchInTime,
        punchOutTime: state.punchOutTime,
        punchEnabled: state.punchEnabled,
      };
      // Set punch times
      state.setPunchIn(4);
      state.setPunchOut(8);
      state.togglePunch();
      const after = s.getState();
      return {
        initial,
        after: {
          punchInTime: after.punchInTime,
          punchOutTime: after.punchOutTime,
          punchEnabled: after.punchEnabled,
        },
      };
    });

    expect(result.initial.punchInTime).toBeNull();
    expect(result.initial.punchOutTime).toBeNull();
    expect(result.initial.punchEnabled).toBe(false);
    expect(result.after.punchInTime).toBe(4);
    expect(result.after.punchOutTime).toBe(8);
    expect(result.after.punchEnabled).toBe(true);
  });

  test('Punch in/out: toggle punch off after enabling', async ({ page }) => {
    const result = await page.evaluate(() => {
      const s = (window as any).__store;
      const state = s.getState();
      state.setPunchIn(2);
      state.setPunchOut(6);
      state.togglePunch(); // on
      state.togglePunch(); // off
      return s.getState().punchEnabled;
    });
    expect(result).toBe(false);
  });

  test('Markers: can add and remove timeline markers', async ({ page }) => {
    const result = await page.evaluate(() => {
      const s = (window as any).__store;
      const state = s.getState();
      state.addMarker(4.0, 'Verse 1');
      state.addMarker(8.0, 'Chorus');
      const markers = s.getState().markers;
      const count = markers.length;
      // Remove first marker
      state.removeMarker(markers[0].id);
      const afterRemove = s.getState().markers;
      return { count, afterRemoveCount: afterRemove.length, remainingName: afterRemove[0]?.name };
    });
    expect(result.count).toBe(2);
    expect(result.afterRemoveCount).toBe(1);
    expect(result.remainingName).toBe('Chorus');
  });

  test('Comping: can add takes to a clip and select between them', async ({ page }) => {
    const result = await page.evaluate(() => {
      const s = (window as any).__store;
      const state = s.getState();
      // Add a track and clip
      state.addTrack({ name: 'Comp Track', type: 'audio' });
      const track = s.getState().tracks[s.getState().tracks.length - 1];
      state.addClip(track.id, { startTime: 0, duration: 4, audioKey: 'take1.wav' });
      const clip = s.getState().tracks.find((t: any) => t.id === track.id).clips[0];

      // Add takes
      state.addTake(clip.id, 'take2.wav');
      state.addTake(clip.id, 'take3.wav');
      const updatedClip = s.getState().tracks.find((t: any) => t.id === track.id).clips[0];
      const takeCount = updatedClip.takes?.length ?? 0;

      // Select a different take
      if (takeCount > 0) {
        state.selectTake(clip.id, updatedClip.takes[1].id);
      }

      const finalClip = s.getState().tracks.find((t: any) => t.id === track.id).clips[0];
      const selectedTake = finalClip.takes?.find((t: any) => t.selected);

      return {
        takeCount,
        selectedAudioKey: selectedTake?.audioKey,
      };
    });
    expect(result.takeCount).toBeGreaterThanOrEqual(2);
    expect(result.selectedAudioKey).toBe('take3.wav');
  });

  test('Comping: toggleTakeLanes toggles track showTakeLanes', async ({ page }) => {
    const result = await page.evaluate(() => {
      const s = (window as any).__store;
      const state = s.getState();
      state.addTrack({ name: 'Lanes Track', type: 'audio' });
      const track = s.getState().tracks[s.getState().tracks.length - 1];
      const before = track.showTakeLanes;
      state.toggleTakeLanes(track.id);
      const after = s.getState().tracks.find((t: any) => t.id === track.id).showTakeLanes;
      return { before, after };
    });
    expect(result.before).toBeFalsy();
    expect(result.after).toBe(true);
  });

  test('Edge case: add marker at time 0', async ({ page }) => {
    const result = await page.evaluate(() => {
      const s = (window as any).__store;
      s.getState().addMarker(0, 'Start');
      const markers = s.getState().markers;
      return { count: markers.length, time: markers[0]?.time, name: markers[0]?.name };
    });
    expect(result.count).toBe(1);
    expect(result.time).toBe(0);
    expect(result.name).toBe('Start');
  });

  test('Edge case: punch in time after punch out time', async ({ page }) => {
    // This tests whether the store handles invalid state gracefully
    const result = await page.evaluate(() => {
      const s = (window as any).__store;
      const state = s.getState();
      state.setPunchIn(10);
      state.setPunchOut(5); // out < in — potentially invalid
      const after = s.getState();
      return {
        punchInTime: after.punchInTime,
        punchOutTime: after.punchOutTime,
      };
    });
    // Store accepts it (no validation) — this is worth noting
    expect(result.punchInTime).toBe(10);
    expect(result.punchOutTime).toBe(5);
  });

  test('Edge case: rapid marker add/remove does not crash', async ({ page }) => {
    const result = await page.evaluate(() => {
      const s = (window as any).__store;
      const state = s.getState();
      for (let i = 0; i < 50; i++) {
        state.addMarker(i * 0.5, `M${i}`);
      }
      const count = s.getState().markers.length;
      // Remove all
      const markers = s.getState().markers;
      for (const m of markers) {
        s.getState().removeMarker(m.id);
      }
      return { added: count, remaining: s.getState().markers.length };
    });
    expect(result.added).toBe(50);
    expect(result.remaining).toBe(0);
  });

  test('Edge case: empty project with keyboard shortcuts does not crash', async ({ page }) => {
    // Delete all tracks first
    await page.evaluate(() => {
      const s = (window as any).__store;
      const state = s.getState();
      // Remove all tracks
      while (s.getState().tracks.length > 0) {
        state.removeTrack(s.getState().tracks[0].id);
      }
    });

    // Spam keyboard shortcuts on empty project
    const shortcuts = ['Space', 'KeyX', 'KeyB', 'KeyO', 'KeyY', 'KeyL', 'KeyK', 'KeyN', 'KeyZ', 'KeyI'];
    for (const key of shortcuts) {
      await page.keyboard.press(key);
      await page.waitForTimeout(50);
    }

    // Should still be functional
    const errors = await page.evaluate(() => {
      return (window as any).__consoleErrors?.length ?? 0;
    });
    // Page should still be responsive
    const storeExists = await page.evaluate(() => (window as any).__store !== undefined);
    expect(storeExists).toBe(true);
  });
});
