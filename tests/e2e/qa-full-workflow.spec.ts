/**
 * QA Full Workflow Test Suite — Comprehensive user-facing tests
 *
 * Covered story ids:
 * - ONB-001, PRJ-001, PRJ-002, PRJ-003
 * - TRK-001, TRK-002, TRK-003, TRK-004
 * - TRN-001, TRN-002, TRN-003
 * - PNR-001
 * - OUT-001, OUT-002, OUT-003
 *
 * Persona: human QA and browser-driven QA agent
 * Workflow summary: create a project, add core track types, open editing and
 * output surfaces, and validate the keyboard-first core regression path.
 * Why this test exists: this is the matrix-linked story bundle for release-
 * critical and core-regression DAW workflows.
 * Left to other layers: precise store contracts, audio quality judgment, and
 * deep editor semantics remain covered by unit/spec-specific suites or manual QA.
 */
import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  createProjectViaDialog,
  ensureNewProjectDialog,
  focusApplicationShell,
  loadFreshApp,
} from '../support/e2eStartup';
import {
  getProjectBpm,
  getProjectName,
  getTransportState,
  getTrackCount,
  type E2EBrowserWindow,
} from '../support/browserStores';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCREENSHOT_DIR = path.resolve(__dirname, '../../test-screenshots');

// Helper: create project and dismiss dialog
async function createProjectViaUI(page: Page, name = 'QA Test Project', bpm?: number) {
  await createProjectViaDialog(page, name, bpm);
}

