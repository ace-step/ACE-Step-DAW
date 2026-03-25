import { test, expect } from '@playwright/test';
import { getArrangementEmptyTrackId } from '../../src/components/arrangement/trackSlotLayout';
import { loadReturningUserApp } from '../support/e2eStartup';
import type { E2EBrowserWindow } from '../support/browserStores';

test.describe('Empty arrangement lane playhead anchor', () => {
  test('clicking an empty lane shows the playhead anchor cursor', async ({ page }) => {
    const emptyTrackId = getArrangementEmptyTrackId(1);

    await loadReturningUserApp(page);
    await page.evaluate(() => {
      const dawWindow = window as E2EBrowserWindow;
      dawWindow.__uiStore.getState().setShowNewProjectDialog(false);
      dawWindow.__store.getState().createProject({ name: 'Empty Lane Playhead Regression' });
      dawWindow.__store.getState().addTrack('drums');
    });

    const emptyLane = page.getByTestId('empty-row-1');
    await expect(emptyLane).toBeVisible();
    await emptyLane.click({ position: { x: 240, y: 20 } });

    await expect.poll(async () => page.evaluate(({ targetEmptyTrackId }) => {
      const dawWindow = window as E2EBrowserWindow;
      const ui = dawWindow.__uiStore.getState();
      const transport = dawWindow.__transportStore.getState();
      const hasBlinkCursor = Array.from(document.querySelectorAll<HTMLElement>('div'))
        .some((el) => el.style.animation.includes('playhead-blink-line') && el.style.height.length > 0);

      return (
        ui.selectedTrackIds.has(targetEmptyTrackId)
        && ui.trackLaneRects.has(targetEmptyTrackId)
        && transport.playStartTime > 0
        && Math.abs(transport.currentTime - transport.playStartTime) < 0.001
        && hasBlinkCursor
      );
    }, { targetEmptyTrackId: emptyTrackId })).toBe(true);
  });
});
