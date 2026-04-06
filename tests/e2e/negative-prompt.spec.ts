/**
 * Covered story: #1094 — Negative Prompting
 *
 * Persona: user excluding unwanted elements from AI generation
 * Workflow: open generation panel, expand negative prompt section, type exclusions and use chips
 * Why: validates the complete negative prompt UI flow
 */
import { expect, test } from '@playwright/test';

test.describe('Negative Prompt @generation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => typeof (window as any).__store !== 'undefined');
    await page.evaluate(() => {
      const browserWindow = window as unknown as {
        __store: {
          getState: () => {
            createProject: (params: { name: string; bpm: number; keyScale: string }) => void;
            addTrack: (trackName: string) => { id: string };
            setShowGenerationPanel: (value: boolean) => void;
          };
        };
      };

      browserWindow.__store.getState().createProject({
        name: 'Negative Prompt Test',
        bpm: 120,
        keyScale: 'C major',
      });
      browserWindow.__store.getState().addTrack('vocals');
      browserWindow.__store.getState().setShowGenerationPanel(true);
    });
    await page.mouse.click(24, 24);
  });

  test('negative prompt section is collapsed by default', async ({ page }) => {
    // Switch to Custom mode to see FullSongForm
    const customTab = page.getByRole('tab', { name: /custom/i });
    if (await customTab.isVisible()) {
      await customTab.click();
    }

    const section = page.getByTestId('negative-prompt-section');
    await expect(section).toBeVisible();

    // Textarea should not be visible when collapsed
    await expect(page.getByTestId('negative-prompt-input')).not.toBeVisible();
  });

  test('expands negative prompt and enters text', async ({ page }) => {
    const customTab = page.getByRole('tab', { name: /custom/i });
    if (await customTab.isVisible()) {
      await customTab.click();
    }

    // Expand the section
    await page.getByTestId('negative-prompt-toggle').click();

    // Type in the textarea
    const input = page.getByTestId('negative-prompt-input');
    await expect(input).toBeVisible();
    await input.fill('no autotune, no heavy reverb');

    // Verify store state
    const negativePrompt = await page.evaluate(() => {
      const browserWindow = window as unknown as {
        __store: {
          getState: () => {
            generationForm: { negativePrompt: string };
          };
        };
      };
      return browserWindow.__store.getState().generationForm.negativePrompt;
    });
    expect(negativePrompt).toBe('no autotune, no heavy reverb');
  });

  test('clicking suggestion chip adds to negative prompt', async ({ page }) => {
    const customTab = page.getByRole('tab', { name: /custom/i });
    if (await customTab.isVisible()) {
      await customTab.click();
    }

    await page.getByTestId('negative-prompt-toggle').click();

    // Click a chip
    const chips = page.getByTestId('negative-prompt-chips');
    await chips.getByText('no distortion').click();

    // Verify it was added
    const input = page.getByTestId('negative-prompt-input');
    await expect(input).toHaveValue('no distortion');
  });

  test('negative prompt persists when collapsing and re-expanding', async ({ page }) => {
    const customTab = page.getByRole('tab', { name: /custom/i });
    if (await customTab.isVisible()) {
      await customTab.click();
    }

    // Expand and type
    await page.getByTestId('negative-prompt-toggle').click();
    await page.getByTestId('negative-prompt-input').fill('no falsetto');

    // Collapse
    await page.getByTestId('negative-prompt-toggle').click();
    await expect(page.getByTestId('negative-prompt-input')).not.toBeVisible();

    // Re-expand
    await page.getByTestId('negative-prompt-toggle').click();
    await expect(page.getByTestId('negative-prompt-input')).toHaveValue('no falsetto');
  });
});
