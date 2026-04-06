/**
 * Covered story ids:
 * - GEN-001, GEN-002
 *
 * Persona: user invoking AI generation
 * Workflow summary: open and interact with the generation panel around the
 * prompt-to-content workflow.
 * Why this test exists: covers the visible AI generation surface tied to the
 * matrix generation stories.
 * Left to other layers: backend-dependent success quality and human music judgment.
 */
import { expect, test } from '@playwright/test';
import { dismissWelcomeOverlay } from '../support/e2eStartup';

test.describe('Generation Panel @critical', () => {
  test.beforeEach(async ({ page }) => {
    await dismissWelcomeOverlay(page);
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
        name: 'Generation Panel Test',
        bpm: 128,
        keyScale: 'E minor',
      });
      browserWindow.__store.getState().addTrack('drums');
      browserWindow.__store.getState().setShowGenerationPanel(true);
    });
  });

  test('submits the visible generation controls through the shared store payload', async ({ page }) => {
    await expect(page.getByRole('complementary', { name: 'AI generation panel' })).toBeVisible();

    await page.getByRole('textbox', { name: 'Generation prompt' }).fill('glassy future garage with vocal chops');
    await page.getByTestId('generation-style-tags').getByRole('button', { name: 'Electronic' }).click();
    await page.getByRole('combobox', { name: 'Generation key' }).selectOption('G minor');
    await page.getByRole('spinbutton', { name: 'Generation BPM' }).fill('140');
    await page.getByRole('spinbutton', { name: 'Generation length' }).fill('48');
    await page.getByTestId('generation-temperature-slider').focus();
    for (let index = 0; index < 5; index += 1) {
      await page.keyboard.press('ArrowLeft');
    }
    await page.getByRole('combobox', { name: 'Generation variation count' }).selectOption('4');
    await page.getByTestId('generation-generate-btn').click();

    const state = await page.evaluate(() => {
      const browserWindow = window as unknown as {
        __store: {
          getState: () => {
            generationForm: {
              prompt: string;
              styleTags: string[];
              bpm: number;
              keyScale: string;
              lengthSeconds: number;
              temperature: number;
              variationCount: number;
            };
            lastSubmittedRequest: {
              prompt: string;
              styleTags: string[];
              bpm: number;
              keyScale: string;
              duration: number;
              temperature: number;
              variationCount: number;
            } | null;
            variationSession: {
              variations: Array<unknown>;
            } | null;
          };
        };
      };

      const dawState = browserWindow.__store.getState();
      return {
        generationForm: dawState.generationForm,
        lastSubmittedRequest: dawState.lastSubmittedRequest,
        variationCount: dawState.variationSession?.variations.length ?? 0,
      };
    });

    expect(state.generationForm).toMatchObject({
      prompt: 'glassy future garage with vocal chops',
      styleTags: ['Electronic'],
      bpm: 140,
      keyScale: 'G minor',
      lengthSeconds: 48,
      temperature: 0.45,
      variationCount: 4,
    });
    expect(state.lastSubmittedRequest).toMatchObject({
      prompt: 'glassy future garage with vocal chops',
      styleTags: ['Electronic'],
      bpm: 140,
      keyScale: 'G minor',
      duration: 48,
      temperature: 0.45,
      variationCount: 4,
    });
    expect(state.variationCount).toBe(4);
  });
});
