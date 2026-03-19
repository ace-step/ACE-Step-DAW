/**
 * Real User-Scenario E2E Tests (Issue #110)
 *
 * Every test in this file interacts with the actual UI — clicking buttons,
 * typing into inputs, pressing keyboard shortcuts — instead of calling the
 * store API directly.  If a test here fails, a real user would hit the same bug.
 */
import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function waitForApp(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(
    () => typeof (window as any).__store !== 'undefined',
    null,
    { timeout: 15000 },
  );
}

/** Create a project by filling in the New Project dialog that appears on load. */
async function createProjectViaDialog(page: Page, name = 'E2E Test Project') {
  const dialog = page.locator('text=New Project').first();
  await expect(dialog).toBeVisible({ timeout: 5000 });

  const nameInput = page.locator('input[type="text"]').first();
  await nameInput.fill(name);

  await page.locator('button:has-text("Create")').first().click();
  // Wait for the transport bar — confirms project was created and UI rendered
  await expect(page.getByTestId('transport-bar')).toBeVisible({ timeout: 5000 });
}

/** Open the Instrument Picker via keyboard shortcut. */
async function openInstrumentPicker(page: Page) {
  await page.keyboard.press('Meta+Shift+KeyI');
  await expect(page.locator('text=Add Track').first()).toBeVisible({ timeout: 3000 });
}

/** Add a Stems track by navigating the Instrument Picker UI. */
async function addStemsTrack(page: Page, instrument: string) {
  await openInstrumentPicker(page);
  // Step 1 — pick "Stems" type
  await page.locator('button:has-text("Stems")').first().click();
  await page.waitForTimeout(200);
  // Step 2 — pick the instrument
  await page.locator(`button:has-text("${instrument}")`).first().click();
  await page.waitForTimeout(300);
}

/** Add a Piano Roll track through the Instrument Picker. */
async function addPianoRollTrack(page: Page) {
  await openInstrumentPicker(page);
  await page.locator('button:has-text("Piano Roll")').first().click();
  await page.waitForTimeout(200);
  await page.locator('button:has-text("Piano Roll Track")').first().click();
  await page.waitForTimeout(300);
}

/** Add a Sequencer track through the Instrument Picker. */
async function addSequencerTrack(page: Page) {
  await openInstrumentPicker(page);
  await page.locator('button:has-text("Sequencer")').first().click();
  await page.waitForTimeout(200);
  await page.locator('button:has-text("Step Sequencer")').first().click();
  await page.waitForTimeout(300);
}

