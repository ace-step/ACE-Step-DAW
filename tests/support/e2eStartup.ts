import { expect, type Page } from '@playwright/test';
import { getProjectName, waitForBrowserStores, type E2EBrowserWindow } from './browserStores';

export async function loadFreshApp(page: Page) {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    // Dismiss the WelcomeOverlay so it doesn't block E2E tests with its focus trap
    localStorage.setItem('ace-step-welcome-seen', 'true');
  });
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await waitForBrowserStores(page);
}

/**
 * Dismiss the WelcomeOverlay before page load.
 * Use in test.beforeEach when not using loadFreshApp().
 */
export async function dismissWelcomeOverlay(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('ace-step-welcome-seen', 'true');
  });
}

export async function loadReturningUserApp(page: Page) {
  await loadFreshApp(page);
}

export async function ensureNewProjectDialog(page: Page) {
  await expect(page.getByRole('heading', { name: 'New Project' })).toBeVisible({
    timeout: 10000,
  });
}

export async function createProjectViaDialog(
  page: Page,
  name = 'E2E Test Project',
  bpm?: number,
) {
  await ensureNewProjectDialog(page);
  const dialog = page.locator('.fixed.inset-0').filter({
    has: page.getByRole('heading', { name: 'New Project' }),
  }).first();
  await expect(dialog).toBeVisible();

  const nameInput = dialog.locator('input[type="text"]').first();
  await nameInput.fill(name);

  if (typeof bpm === 'number') {
    const bpmInput = dialog.locator('input[type="number"]').first();
    await bpmInput.fill(String(bpm));
  }

  await dialog.locator('button:has-text("Create")').first().click();
  await page.waitForFunction(
    (expectedName) => {
      const dawWindow = window as E2EBrowserWindow;
      return dawWindow.__store.getState().project?.name === expectedName;
    },
    name,
    { timeout: 5000 },
  );
  await expect(page.getByRole('heading', { name: 'New Project' })).toBeHidden({
    timeout: 5000,
  });

  await expect.poll(async () => getProjectName(page)).toBe(name);
}

export async function focusApplicationShell(page: Page) {
  await page.evaluate(() => {
    const app = document.querySelector('[aria-label="ACE-Step DAW"]') as HTMLElement | null;
    app?.focus();
  });
}
