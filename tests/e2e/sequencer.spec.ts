import { test, expect } from '@playwright/test';

test.describe('Sequencer Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => typeof (window as any).__store !== 'undefined', null, { timeout: 10000 });
    // Create a fresh project with a drum track
    await page.evaluate(() => {
      const store = (window as any).__store;
      store.getState().createProject({ name: 'Sequencer Test' });
    });
  });

  test('can add a drum track via store API', async ({ page }) => {
    const trackType = await page.evaluate(() => {
      const store = (window as any).__store;
      const track = store.getState().addTrack('percussion', 'sequencer');
      return store.getState().project?.tracks[0]?.trackType;
    });
    expect(trackType).toBe('sequencer');
  });

  test('can toggle sequencer steps via store API', async ({ page }) => {
    const result = await page.evaluate(() => {
      const store = (window as any).__store;
      const track = store.getState().addTrack('percussion', 'sequencer');
      const pattern = store.getState().project?.tracks[0]?.sequencerPattern;
      if (!pattern || pattern.rows.length === 0) return null;

      const rowId = pattern.rows[0].id;
      // Toggle step 0 on
      store.getState().toggleSequencerStep(track.id, rowId, 0);
      const step0 = store.getState().project?.tracks[0]?.sequencerPattern?.rows[0]?.steps[0];
      return { active: step0?.active, velocity: step0?.velocity };
    });

    expect(result).not.toBeNull();
    expect(result!.active).toBe(true);
    expect(result!.velocity).toBeGreaterThan(0);
  });

  test('can toggle a step off after toggling on', async ({ page }) => {
    const isActive = await page.evaluate(() => {
      const store = (window as any).__store;
      const track = store.getState().addTrack('percussion', 'sequencer');
      const pattern = store.getState().project?.tracks[0]?.sequencerPattern;
      if (!pattern) return null;
      const rowId = pattern.rows[0].id;

      store.getState().toggleSequencerStep(track.id, rowId, 0);
      store.getState().toggleSequencerStep(track.id, rowId, 0); // toggle off
      return store.getState().project?.tracks[0]?.sequencerPattern?.rows[0]?.steps[0]?.active;
    });

    expect(isActive).toBe(false);
  });

  test('can batch set multiple sequencer steps', async ({ page }) => {
    const activeCount = await page.evaluate(() => {
      const store = (window as any).__store;
      const track = store.getState().addTrack('percussion', 'sequencer');
      const pattern = store.getState().project?.tracks[0]?.sequencerPattern;
      if (!pattern) return 0;
      const rowId = pattern.rows[0].id;

      store.getState().batchSetSequencerSteps(track.id, [
        { rowId, stepIndex: 0, active: true, velocity: 100 },
        { rowId, stepIndex: 4, active: true, velocity: 80 },
        { rowId, stepIndex: 8, active: true, velocity: 100 },
        { rowId, stepIndex: 12, active: true, velocity: 80 },
      ]);

      const steps = store.getState().project?.tracks[0]?.sequencerPattern?.rows[0]?.steps;
      return steps?.filter((s: any) => s.active).length ?? 0;
    });

    expect(activeCount).toBe(4);
  });

  test('drum track has the expected number of rows', async ({ page }) => {
    const rowCount = await page.evaluate(() => {
      const store = (window as any).__store;
      store.getState().addTrack('percussion', 'sequencer');
      return store.getState().project?.tracks[0]?.sequencerPattern?.rows?.length ?? 0;
    });

    // Default drum kit should have multiple rows (kick, snare, hi-hat, etc.)
    expect(rowCount).toBeGreaterThanOrEqual(4);
  });

  test('each sequencer row has 16 steps by default', async ({ page }) => {
    const stepCount = await page.evaluate(() => {
      const store = (window as any).__store;
      store.getState().addTrack('percussion', 'sequencer');
      return store.getState().project?.tracks[0]?.sequencerPattern?.rows[0]?.steps?.length ?? 0;
    });

    expect(stepCount).toBe(16);
  });
});