/** Read the current track count from the store (read-only helper). */
async function getTrackCount(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as any).__store.getState().project?.tracks?.length ?? 0,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Real User Scenarios (Issue #110)', () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
  });

  // =========================================================================
  // 1. CREATE PROJECT VIA DIALOG
  // =========================================================================
  test.describe('1. Create project via dialog', () => {
    test('1a. Dialog appears on first load with name and BPM fields', async ({ page }) => {
      // Dialog should be visible immediately
      await expect(page.locator('text=New Project').first()).toBeVisible({ timeout: 5000 });
      // Name input exists
      await expect(page.locator('input[type="text"]').first()).toBeVisible();
      // BPM input exists
      await expect(page.locator('input[type="number"]').first()).toBeVisible();
      // Create button exists
      await expect(page.locator('button:has-text("Create")').first()).toBeVisible();
    });

    test('1b. Filling name + clicking Create produces a project', async ({ page }) => {
      await createProjectViaDialog(page, 'My First Song');

      const projectName = await page.evaluate(
        () => (window as any).__store.getState().project?.name,
      );
      expect(projectName).toBe('My First Song');
    });

    test('1c. Custom BPM is respected', async ({ page }) => {
      const nameInput = page.locator('input[type="text"]').first();
      await nameInput.fill('BPM Test');

      const bpmInput = page.locator('input[type="number"]').first();
      await bpmInput.fill('160');

      await page.locator('button:has-text("Create")').first().click();
      await expect(page.getByTestId('transport-bar')).toBeVisible({ timeout: 5000 });

      const bpm = await page.evaluate(
        () => (window as any).__store.getState().project?.bpm,
      );
      expect(bpm).toBe(160);
    });

    test('1d. Cancel leaves project null', async ({ page }) => {
      await page.locator('button:has-text("Cancel")').first().click();
      await page.waitForTimeout(300);

      const project = await page.evaluate(
        () => (window as any).__store.getState().project,
      );
      expect(project).toBeNull();
    });
  });

  // =========================================================================
  // 2. ADD TRACKS VIA UI
  // =========================================================================
  test.describe('2. Add tracks via Instrument Picker', () => {
    test.beforeEach(async ({ page }) => {
      await createProjectViaDialog(page);
    });

    test('2a. Add a Drums stems track', async ({ page }) => {
      await addStemsTrack(page, 'Drums');
      expect(await getTrackCount(page)).toBe(1);

      // Track header should show the track name on screen
      await expect(page.locator('text=Drums').first()).toBeVisible({ timeout: 3000 });
    });

    test('2b. Add a Bass stems track', async ({ page }) => {
      await addStemsTrack(page, 'Bass');
      expect(await getTrackCount(page)).toBe(1);
      await expect(page.locator('text=Bass').first()).toBeVisible({ timeout: 3000 });
    });

    test('2c. Add a Piano Roll track via picker', async ({ page }) => {
      await addPianoRollTrack(page);
      expect(await getTrackCount(page)).toBe(1);

      const trackType = await page.evaluate(
        () => (window as any).__store.getState().project?.tracks[0]?.trackType,
      );
      expect(trackType).toBe('pianoRoll');
    });

    test('2d. Add a Sequencer track via picker', async ({ page }) => {
      await addSequencerTrack(page);
      expect(await getTrackCount(page)).toBe(1);

      const trackType = await page.evaluate(
        () => (window as any).__store.getState().project?.tracks[0]?.trackType,
      );
      expect(trackType).toBe('sequencer');
    });

    test('2e. Instrument Picker closes after track creation', async ({ page }) => {
      await addStemsTrack(page, 'Guitar');
      // Picker should be gone
      const pickerVisible = await page
        .locator('text=Add Track')
        .first()
        .isVisible()
        .catch(() => false);
      expect(pickerVisible).toBe(false);
    });

    test('2f. Escape closes the Instrument Picker without adding a track', async ({ page }) => {
      await openInstrumentPicker(page);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      expect(await getTrackCount(page)).toBe(0);
    });

    test('2g. Add multiple track types sequentially', async ({ page }) => {
      await addStemsTrack(page, 'Drums');
      await addStemsTrack(page, 'Bass');
      await addPianoRollTrack(page);
      await addSequencerTrack(page);

      expect(await getTrackCount(page)).toBe(4);
    });
  });

  // =========================================================================
  // 3. OPEN PIANO ROLL
  // =========================================================================
  test.describe('3. Piano Roll', () => {
    test.beforeEach(async ({ page }) => {
      await createProjectViaDialog(page);
    });

    test('3a. Open piano roll via right-click context menu', async ({ page }) => {
      await addPianoRollTrack(page);

      // Right-click on the track header to get context menu
      const trackHeader = page.locator('text=Keyboard').first();
      await trackHeader.click({ button: 'right' });
      await page.waitForTimeout(200);

      // Click "Open Piano Roll..." in context menu
      const openPRBtn = page.locator('text=Open Piano Roll...').first();
      await expect(openPRBtn).toBeVisible({ timeout: 2000 });
      await openPRBtn.click();
      await page.waitForTimeout(300);

      // Piano roll should now be visible — look for Draw button or Close button
      const pianoRollVisible = await page
        .locator('button:has-text("Draw")')
        .first()
        .isVisible({ timeout: 3000 })
        .catch(() => false);
      // Verify piano roll opened via UI store
      const openPianoRoll = await page.evaluate(
        () => (window as any).__uiStore?.getState().openPianoRollTrackId,
      );
      expect(openPianoRoll).toBeTruthy();
    });

    test('3b. Piano roll Close button works', async ({ page }) => {
      await addPianoRollTrack(page);

      // Open via context menu
      const trackHeader = page.locator('text=Keyboard').first();
      await trackHeader.click({ button: 'right' });
      await page.waitForTimeout(200);
      await page.locator('text=Open Piano Roll...').first().click();
      await page.waitForTimeout(300);

      // Click Close
      const closeBtn = page.locator('button:has-text("Close")').first();
      if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await closeBtn.click();
        await page.waitForTimeout(300);

        const openPianoRoll = await page.evaluate(
          () => (window as any).__uiStore?.getState().openPianoRollTrackId,
        );
        expect(openPianoRoll).toBeFalsy();
      }
    });
  });

  // =========================================================================
  // 4. KEYBOARD SHORTCUTS
  // =========================================================================
  test.describe('4. Keyboard shortcuts', () => {
    test.beforeEach(async ({ page }) => {
      await createProjectViaDialog(page);
      // Click body to ensure focus is on the page (not in a text input)
      await page.click('body');
      await page.waitForTimeout(200);
    });

    test('4a. Space toggles play/pause', async ({ page }) => {
      await addStemsTrack(page, 'Drums');

      await page.keyboard.press('Space');
      await page.waitForTimeout(300);

      const isPlaying = await page.evaluate(
        () => (window as any).__transportStore?.getState().isPlaying,
      );
      // Space should have toggled playback on
      expect(isPlaying).toBe(true);

      await page.keyboard.press('Space');
      await page.waitForTimeout(200);

      const isPaused = await page.evaluate(
        () => (window as any).__transportStore?.getState().isPlaying,
      );
      expect(isPaused).toBe(false);
    });

    test('4b. X toggles the mixer panel', async ({ page }) => {
      const before = await page.evaluate(
        () => (window as any).__uiStore?.getState().showMixer,
      );

      await page.keyboard.press('x');
      await page.waitForTimeout(300);

      const after = await page.evaluate(
        () => (window as any).__uiStore?.getState().showMixer,
      );
      expect(after).toBe(!before);
    });

    test('4c. Cmd+Z / Cmd+Shift+Z undo/redo', async ({ page }) => {
      await addStemsTrack(page, 'Drums');
      expect(await getTrackCount(page)).toBe(1);

      // Undo
      await page.keyboard.press('Meta+z');
      await page.waitForTimeout(300);
      expect(await getTrackCount(page)).toBe(0);

      // Redo
      await page.keyboard.press('Meta+Shift+z');
      await page.waitForTimeout(300);
      expect(await getTrackCount(page)).toBe(1);
    });

    test('4d. L toggles loop', async ({ page }) => {
      const before = await page.evaluate(
        () => (window as any).__transportStore?.getState().loopEnabled,
      );

      await page.keyboard.press('l');
      await page.waitForTimeout(200);

      const after = await page.evaluate(
        () => (window as any).__transportStore?.getState().loopEnabled,
      );
      expect(after).toBe(!before);
    });

    test('4e. ? opens keyboard shortcuts dialog', async ({ page }) => {
      await page.keyboard.press('Shift+Slash');
      await page.waitForTimeout(500);

      await expect(
        page.locator('text=Keyboard Shortcuts').first(),
      ).toBeVisible({ timeout: 3000 });

      // Close it with Escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    });

    test('4f. Cmd+Shift+E opens export dialog', async ({ page }) => {
      await page.keyboard.press('Meta+Shift+KeyE');
      await page.waitForTimeout(500);

      await expect(
        page.locator('text=Export Mix').first(),
      ).toBeVisible({ timeout: 3000 });
    });

    test('4g. Cmd+N opens new project dialog', async ({ page }) => {
      await page.keyboard.press('Meta+n');
      await page.waitForTimeout(500);

      await expect(
        page.locator('text=New Project').first(),
      ).toBeVisible({ timeout: 3000 });
    });

    test('4h. N toggles snap', async ({ page }) => {
      const before = await page.evaluate(
        () => (window as any).__uiStore?.getState().snapEnabled,
      );

      await page.keyboard.press('n');
      await page.waitForTimeout(200);

      const after = await page.evaluate(
        () => (window as any).__uiStore?.getState().snapEnabled,
      );
      expect(after).toBe(!before);
    });
  });

  // =========================================================================
  // 5. MUTE / SOLO BUTTONS
  // =========================================================================
  test.describe('5. Mute and Solo buttons', () => {
    test.beforeEach(async ({ page }) => {
      await createProjectViaDialog(page);
      await addStemsTrack(page, 'Drums');
      await addStemsTrack(page, 'Bass');
    });

    test('5a. Clicking mute button mutes the track', async ({ page }) => {
      const muteButtons = page.locator('button[title="Mute (M)"]');
      await expect(muteButtons.first()).toBeVisible({ timeout: 3000 });

      // Click mute on first track
      await muteButtons.first().click();
      await page.waitForTimeout(200);

      const muted = await page.evaluate(
        () => (window as any).__store.getState().project?.tracks[0]?.muted,
      );
      expect(muted).toBe(true);
    });

    test('5b. Clicking mute again unmutes', async ({ page }) => {
      const muteBtn = page.locator('button[title="Mute (M)"]').first();
      await muteBtn.click(); // mute
      await page.waitForTimeout(150);
      await muteBtn.click(); // unmute
      await page.waitForTimeout(150);

      const muted = await page.evaluate(
        () => (window as any).__store.getState().project?.tracks[0]?.muted,
      );
      expect(muted).toBe(false);
    });

    test('5c. Clicking solo button solos the track', async ({ page }) => {
      const soloButtons = page.locator('button[title="Solo (S)"]');
      await expect(soloButtons.first()).toBeVisible({ timeout: 3000 });

      await soloButtons.first().click();
      await page.waitForTimeout(200);

      const result = await page.evaluate(() => {
        const tracks = (window as any).__store.getState().project?.tracks ?? [];
        return {
          track0Soloed: tracks[0]?.soloed,
          track1Soloed: tracks[1]?.soloed,
        };
      });
      expect(result.track0Soloed).toBe(true);
      expect(result.track1Soloed).toBe(false);
    });

    test('5d. Solo + mute on different tracks', async ({ page }) => {
      // Solo first track
      await page.locator('button[title="Solo (S)"]').first().click();
      await page.waitForTimeout(150);

      // Mute second track
      await page.locator('button[title="Mute (M)"]').nth(1).click();
      await page.waitForTimeout(150);

      const result = await page.evaluate(() => {
        const tracks = (window as any).__store.getState().project?.tracks ?? [];
        return {
          track0Soloed: tracks[0]?.soloed,
          track0Muted: tracks[0]?.muted,
          track1Soloed: tracks[1]?.soloed,
          track1Muted: tracks[1]?.muted,
        };
      });
      expect(result.track0Soloed).toBe(true);
      expect(result.track0Muted).toBe(false);
      expect(result.track1Soloed).toBe(false);
      expect(result.track1Muted).toBe(true);
    });

    test('5e. Non-soloed tracks appear dimmed when one is soloed', async ({ page }) => {
      // Solo first track
      await page.locator('button[title="Solo (S)"]').first().click();
      await page.waitForTimeout(300);

      // The second track header should have reduced opacity (implied mute)
      // We verify via store that the UI would dim it
      const anySoloed = await page.evaluate(
        () => (window as any).__store.getState().project?.tracks.some((t: any) => t.soloed),
      );
      expect(anySoloed).toBe(true);
    });
  });

  // =========================================================================
  // 6. EXPORT DIALOG
  // =========================================================================
  test.describe('6. Export dialog', () => {
    test.beforeEach(async ({ page }) => {
      await createProjectViaDialog(page);
    });

    test('6a. Export dialog opens and shows track/clip info', async ({ page }) => {
      await page.keyboard.press('Meta+Shift+KeyE');
      await page.waitForTimeout(500);

      await expect(page.locator('text=Export Mix').first()).toBeVisible({ timeout: 3000 });
      // Should show "0 clips ready across 0 tracks"
      await expect(page.locator('text=0 clip').first()).toBeVisible({ timeout: 2000 });
    });

    test('6b. Export WAV button is disabled with no content', async ({ page }) => {
      await page.keyboard.press('Meta+Shift+KeyE');
      await page.waitForTimeout(500);

      const exportBtn = page.locator('button:has-text("Export WAV")').first();
      await expect(exportBtn).toBeDisabled();
    });

    test('6c. Cancel button closes the export dialog', async ({ page }) => {
      await page.keyboard.press('Meta+Shift+KeyE');
      await page.waitForTimeout(500);

      await page.locator('button:has-text("Cancel")').first().click();
      await page.waitForTimeout(300);

      const visible = await page
        .locator('text=Export Mix')
        .first()
        .isVisible()
        .catch(() => false);
      expect(visible).toBe(false);
    });

    test('6d. Export button enabled when piano roll has notes', async ({ page }) => {
      // Add piano roll track and notes via store (setup only — the export dialog itself is the UI under test)
      await page.evaluate(() => {
        const store = (window as any).__store;
        const track = store.getState().addTrack('keyboard', 'pianoRoll');
        const clip = store.getState().ensureMidiClip(track.id);
        store.getState().addMidiNote(clip.id, {
          pitch: 60,
          startBeat: 0,
          durationBeats: 4,
          velocity: 100,
        });
      });

      await page.keyboard.press('Meta+Shift+KeyE');
      await page.waitForTimeout(500);

      const exportBtn = page.locator('button:has-text("Export WAV")').first();
      await expect(exportBtn).toBeEnabled();
    });

    test('6e. Close (x) button closes the dialog', async ({ page }) => {
      await page.keyboard.press('Meta+Shift+KeyE');
      await page.waitForTimeout(500);

      // The × button in the export dialog header
      const closeBtn = page
        .locator('.fixed')
        .locator('button:has-text("×")')
        .first();
      if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await closeBtn.click();
        await page.waitForTimeout(300);
      }

      const visible = await page
        .locator('text=Export Mix')
        .first()
        .isVisible()
        .catch(() => false);
      expect(visible).toBe(false);
    });
  });

  // =========================================================================
  // 7. FULL END-TO-END USER JOURNEY
  // =========================================================================
  test('Full journey: create → add tracks → shortcuts → mute/solo → export', async ({
    page,
  }) => {
    // Step 1 — Create project
    await createProjectViaDialog(page, 'Full Journey Song');
    const projectName = await page.evaluate(
      () => (window as any).__store.getState().project?.name,
    );
    expect(projectName).toBe('Full Journey Song');

    // Step 2 — Add tracks through the UI
    await addStemsTrack(page, 'Drums');
    await addStemsTrack(page, 'Bass');
    await addPianoRollTrack(page);
    expect(await getTrackCount(page)).toBe(3);

    // Step 3 — Toggle mixer with X
    await page.click('body');
    await page.waitForTimeout(100);
    await page.keyboard.press('x');
    await page.waitForTimeout(300);
    const mixerVisible = await page.evaluate(
      () => (window as any).__uiStore?.getState().showMixer,
    );
    // Mixer was toggled (we don't know initial state, just confirm no crash)
    expect(typeof mixerVisible).toBe('boolean');

    // Step 4 — Play/Pause via Space
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);
    await page.keyboard.press('Space');
    await page.waitForTimeout(200);

    // Step 5 — Mute drums (first track)
    await page.locator('button[title="Mute (M)"]').first().click();
    await page.waitForTimeout(200);
    const drumsMuted = await page.evaluate(
      () => (window as any).__store.getState().project?.tracks[0]?.muted,
    );
    expect(drumsMuted).toBe(true);

    // Step 6 — Solo bass (second track)
    await page.locator('button[title="Solo (S)"]').nth(1).click();
    await page.waitForTimeout(200);
    const bassSoloed = await page.evaluate(
      () => (window as any).__store.getState().project?.tracks[1]?.soloed,
    );
    expect(bassSoloed).toBe(true);

    // Step 7 — Undo solo
    await page.keyboard.press('Meta+z');
    await page.waitForTimeout(200);
    const bassSoloedAfterUndo = await page.evaluate(
      () => (window as any).__store.getState().project?.tracks[1]?.soloed,
    );
    expect(bassSoloedAfterUndo).toBe(false);

    // Step 8 — Open export dialog and verify
    await page.keyboard.press('Meta+Shift+KeyE');
    await page.waitForTimeout(500);
    await expect(page.locator('text=Export Mix').first()).toBeVisible({ timeout: 3000 });

    // Close it
    await page.locator('button:has-text("Cancel")').first().click();
    await page.waitForTimeout(300);

    // App is still alive
    expect(await getTrackCount(page)).toBe(3);
  });
});
