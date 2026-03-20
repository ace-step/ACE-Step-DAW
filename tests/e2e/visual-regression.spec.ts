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
      uiStore.getState().setShowOnboarding(false);
      uiStore.getState().setShowNewProjectDialog(false);
      uiStore.setState({
        dismissedOnboardingTipIds: ['genr-first-pass', 'loop-browser', 'timeline-selection'],
      });
      store.getState().createProject({ name: 'Arrangement Alignment Visual Test' });
      store.getState().addTrack('guitar');
      store.getState().addTrack('synth');
    });
    await page.mouse.click(1100, 120);
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'test-screenshots/vr-arrangement-empty-lanes.png', fullPage: true });
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
