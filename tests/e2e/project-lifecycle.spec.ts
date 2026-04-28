/**
 * Covered story ids:
 * - PRJ-001, PRJ-002
 * - TRN-003
 *
 * Persona: QA agent and automation engineer
 * Workflow summary: validate browser-exposed store contracts and minimal
 * project lifecycle setup paths needed by higher-level story suites.
 * Why this test exists: protects the agent-operable contract that other E2E
 * tests depend on for deterministic setup.
 * Left to other layers: user-visible dialog affordances and manual feel checks.
 */
import { test, expect } from '@playwright/test';
import { dismissWelcomeOverlay } from '../support/e2eStartup';

test.describe('Project Lifecycle @critical', () => {
  test.beforeEach(async ({ page }) => {
    await dismissWelcomeOverlay(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => typeof (window as any).__store !== 'undefined', null, { timeout: 10000 });
  });

  test('app loads without errors', async ({ page }) => {
    // Verify the page loaded (check for main app container)
    await expect(page.locator('#root')).toBeVisible();
  });

  test('window.__store is exposed', async ({ page }) => {
    const storeExists = await page.evaluate(() => {
      return typeof (window as any).__store !== 'undefined';
    });
    expect(storeExists).toBe(true);
  });

  test('window.__store exposes arrangement zoom actions for agents', async ({ page }) => {
    const result = await page.evaluate(() => {
      const store = (window as any).__store;
      const uiStore = (window as any).__uiStore;

      store.getState().zoomTimelineToSelection();
      const selectionRequest = uiStore.getState().timelineZoomRequest;

      store.getState().zoomTimelineToProject();
      const projectRequest = uiStore.getState().timelineZoomRequest;

      return {
        zoomToSelection: typeof store.getState().zoomTimelineToSelection,
        zoomToProject: typeof store.getState().zoomTimelineToProject,
        selectionRequest,
        projectRequest,
      };
    });

    expect(result.zoomToSelection).toBe('function');
    expect(result.zoomToProject).toBe('function');
    expect(result.selectionRequest).toMatchObject({ mode: 'selection' });
    expect(result.projectRequest).toMatchObject({ mode: 'project' });
  });

  test('can create a new project via store API', async ({ page }) => {
    const projectName = await page.evaluate(() => {
      const store = (window as any).__store;
      store.getState().createProject({ name: 'Test Project', bpm: 140 });
      return store.getState().project?.name;
    });
    expect(projectName).toBe('Test Project');
  });

  test('can add tracks via store API', async ({ page }) => {
    const trackCount = await page.evaluate(() => {
      const store = (window as any).__store;
      store.getState().createProject({ name: 'Track Test' });
      store.getState().addTrack('drums');
      store.getState().addTrack('bass');
      store.getState().addTrack('keyboard', 'pianoRoll');
      return store.getState().project?.tracks.length;
    });
    expect(trackCount).toBe(3);
  });

  test('can add and remove a clip via store API', async ({ page }) => {
    const result = await page.evaluate(() => {
      const store = (window as any).__store;
      store.getState().createProject();
      const track = store.getState().addTrack('drums');
      const clip = store.getState().addClip(track.id, {
        startTime: 0,
        duration: 30,
        prompt: 'test drums',
        lyrics: '',
      });
      const countAfterAdd = store.getState().project.tracks[0].clips.length;
      store.getState().removeClip(clip.id);
      const countAfterRemove = store.getState().project.tracks[0].clips.length;
      return { countAfterAdd, countAfterRemove };
    });
    expect(result.countAfterAdd).toBe(1);
    expect(result.countAfterRemove).toBe(0);
  });

  test('can update BPM via store API', async ({ page }) => {
    const bpm = await page.evaluate(() => {
      const store = (window as any).__store;
      store.getState().createProject();
      store.getState().updateProject({ bpm: 160 });
      return store.getState().project.bpm;
    });
    expect(bpm).toBe(160);
  });
});
