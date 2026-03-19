import { test, expect } from '@playwright/test';

test.describe('first-run onboarding', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto('/');
    await page.waitForFunction(() => typeof (window as any).__store !== 'undefined', null, { timeout: 10000 });
  });

  test('first launch shows onboarding before the main workspace setup dialogs', async ({ page }) => {
    await page.waitForFunction(() => (window as any).__uiStore.getState().showOnboarding === true, null, { timeout: 10000 });
    await expect(page.getByLabel('First-run onboarding')).toBeVisible();
    await expect(page.getByText('Start in a session that already knows where you are going.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'New Project' })).not.toBeVisible();
  });

  test('starting from a demo project applies advanced defaults and opens tutorial', async ({ page }) => {
    await page.getByRole('button', { name: 'Neon Run Demo' }).click();
    await page.getByRole('button', { name: 'Advanced' }).click();
    await page.getByRole('button', { name: 'Open Neon Run Demo' }).click();

    await expect(page.getByText('Tutorial 1/5')).toBeVisible();

    const state = await page.evaluate(() => {
      const ui = (window as any).__uiStore.getState();
      const project = (window as any).__store.getState().project;
      return {
        projectName: project?.name,
        trackCount: project?.tracks?.length ?? 0,
        showMixer: ui.showMixer,
        showLibrary: ui.showLibrary,
        loopBrowserOpen: ui.loopBrowserOpen,
        workspaceComplexity: ui.workspaceComplexity,
      };
    });

    expect(state.projectName).toBe('Neon Run Demo');
    expect(state.trackCount).toBeGreaterThanOrEqual(4);
    expect(state.showMixer).toBe(true);
    expect(state.showLibrary).toBe(true);
    expect(state.loopBrowserOpen).toBe(true);
    expect(state.workspaceComplexity).toBe('advanced');
  });

  test('dismissing a contextual tip persists across reload', async ({ page }) => {
    await page.getByRole('button', { name: 'Late Night Hip Hop' }).click();
    await page.getByRole('button', { name: 'Open Late Night Hip Hop' }).click();

    for (let i = 0; i < 5; i++) {
      await page.getByRole('button', { name: i === 4 ? 'Finish' : 'Next' }).click();
    }

    await expect(page.getByLabel('Tip: Start with genr')).toBeVisible();
    await page.getByLabel('Dismiss tip Start with genr').click();
    await expect(page.getByLabel('Tip: Start with genr')).not.toBeVisible();

    await page.reload();
    await page.waitForFunction(() => typeof (window as any).__store !== 'undefined', null, { timeout: 10000 });
    await expect(page.getByLabel('Tip: Start with genr')).not.toBeVisible();
  });
});
