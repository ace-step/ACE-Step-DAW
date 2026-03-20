import { expect, type Page } from '@playwright/test';

export async function loadFreshApp(page: Page) {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(
    () => typeof (window as any).__store !== 'undefined',
    null,
    { timeout: 15000 },
  );
}

export async function loadReturningUserApp(page: Page) {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('ace-step-daw-ui', JSON.stringify({
      state: {
        onboardingCompleted: true,
        onboardingSkipped: true,
        showOnboarding: false,
      },
      version: 0,
    }));
  });
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(
    () => typeof (window as any).__store !== 'undefined',
    null,
    { timeout: 15000 },
  );
}

export async function ensureOnboardingVisible(page: Page) {
  await expect(page.getByLabel('First-run onboarding')).toBeVisible({ timeout: 10000 });
}

export async function skipOnboardingToNewProject(page: Page) {
  if (await page.getByLabel('First-run onboarding').isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Skip For Now' }).click();
  }

  await expect(page.getByRole('heading', { name: 'New Project' })).toBeVisible({
    timeout: 10000,
  });
}

export async function ensureNewProjectDialog(page: Page) {
  await skipOnboardingToNewProject(page);
}

export async function createProjectViaDialog(
  page: Page,
  name = 'E2E Test Project',
  bpm?: number,
) {
  await ensureNewProjectDialog(page);

  const nameInput = page.locator('input[type="text"]').first();
  await nameInput.fill(name);

  if (typeof bpm === 'number') {
    const bpmInput = page.locator('input[type="number"]').first();
    await bpmInput.fill(String(bpm));
  }

  await page.locator('button:has-text("Create")').first().click();
  await page.waitForFunction(
    (expectedName) => (window as any).__store.getState().project?.name === expectedName,
    name,
    { timeout: 5000 },
  );
  await expect(page.getByRole('heading', { name: 'New Project' })).toBeHidden({
    timeout: 5000,
  });
}

export async function focusApplicationShell(page: Page) {
  await page.evaluate(() => {
    const app = document.querySelector('[aria-label="ACE-Step DAW"]') as HTMLElement | null;
    app?.focus();
  });
}
