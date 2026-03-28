import { expect, test } from '@playwright/test';

test.describe('Claude Code Terminal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => typeof (window as any).__store !== 'undefined');
    await page.evaluate(() => {
      const store = (window as any).__store;
      store.getState().createProject({ name: 'Terminal Test', bpm: 128 });
    });
    await page.mouse.click(24, 24);
  });

  test('opens Claude Code terminal with Cmd+/', async ({ page }) => {
    await page.keyboard.press('Meta+/');
    await expect(page.getByTestId('claude-terminal')).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Claude Code Terminal' })).toBeVisible();
  });

  test('closes terminal with Cmd+/ toggle', async ({ page }) => {
    await page.keyboard.press('Meta+/');
    await expect(page.getByTestId('claude-terminal')).toBeVisible();

    await page.keyboard.press('Meta+/');
    await expect(page.getByTestId('claude-terminal')).not.toBeVisible();
  });

  test('closes other right panels when opening terminal', async ({ page }) => {
    // Open mixer first
    await page.evaluate(() => {
      (window as any).__uiStore.getState().setShowMixer(true);
    });

    // Open terminal
    await page.keyboard.press('Meta+/');

    // Mixer should be closed
    const mixerVisible = await page.evaluate(() => (window as any).__uiStore.getState().showMixer);
    expect(mixerVisible).toBe(false);

    // Terminal should be open
    await expect(page.getByTestId('claude-terminal')).toBeVisible();
  });

  test('shows connection status indicator', async ({ page }) => {
    await page.keyboard.press('Meta+/');
    await expect(page.getByTestId('claude-terminal')).toBeVisible();

    // Should show some connection status text (Connected, Connecting, or Disconnected)
    const terminalPanel = page.getByTestId('claude-terminal');
    const statusText = await terminalPanel.locator('text=/Connected|Connecting|Disconnected/').textContent();
    expect(statusText).toBeTruthy();
  });
});
