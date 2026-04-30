/**
 * Covered story ids:
 * - TRN-001, TRN-002
 *
 * Persona: keyboard-first DAW user
 * Workflow summary: verify transport presence and the basic keyboard and button
 * interactions around playback control.
 * Why this test exists: protects the transport surface separately from larger bundles.
 * Left to other layers: detailed focus routing and human audible timing checks.
 */
import { test, expect, type Page } from '@playwright/test';
import {
  focusApplicationShell,
  loadFreshApp,
} from '../support/e2eStartup';
import {
  getProjectBpm,
  getTransportState,
  type E2EBrowserWindow,
} from '../support/browserStores';

async function readTransportLineX(page: Page) {
  return page.evaluate(() => {
    const line = document.querySelector<HTMLElement>('.playhead-glow');
    const transform = line?.style.transform ?? '';
    const match = /translateX\((-?\d+(?:\.\d+)?)px\)/.exec(transform);
    return match ? Number(match[1]) : null;
  });
}

async function focusTransportTestSurface(page: Page) {
  await page.evaluate(() => {
    const dawWindow = window as E2EBrowserWindow;
    const active = document.activeElement as HTMLElement | null;
    active?.blur?.();
    dawWindow.__uiStore.getState().setKeyboardContext('timeline');
    dawWindow.__uiStore.getState().setHistoryFocusScope('arrangement');
  });
  await page.mouse.click(10, 10);
  await focusApplicationShell(page);
}

test.describe('Transport Controls @critical', () => {
  test.beforeEach(async ({ page }) => {
    await loadFreshApp(page);
    await page.waitForFunction(
      () => typeof (window as E2EBrowserWindow).__transportStore !== 'undefined',
      null,
      { timeout: 10000 },
    );
    await page.evaluate(() => {
      const dawWindow = window as E2EBrowserWindow;
      dawWindow.__uiStore.getState().setShowNewProjectDialog(false);
      dawWindow.__store.getState().createProject({ name: 'Transport Test' });
      dawWindow.__store.getState().addTrack('drums');
      dawWindow.__transportStore.getState().seek(0);
    });
    await expect(page.getByTestId('transport-bar')).toBeVisible({ timeout: 10000 });
    await focusTransportTestSurface(page);
  });

  test('transport bar is visible', async ({ page }) => {
    // Wait for the transport bar using a stable data-testid selector
    await expect(page.getByTestId('transport-bar')).toBeVisible({ timeout: 10000 });
  });

  test('play button starts and pauses transport state', async ({ page }) => {
    await page.getByRole('button', { name: 'Play' }).click();
    await expect.poll(async () => (await getTransportState(page)).isPlaying).toBe(true);
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();

    await page.getByRole('button', { name: 'Pause' }).click();
    await expect.poll(async () => (await getTransportState(page)).isPlaying).toBe(false);
  });

  test('spacebar advances transport time and visible playhead position', async ({ page }) => {
    const before = await getTransportState(page);

    await page.keyboard.press('Space');

    await expect.poll(async () => (await getTransportState(page)).isPlaying).toBe(true);
    await expect.poll(async () => (await getTransportState(page)).currentTime, {
      timeout: 5000,
    }).toBeGreaterThan(before.currentTime + 0.05);

    await expect.poll(async () => await readTransportLineX(page) ?? -1, {
      timeout: 5000,
    }).toBeGreaterThan(0);
    const firstX = await readTransportLineX(page);
    expect(firstX).not.toBeNull();

    await expect.poll(async () => await readTransportLineX(page) ?? -1, {
      timeout: 5000,
    }).toBeGreaterThan((firstX ?? 0) + 2);

    await page.keyboard.press('Space');
    await expect.poll(async () => (await getTransportState(page)).isPlaying).toBe(false);

    const pausedTime = (await getTransportState(page)).currentTime;
    await page.waitForTimeout(250);
    const laterTime = (await getTransportState(page)).currentTime;
    expect(Math.abs(laterTime - pausedTime)).toBeLessThan(0.05);
  });

  test('loop and metronome shortcuts toggle their transport flags', async ({ page }) => {
    const initial = await getTransportState(page);

    await page.keyboard.press('l');
    await expect.poll(async () => (await getTransportState(page)).loopEnabled).toBe(!initial.loopEnabled);

    await page.keyboard.press('l');
    await expect.poll(async () => (await getTransportState(page)).loopEnabled).toBe(initial.loopEnabled);

    await page.keyboard.press('k');
    await expect.poll(async () => (await getTransportState(page)).metronomeEnabled).toBe(!initial.metronomeEnabled);

    await page.keyboard.press('k');
    await expect.poll(async () => (await getTransportState(page)).metronomeEnabled).toBe(initial.metronomeEnabled);
  });

  test('BPM display shows current BPM', async ({ page }) => {
    expect(await getProjectBpm(page)).toBe(120);
  });
});