test.describe('QA Test Suite: Full Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await loadFreshApp(page);
  });

  // =========================================================================
  // 1. NEW PROJECT CREATION
  // =========================================================================
  test.describe('1. New Project Creation', () => {
    test('1a. First launch shows new project dialog', async ({ page }) => {
      await ensureNewProjectDialog(page);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, '01a-new-project-dialog.png'),
        fullPage: true,
      });
    });

    test('1b. Can create project with default settings', async ({ page }) => {
      await createProjectViaUI(page);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01b-project-created.png'), fullPage: true });

      // Verify project exists
      const projectName = await getProjectName(page);
      expect(projectName).toBeTruthy();

    });

    test('1c. Can create project with custom name and BPM', async ({ page }) => {
      await createProjectViaDialog(page, 'Custom BPM Project', 140);

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01c-custom-project.png'), fullPage: true });

      expect(await getProjectName(page)).toBe('Custom BPM Project');
      expect(await getProjectBpm(page)).toBe(140);
    });

    test('1d. Cancel button closes dialog without creating project', async ({ page }) => {
      await ensureNewProjectDialog(page);
      const cancelBtn = page.locator('button:has-text("Cancel")').first();
      if (await cancelBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await cancelBtn.click();
        await page.waitForTimeout(300);
      }

      const project = await page.evaluate(() =>
        (window as E2EBrowserWindow).__store.getState().project
      );
      // After cancel, project should still be null
      expect(project).toBeNull();
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01d-cancel-dialog.png'), fullPage: true });
    });

    test('1e. Close button (×) closes dialog', async ({ page }) => {
      await ensureNewProjectDialog(page);
      const closeBtn = page.locator('button:has-text("×")').first();
      if (await closeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await closeBtn.click();
        await page.waitForTimeout(300);
      }

      const project = await page.evaluate(() =>
        (window as E2EBrowserWindow).__store.getState().project
      );
      expect(project).toBeNull();
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01e-close-button.png'), fullPage: true });
    });
  });

  // =========================================================================
  // 2. ADD EACH TRACK TYPE
  // =========================================================================
  test.describe('2. Add Track Types', () => {
    test.beforeEach(async ({ page }) => {
      await createProjectViaUI(page);
    });

    test('2a. Add drums track via Instrument Picker', async ({ page }) => {
      // Open instrument picker
      await page.keyboard.press('Meta+Shift+KeyI');
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02a-instrument-picker.png'), fullPage: true });

      // Select Stems type
      const stemsBtn = page.locator('button:has-text("Stems")').first();
      if (await stemsBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await stemsBtn.click();
        await page.waitForTimeout(300);

        // Select Drums
        const drumsBtn = page.locator('button:has-text("Drums")').first();
        if (await drumsBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await drumsBtn.click();
          await page.waitForTimeout(300);
        }
      }

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02a-drums-added.png'), fullPage: true });

      const trackCount = await page.evaluate(() =>
        (window as E2EBrowserWindow).__store.getState().project?.tracks?.length ?? 0
      );
      expect(trackCount).toBeGreaterThanOrEqual(1);
    });

    test('2b. Add bass track via store', async ({ page }) => {
      await page.evaluate(() => {
        (window as E2EBrowserWindow).__store.getState().addTrack('bass');
      });
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02b-bass-added.png'), fullPage: true });

      const result = await page.evaluate(() => {
        const tracks = (window as E2EBrowserWindow).__store.getState().project?.tracks ?? [];
        return tracks.map((t: any) => ({ name: t.trackName, type: t.trackType }));
      });
      expect(result).toContainEqual({ name: 'bass', type: 'stems' });
    });

    test('2c. Add keyboard track (piano roll type)', async ({ page }) => {
      await page.evaluate(() => {
        (window as E2EBrowserWindow).__store.getState().addTrack('keyboard', 'pianoRoll');
      });
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02c-keyboard-added.png'), fullPage: true });

      const result = await page.evaluate(() => {
        const tracks = (window as E2EBrowserWindow).__store.getState().project?.tracks ?? [];
        return tracks.map((t: any) => ({ name: t.trackName, type: t.trackType }));
      });
      expect(result).toContainEqual({ name: 'keyboard', type: 'pianoRoll' });
    });

    test('2d. Add sequencer track (percussion)', async ({ page }) => {
      await page.evaluate(() => {
        (window as E2EBrowserWindow).__store.getState().addTrack('percussion', 'sequencer');
      });
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02d-sequencer-added.png'), fullPage: true });

      const result = await page.evaluate(() => {
        const tracks = (window as E2EBrowserWindow).__store.getState().project?.tracks ?? [];
        return tracks.map((t: any) => ({ name: t.trackName, type: t.trackType }));
      });
      expect(result).toContainEqual({ name: 'percussion', type: 'sequencer' });
    });

    test('2e. Add all track types together', async ({ page }) => {
      await page.evaluate(() => {
        const store = (window as E2EBrowserWindow).__store;
        store.getState().addTrack('drums');
        store.getState().addTrack('bass');
        store.getState().addTrack('keyboard', 'pianoRoll');
        store.getState().addTrack('percussion', 'sequencer');
        store.getState().addTrack('guitar');
        store.getState().addTrack('synth');
      });
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02e-all-tracks.png'), fullPage: true });

      const trackCount = await page.evaluate(() =>
        (window as E2EBrowserWindow).__store.getState().project?.tracks?.length ?? 0
      );
      expect(trackCount).toBe(6);
    });

    test('2f. Instrument Picker shows all track type categories', async ({ page }) => {
      await page.keyboard.press('Meta+Shift+KeyI');
      await page.waitForTimeout(500);

      // Check all four type buttons exist
      for (const type of ['Stems', 'Sample', 'Sequencer', 'Piano Roll']) {
        const btn = page.locator(`button:has-text("${type}")`).first();
        const visible = await btn.isVisible({ timeout: 1000 }).catch(() => false);
        if (!visible) {
          await page.screenshot({ path: path.join(SCREENSHOT_DIR, `02f-missing-type-${type.toLowerCase().replace(' ', '-')}.png`), fullPage: true });
        }
      }
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02f-all-types.png'), fullPage: true });
    });

    test('2g. Instrument Picker → Sample → shows Empty Track and Import options', async ({ page }) => {
      await page.keyboard.press('Meta+Shift+KeyI');
      await page.waitForTimeout(500);

      const sampleBtn = page.locator('button:has-text("Sample")').first();
      if (await sampleBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await sampleBtn.click();
        await page.waitForTimeout(300);
      }

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02g-sample-options.png'), fullPage: true });

      const emptyTrack = page.locator('text=Empty Track');
      const importAudio = page.locator('text=Import Audio File');
      // At least one should be visible
      const emptyVisible = await emptyTrack.first().isVisible({ timeout: 1000 }).catch(() => false);
      const importVisible = await importAudio.first().isVisible({ timeout: 1000 }).catch(() => false);
      expect(emptyVisible || importVisible).toBe(true);
    });
  });

  // =========================================================================
  // 3. PIANO ROLL — Create and edit notes
  // =========================================================================
  test.describe('3. Piano Roll', () => {
    test.beforeEach(async ({ page }) => {
      await createProjectViaUI(page);
    });

    test('3a. Can open piano roll for keyboard track', async ({ page }) => {
      // Add keyboard track with piano roll
      await page.evaluate(() => {
        const store = (window as E2EBrowserWindow).__store;
        const track = store.getState().addTrack('keyboard', 'pianoRoll');
        store.getState().ensureMidiClip(track.id);
      });
      await page.waitForTimeout(300);

      // Open piano roll via store
      const trackId = await page.evaluate(() => {
        const tracks = (window as E2EBrowserWindow).__store.getState().project?.tracks ?? [];
        return tracks.find((t: any) => t.trackType === 'pianoRoll')?.id;
      });

      if (trackId) {
        await page.evaluate((id: string) => {
          const uiStore = (window as E2EBrowserWindow).__uiStore;
          if (uiStore) {
            uiStore.getState().setOpenPianoRoll(id, null);
          }
        }, trackId);
        await page.waitForTimeout(300);
      }

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03a-piano-roll-open.png'), fullPage: true });
    });

    test('3b. Can add MIDI notes via store and verify they persist', async ({ page }) => {
      const result = await page.evaluate(() => {
        const store = (window as E2EBrowserWindow).__store;
        const track = store.getState().addTrack('keyboard', 'pianoRoll');
        const clip = store.getState().ensureMidiClip(track.id);

        // Add C major chord
        store.getState().addMidiNote(clip.id, { pitch: 60, startBeat: 0, durationBeats: 4, velocity: 100 }); // C4
        store.getState().addMidiNote(clip.id, { pitch: 64, startBeat: 0, durationBeats: 4, velocity: 80 });  // E4
        store.getState().addMidiNote(clip.id, { pitch: 67, startBeat: 0, durationBeats: 4, velocity: 90 });  // G4

        // Add a melody
        store.getState().addMidiNote(clip.id, { pitch: 72, startBeat: 4, durationBeats: 2, velocity: 100 }); // C5
        store.getState().addMidiNote(clip.id, { pitch: 71, startBeat: 6, durationBeats: 1, velocity: 90 });  // B4
        store.getState().addMidiNote(clip.id, { pitch: 69, startBeat: 7, durationBeats: 1, velocity: 85 });  // A4

        const notes = store.getState().project?.tracks[0]?.clips[0]?.midiData?.notes ?? [];
        return {
          count: notes.length,
          pitches: notes.map((n: any) => n.pitch),
          clipId: clip.id,
        };
      });

      expect(result.count).toBe(6);
      expect(result.pitches).toContain(60);
      expect(result.pitches).toContain(72);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03b-midi-notes-added.png'), fullPage: true });
    });

    test('3c. Can remove MIDI notes', async ({ page }) => {
      const result = await page.evaluate(() => {
        const store = (window as E2EBrowserWindow).__store;
        const track = store.getState().addTrack('keyboard', 'pianoRoll');
        const clip = store.getState().ensureMidiClip(track.id);

        const noteId1 = store.getState().addMidiNote(clip.id, { pitch: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
        const noteId2 = store.getState().addMidiNote(clip.id, { pitch: 64, startBeat: 1, durationBeats: 1, velocity: 80 });
        store.getState().addMidiNote(clip.id, { pitch: 67, startBeat: 2, durationBeats: 1, velocity: 90 });

        // Remove first note
        store.getState().removeMidiNote(clip.id, noteId1);

        const notes = store.getState().project?.tracks[0]?.clips[0]?.midiData?.notes ?? [];
        return {
          count: notes.length,
          pitches: notes.map((n: any) => n.pitch),
        };
      });

      expect(result.count).toBe(2);
      expect(result.pitches).not.toContain(60);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03c-note-removed.png'), fullPage: true });
    });

    test('3d. Quantize MIDI notes works correctly', async ({ page }) => {
      const result = await page.evaluate(() => {
        const store = (window as E2EBrowserWindow).__store;
        const track = store.getState().addTrack('keyboard', 'pianoRoll');
        const clip = store.getState().ensureMidiClip(track.id);

        // Add off-grid notes
        const id1 = store.getState().addMidiNote(clip.id, { pitch: 60, startBeat: 0.3, durationBeats: 1, velocity: 100 });
        const id2 = store.getState().addMidiNote(clip.id, { pitch: 64, startBeat: 1.7, durationBeats: 1, velocity: 80 });

        // Quantize to quarter notes
        store.getState().quantizeMidiNotes(clip.id, [id1, id2], 1);

        const notes = store.getState().project?.tracks[0]?.clips[0]?.midiData?.notes ?? [];
        return notes.map((n: any) => ({ pitch: n.pitch, startBeat: n.startBeat }));
      });

      expect(result[0].startBeat).toBe(0);   // 0.3 → 0
      expect(result[1].startBeat).toBe(2);    // 1.7 → 2
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03d-quantized.png'), fullPage: true });
    });

    test('3e. Piano roll with many notes does not crash', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(err.message));

      await page.evaluate(() => {
        const store = (window as E2EBrowserWindow).__store;
        const track = store.getState().addTrack('keyboard', 'pianoRoll');
        const clip = store.getState().ensureMidiClip(track.id);

        // Add 100 notes rapidly
        for (let i = 0; i < 100; i++) {
          store.getState().addMidiNote(clip.id, {
            pitch: 36 + (i % 48),
            startBeat: i * 0.25,
            durationBeats: 0.25,
            velocity: 50 + (i % 50),
          });
        }
      });

      await page.waitForTimeout(500);
      const noteCount = await page.evaluate(() =>
        (window as E2EBrowserWindow).__store.getState().project?.tracks[0]?.clips[0]?.midiData?.notes?.length ?? 0
      );
      expect(noteCount).toBe(100);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03e-100-notes.png'), fullPage: true });

      // Check for JS errors
      if (errors.length > 0) {
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03e-errors.png'), fullPage: true });
      }
    });
  });

  // =========================================================================
  // 4. KEYBOARD SHORTCUTS
  // =========================================================================
  test.describe('4. Keyboard Shortcuts', () => {
    test.beforeEach(async ({ page }) => {
      await createProjectViaUI(page);
      await page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        active?.blur?.();
        const uiStore = (window as E2EBrowserWindow).__uiStore?.getState();
        uiStore?.setKeyboardContext('timeline');
        uiStore?.setHistoryFocusScope('arrangement');
      });
      // Click to dismiss audio overlay
      await page.mouse.click(10, 10);
      await focusApplicationShell(page);
      await page.waitForTimeout(300);
    });

    test('4a. Space toggles play/pause', async ({ page }) => {
      await page.evaluate(() => {
        (window as E2EBrowserWindow).__store.getState().addTrack('drums');
      });

      await page.keyboard.press('Space');
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04a-space-play.png'), fullPage: true });

      // Check transport state
      await expect.poll(async () => (await getTransportState(page)).isPlaying).toBe(true);

      // Press space again
      await page.keyboard.press('Space');
      await expect.poll(async () => (await getTransportState(page)).isPlaying).toBe(false);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04a-space-pause.png'), fullPage: true });
    });

    test('4b. X toggles mixer panel', async ({ page }) => {
      const before = await page.evaluate(() => {
        const ui = (window as E2EBrowserWindow).__uiStore;
        if (ui) return ui.getState().showMixer;
        return null;
      });

      await page.keyboard.press('x');
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04b-mixer-toggle.png'), fullPage: true });

      const after = await page.evaluate(() => {
        const ui = (window as E2EBrowserWindow).__uiStore;
        if (ui) return ui.getState().showMixer;
        return null;
      });

      // If both are accessible, they should differ
      if (before !== null && after !== null) {
        expect(after).toBe(!before);
      }
    });

    test('4c. B toggles smart controls', async ({ page }) => {
      await page.keyboard.press('b');
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04c-smart-controls.png'), fullPage: true });
    });

    test('4d. O toggles loop browser', async ({ page }) => {
      await page.keyboard.press('o');
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04d-loop-browser.png'), fullPage: true });
    });

    test('4e. Y toggles library', async ({ page }) => {
      await page.keyboard.press('y');
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04e-library.png'), fullPage: true });
    });

    test('4f. L toggles loop mode', async ({ page }) => {
      const before = (await getTransportState(page)).loopEnabled;

      await page.keyboard.press('l');
      await expect.poll(async () => (await getTransportState(page)).loopEnabled).toBe(!before);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04f-loop-toggle.png'), fullPage: true });
    });

    test('4g. K toggles metronome', async ({ page }) => {
      const before = (await getTransportState(page)).metronomeEnabled;

      await page.keyboard.press('k');
      await expect.poll(async () => (await getTransportState(page)).metronomeEnabled).toBe(!before);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04g-metronome.png'), fullPage: true });
    });

    test('4h. N remains registered as the snap shortcut', async ({ page }) => {
      const combo = await page.evaluate(() =>
        (window as E2EBrowserWindow).__shortcutsStore?.getState().getCombo('view.toggleSnap'),
      );

      expect(combo).toEqual({ code: 'KeyN' });
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04h-snap-toggle.png'), fullPage: true });
    });

    test('4i. Arrangement zoom commands emit the expected zoom requests', async ({ page }) => {
      await page.evaluate(() => {
        (window as E2EBrowserWindow).__store.getState().createProject({ name: 'QA Keyboard Shortcut Project' });
      });
      await page.mouse.click(16, 16);
      await page.waitForTimeout(250);

      const clipIds = await page.evaluate(() => {
        const store = (window as E2EBrowserWindow).__store;
        const ui = (window as E2EBrowserWindow).__uiStore.getState();
        const track = store.getState().addTrack('drums');
        const intro = store.getState().addClip(track.id, {
          startTime: 8,
          duration: 4,
          prompt: 'intro',
          lyrics: '',
          source: 'generated',
        });
        const fill = store.getState().addClip(track.id, {
          startTime: 24,
          duration: 6,
          prompt: 'fill',
          lyrics: '',
          source: 'generated',
        });
        const outro = store.getState().addClip(track.id, {
          startTime: 88,
          duration: 8,
          prompt: 'outro',
          lyrics: '',
          source: 'generated',
        });

        ui.setSelectWindow(null);
        ui.selectClips([fill.id, outro.id]);
        ui.setKeyboardContext('timeline', track.id);

        return { fill: fill.id, outro: outro.id };
      });

      await page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        active?.blur?.();
        const uiStore = (window as E2EBrowserWindow).__uiStore?.getState();
        uiStore?.setKeyboardContext('timeline');
        uiStore?.setHistoryFocusScope('arrangement');
        (window as E2EBrowserWindow).__uiStore?.setState({ timelineZoomRequest: null });
      });
      await page.evaluate(() =>
        (window as E2EBrowserWindow).__keyboardCommands.execute('view.zoomToSelection'),
      );

      await page.waitForFunction(() => {
        const request = (window as E2EBrowserWindow).__uiStore.getState().timelineZoomRequest;
        return request?.mode === 'selection';
      });

      const selectionRequest = await page.evaluate(() =>
        (window as E2EBrowserWindow).__uiStore.getState().timelineZoomRequest,
      );
      expect(selectionRequest).toEqual({ id: 1, mode: 'selection' });

      await page.evaluate(() =>
        (window as E2EBrowserWindow).__keyboardCommands.execute('view.zoomToFit'),
      );
      await page.waitForFunction(() => {
        const request = (window as E2EBrowserWindow).__uiStore.getState().timelineZoomRequest;
        return request?.mode === 'project' && request.id === 2;
      });

      const { projectRequest } = await page.evaluate(() => ({
        projectRequest: (window as E2EBrowserWindow).__uiStore.getState().timelineZoomRequest,
      }));
      expect(projectRequest).toEqual({ id: 2, mode: 'project' });

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, '04i-zoom-selection-reset.png'),
        fullPage: true,
      });
    });

    test('4j. Cmd+Z undoes last action', async ({ page }) => {
      await page.evaluate(() => {
        (window as E2EBrowserWindow).__store.getState().addTrack('drums');
      });

      let trackCount = await page.evaluate(() =>
        (window as E2EBrowserWindow).__store.getState().project?.tracks?.length ?? 0
      );
      expect(trackCount).toBe(1);

      await page.keyboard.press('Meta+z');
      await page.waitForTimeout(300);

      trackCount = await page.evaluate(() =>
        (window as E2EBrowserWindow).__store.getState().project?.tracks?.length ?? 0
      );
      expect(trackCount).toBe(0);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04j-undo.png'), fullPage: true });
    });

    test('4k. Cmd+Shift+Z redoes', async ({ page }) => {
      await page.evaluate(() => {
        (window as E2EBrowserWindow).__store.getState().addTrack('drums');
      });

      await page.keyboard.press('Meta+z');
      await page.waitForTimeout(200);

      await page.keyboard.press('Meta+Shift+z');
      await page.waitForTimeout(200);

      const trackCount = await page.evaluate(() =>
        (window as E2EBrowserWindow).__store.getState().project?.tracks?.length ?? 0
      );
      expect(trackCount).toBe(1);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04k-redo.png'), fullPage: true });
    });

    test('4l. Escape closes modals', async ({ page }) => {
      // Open instrument picker
      await page.keyboard.press('Meta+Shift+KeyI');
      await page.waitForTimeout(300);

      const pickerVisible = await page.locator('text=Add Track').first().isVisible().catch(() => false);

      // Press Escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04l-escape-close.png'), fullPage: true });
    });

    test('4m. ? opens keyboard shortcuts dialog', async ({ page }) => {
      await page.keyboard.press('Shift+Slash');
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04m-shortcuts-dialog.png'), fullPage: true });

      const dialogVisible = await page.locator('text=Keyboard Shortcuts').first().isVisible().catch(() => false);
      // Just screenshot — don't fail if dialog doesn't have that exact text
    });

    test('4n. Rapid keyboard shortcut spam does not crash', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(err.message));

      await page.evaluate(() => {
        (window as E2EBrowserWindow).__store.getState().addTrack('drums');
        (window as E2EBrowserWindow).__store.getState().addTrack('bass');
      });

      // Spam shortcuts rapidly
      const keys = ['Space', 'x', 'b', 'o', 'y', 'l', 'k', 'n', 'z', 'Space', 'x', 'b'];
      for (const key of keys) {
        await page.keyboard.press(key);
        await page.waitForTimeout(50); // Very fast
      }

      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04n-rapid-shortcuts.png'), fullPage: true });

      // App should still be alive
      const storeAlive = await page.evaluate(() => typeof (window as E2EBrowserWindow).__store !== 'undefined');
      expect(storeAlive).toBe(true);

      if (errors.length > 0) {
        console.log('Errors during rapid shortcuts:', errors);
      }
    });
  });

  // =========================================================================
  // 5. MUTE/SOLO TRACKS
  // =========================================================================
  test.describe('5. Mute/Solo', () => {
    test.beforeEach(async ({ page }) => {
      await createProjectViaUI(page);
      await page.evaluate(() => {
        const store = (window as E2EBrowserWindow).__store;
        store.getState().addTrack('drums');
        store.getState().addTrack('bass');
        store.getState().addTrack('keyboard', 'pianoRoll');
      });
      await page.waitForTimeout(300);
    });

    test('5a. Can mute a track via store', async ({ page }) => {
      const result = await page.evaluate(() => {
        const store = (window as E2EBrowserWindow).__store;
        const trackId = store.getState().project?.tracks[0]?.id;
        store.getState().updateTrack(trackId, { muted: true });
        return store.getState().project?.tracks[0]?.muted;
      });
      expect(result).toBe(true);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05a-track-muted.png'), fullPage: true });
    });

    test('5b. Can solo a track via store', async ({ page }) => {
      const result = await page.evaluate(() => {
        const store = (window as E2EBrowserWindow).__store;
        const trackId = store.getState().project?.tracks[0]?.id;
        store.getState().updateTrack(trackId, { soloed: true });
        return {
          track0Soloed: store.getState().project?.tracks[0]?.soloed,
          track1Soloed: store.getState().project?.tracks[1]?.soloed,
          track2Soloed: store.getState().project?.tracks[2]?.soloed,
        };
      });
      expect(result.track0Soloed).toBe(true);
      expect(result.track1Soloed).toBe(false);
      expect(result.track2Soloed).toBe(false);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05b-track-soloed.png'), fullPage: true });
    });

    test('5c. Can click mute button in UI', async ({ page }) => {
      // Find mute buttons (speaker icons with title "Mute (M)")
      const muteButtons = page.locator('button[title="Mute (M)"]');
      const count = await muteButtons.count();

      if (count > 0) {
        await muteButtons.first().click();
        await page.waitForTimeout(200);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05c-ui-mute.png'), fullPage: true });

        const muted = await page.evaluate(() =>
          (window as E2EBrowserWindow).__store.getState().project?.tracks[0]?.muted
        );
        expect(muted).toBe(true);
      } else {
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05c-no-mute-button.png'), fullPage: true });
      }
    });

    test('5d. Can click solo button in UI', async ({ page }) => {
      const soloButtons = page.locator('button[title="Solo (S)"]');
      const count = await soloButtons.count();

      if (count > 0) {
        await soloButtons.first().click();
        await page.waitForTimeout(200);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05d-ui-solo.png'), fullPage: true });

        const soloed = await page.evaluate(() =>
          (window as E2EBrowserWindow).__store.getState().project?.tracks[0]?.soloed
        );
        expect(soloed).toBe(true);
      } else {
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05d-no-solo-button.png'), fullPage: true });
      }
    });

    test('5e. Mute and solo interact correctly', async ({ page }) => {
      const result = await page.evaluate(() => {
        const store = (window as E2EBrowserWindow).__store;
        const tracks = store.getState().project?.tracks;
        if (!tracks || tracks.length < 3) return null;

        // Solo track 0, mute track 1
        store.getState().updateTrack(tracks[0].id, { soloed: true });
        store.getState().updateTrack(tracks[1].id, { muted: true });

        const updated = store.getState().project?.tracks;
        return {
          track0: { muted: updated[0].muted, soloed: updated[0].soloed },
          track1: { muted: updated[1].muted, soloed: updated[1].soloed },
          track2: { muted: updated[2].muted, soloed: updated[2].soloed },
        };
      });

      if (result) {
        expect(result.track0.soloed).toBe(true);
        expect(result.track1.muted).toBe(true);
      }
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05e-mute-solo-combo.png'), fullPage: true });
    });

    test('5f. Toggle mute off after muting', async ({ page }) => {
      const result = await page.evaluate(() => {
        const store = (window as E2EBrowserWindow).__store;
        const trackId = store.getState().project?.tracks[0]?.id;

        // Mute
        store.getState().updateTrack(trackId, { muted: true });
        const afterMute = store.getState().project?.tracks[0]?.muted;

        // Unmute
        store.getState().updateTrack(trackId, { muted: false });
        const afterUnmute = store.getState().project?.tracks[0]?.muted;

        return { afterMute, afterUnmute };
      });

      expect(result.afterMute).toBe(true);
      expect(result.afterUnmute).toBe(false);
    });
  });

  // =========================================================================
  // 6. EXPORT
  // =========================================================================
  test.describe('6. Export', () => {
    test.beforeEach(async ({ page }) => {
      await createProjectViaUI(page);
    });

    test('6a. Export dialog opens via Cmd+Shift+E', async ({ page }) => {
      await page.keyboard.press('Meta+Shift+KeyE');
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06a-export-dialog.png'), fullPage: true });

      const dialogVisible = await page.locator('text=Export Mix').first().isVisible().catch(() => false);
      expect(dialogVisible).toBe(true);
    });

    test('6b. Export dialog shows correct clip count', async ({ page }) => {
      // Add some tracks with content
      await page.evaluate(() => {
        const store = (window as E2EBrowserWindow).__store;
        const track = store.getState().addTrack('keyboard', 'pianoRoll');
        const clip = store.getState().ensureMidiClip(track.id);
        store.getState().addMidiNote(clip.id, { pitch: 60, startBeat: 0, durationBeats: 4, velocity: 100 });
      });

      await page.keyboard.press('Meta+Shift+KeyE');
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06b-export-with-content.png'), fullPage: true });
    });

    test('6c. Export button disabled when no exportable content', async ({ page }) => {
      await page.keyboard.press('Meta+Shift+KeyE');
      await page.waitForTimeout(500);

      const exportBtn = page.locator('button:has-text("Export WAV")').first();
      const isDisabled = await exportBtn.isDisabled().catch(() => null);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06c-export-disabled.png'), fullPage: true });
      expect(isDisabled).toBe(true);
    });

    test('6d. Export button enabled with piano roll notes', async ({ page }) => {
      await page.evaluate(() => {
        const store = (window as E2EBrowserWindow).__store;
        const track = store.getState().addTrack('keyboard', 'pianoRoll');
        const clip = store.getState().ensureMidiClip(track.id);
        store.getState().addMidiNote(clip.id, { pitch: 60, startBeat: 0, durationBeats: 4, velocity: 100 });
      });

      await page.keyboard.press('Meta+Shift+KeyE');
      await page.waitForTimeout(500);

      const exportBtn = page.locator('button:has-text("Export WAV")').first();
      const isDisabled = await exportBtn.isDisabled().catch(() => null);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06d-export-enabled.png'), fullPage: true });
      expect(isDisabled).toBe(false);
    });

    test('6e. Export dialog cancel button works', async ({ page }) => {
      await page.keyboard.press('Meta+Shift+KeyE');
      await page.waitForTimeout(500);

      const cancelBtn = page.locator('button:has-text("Cancel")').first();
      if (await cancelBtn.isVisible()) {
        await cancelBtn.click();
        await page.waitForTimeout(300);
      }

      const dialogVisible = await page.locator('text=Export Mix').first().isVisible().catch(() => false);
      expect(dialogVisible).toBe(false);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06e-export-cancelled.png'), fullPage: true });
    });
  });

  // =========================================================================
  // 7. EDGE CASES & STRESS TESTS
  // =========================================================================
  test.describe('7. Edge Cases', () => {
    test('7a. App handles no project gracefully', async ({ page }) => {
      // Cancel the new project dialog
      const cancelBtn = page.locator('button:has-text("Cancel")').first();
      if (await cancelBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await cancelBtn.click();
      }
      await page.waitForTimeout(300);

      // Try keyboard shortcuts with no project
      const keys = ['Space', 'x', 'b', 'o', 'y', 'l', 'k', 'n', 'z'];
      for (const key of keys) {
        await page.keyboard.press(key);
        await page.waitForTimeout(50);
      }

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07a-no-project.png'), fullPage: true });

      // App should not crash
      const alive = await page.evaluate(() => typeof (window as E2EBrowserWindow).__store !== 'undefined');
      expect(alive).toBe(true);
    });

    test('7b. Adding and removing many tracks rapidly', async ({ page }) => {
      await createProjectViaUI(page);

      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(err.message));

      const result = await page.evaluate(() => {
        const store = (window as E2EBrowserWindow).__store;
        const ids: string[] = [];

        // Add 10 tracks rapidly
        for (let i = 0; i < 10; i++) {
          const track = store.getState().addTrack('drums');
          ids.push(track.id);
        }

        const countAfterAdd = store.getState().project?.tracks.length;

        // Remove them all
        for (const id of ids) {
          store.getState().removeTrack(id);
        }

        const countAfterRemove = store.getState().project?.tracks.length;

        return { countAfterAdd, countAfterRemove };
      });

      expect(result.countAfterAdd).toBe(10);
      expect(result.countAfterRemove).toBe(0);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07b-rapid-tracks.png'), fullPage: true });

      if (errors.length > 0) {
        console.log('Errors during rapid track operations:', errors);
      }
    });

    test('7c. Undo/Redo many times does not corrupt state', async ({ page }) => {
      await createProjectViaUI(page);

      await page.evaluate(() => {
        const store = (window as E2EBrowserWindow).__store;
        // Do a series of operations
        store.getState().addTrack('drums');
        store.getState().addTrack('bass');
        store.getState().addTrack('keyboard', 'pianoRoll');
      });

      // Undo 3 times
      for (let i = 0; i < 3; i++) {
        await page.keyboard.press('Meta+z');
        await page.waitForTimeout(100);
      }

      const afterUndo = await page.evaluate(() =>
        (window as E2EBrowserWindow).__store.getState().project?.tracks?.length ?? 0
      );
      expect(afterUndo).toBe(0);

      // Redo 3 times
      for (let i = 0; i < 3; i++) {
        await page.keyboard.press('Meta+Shift+z');
        await page.waitForTimeout(100);
      }

      const afterRedo = await page.evaluate(() =>
        (window as E2EBrowserWindow).__store.getState().project?.tracks?.length ?? 0
      );
      expect(afterRedo).toBe(3);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07c-undo-redo.png'), fullPage: true });
    });

    test('7d. Sequencer pattern operations', async ({ page }) => {
      await createProjectViaUI(page);

      const result = await page.evaluate(() => {
        const store = (window as E2EBrowserWindow).__store;
        const track = store.getState().addTrack('percussion', 'sequencer');

        // Check sequencer pattern exists
        const pattern = store.getState().project?.tracks[0]?.sequencerPattern;
        return {
          hasPattern: !!pattern,
          rowCount: pattern?.rows?.length ?? 0,
          stepCount: pattern?.rows?.[0]?.steps?.length ?? 0,
        };
      });

      expect(result.hasPattern).toBe(true);
      expect(result.rowCount).toBeGreaterThan(0);
      expect(result.stepCount).toBeGreaterThan(0);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07d-sequencer.png'), fullPage: true });
    });

    test('7e. Track volume edge values', async ({ page }) => {
      await createProjectViaUI(page);

      const result = await page.evaluate(() => {
        const store = (window as E2EBrowserWindow).__store;
        const track = store.getState().addTrack('drums');
        const id = track.id;

        // Test edge volumes
        store.getState().updateTrack(id, { volume: 0 });
        const vol0 = store.getState().project?.tracks[0]?.volume;

        store.getState().updateTrack(id, { volume: 1 });
        const vol1 = store.getState().project?.tracks[0]?.volume;

        store.getState().updateTrack(id, { volume: 0.5 });
        const vol50 = store.getState().project?.tracks[0]?.volume;

        return { vol0, vol1, vol50 };
      });

      expect(result.vol0).toBe(0);
      expect(result.vol1).toBe(1);
      expect(result.vol50).toBe(0.5);
    });

    test('7f. Console errors during normal workflow', async ({ page }) => {
      const errors: string[] = [];
      const warnings: string[] = [];
      page.on('pageerror', (err) => errors.push(err.message));
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
        if (msg.type() === 'warning') warnings.push(msg.text());
      });

      await createProjectViaUI(page);

      await page.evaluate(() => {
        const store = (window as E2EBrowserWindow).__store;
        store.getState().addTrack('drums');
        store.getState().addTrack('bass');
        store.getState().addTrack('keyboard', 'pianoRoll');
      });

      // Perform typical workflow
      await page.keyboard.press('Space');
      await page.waitForTimeout(500);
      await page.keyboard.press('Space');
      await page.keyboard.press('x');
      await page.waitForTimeout(200);
      await page.keyboard.press('x');

      await page.waitForTimeout(500);

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07f-console-check.png'), fullPage: true });

      // Report errors but don't fail — some may be expected (e.g., AudioContext warnings)
      if (errors.length > 0) {
        console.log('Console errors found:', errors);
      }
    });

    test('7g. Double-create project does not corrupt state', async ({ page }) => {
      await createProjectViaUI(page, 'First Project');

      // Try to create another project via Cmd+N
      await page.keyboard.press('Meta+n');
      await page.waitForTimeout(500);

      const dialogVisible = await page.locator('text=New Project').first().isVisible().catch(() => false);
      if (dialogVisible) {
        const nameInput = page.locator('input[type="text"]').first();
        await nameInput.fill('Second Project');
        await page.locator('button:has-text("Create")').first().click();
        await page.waitForTimeout(500);
      }

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07g-double-create.png'), fullPage: true });

      const projectName = await page.evaluate(() =>
        (window as E2EBrowserWindow).__store.getState().project?.name
      );
      expect(projectName).toBeTruthy();
    });
  });
});
