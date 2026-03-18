import { test, expect } from '@playwright/test';

test.describe('Piano Roll Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => typeof (window as any).__store !== 'undefined', null, { timeout: 10000 });
    await page.evaluate(() => {
      const store = (window as any).__store;
      store.getState().createProject({ name: 'Piano Roll Test' });
    });
  });

  test('can add a keyboard track with pianoRoll type', async ({ page }) => {
    const result = await page.evaluate(() => {
      const store = (window as any).__store;
      const track = store.getState().addTrack('keyboard', 'pianoRoll');
      return { trackType: track.trackType, displayName: track.displayName };
    });
    expect(result.trackType).toBe('pianoRoll');
  });

  test('can create a MIDI clip via ensureMidiClip', async ({ page }) => {
    const result = await page.evaluate(() => {
      const store = (window as any).__store;
      const track = store.getState().addTrack('keyboard', 'pianoRoll');
      const clip = store.getState().ensureMidiClip(track.id);
      return {
        hasMidiData: !!clip.midiData,
        notesCount: clip.midiData?.notes?.length ?? -1,
      };
    });
    expect(result.hasMidiData).toBe(true);
    expect(result.notesCount).toBe(0);
  });

  test('can add MIDI notes via store API', async ({ page }) => {
    const noteCount = await page.evaluate(() => {
      const store = (window as any).__store;
      const track = store.getState().addTrack('keyboard', 'pianoRoll');
      const clip = store.getState().ensureMidiClip(track.id);
      store.getState().addMidiNote(clip.id, { pitch: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
      store.getState().addMidiNote(clip.id, { pitch: 64, startBeat: 1, durationBeats: 1, velocity: 80 });
      store.getState().addMidiNote(clip.id, { pitch: 67, startBeat: 2, durationBeats: 0.5, velocity: 90 });
      return store.getState().project?.tracks[0]?.clips[0]?.midiData?.notes?.length ?? 0;
    });
    expect(noteCount).toBe(3);
  });

  test('can quantize MIDI notes via store API', async ({ page }) => {
    const result = await page.evaluate(() => {
      const store = (window as any).__store;
      const track = store.getState().addTrack('keyboard', 'pianoRoll');
      const clip = store.getState().ensureMidiClip(track.id);
      const noteId = store.getState().addMidiNote(clip.id, { pitch: 60, startBeat: 0.3, durationBeats: 1, velocity: 100 });
      store.getState().quantizeMidiNotes(clip.id, [noteId], 1);
      const note = store.getState().project?.tracks[0]?.clips[0]?.midiData?.notes[0];
      return note?.startBeat;
    });
    expect(result).toBe(0); // 0.3 quantized to 0
  });

  test('can remove a MIDI note', async ({ page }) => {
    const noteCount = await page.evaluate(() => {
      const store = (window as any).__store;
      const track = store.getState().addTrack('keyboard', 'pianoRoll');
      const clip = store.getState().ensureMidiClip(track.id);
      const noteId = store.getState().addMidiNote(clip.id, { pitch: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
      store.getState().addMidiNote(clip.id, { pitch: 64, startBeat: 1, durationBeats: 1, velocity: 80 });
      store.getState().removeMidiNote(clip.id, noteId);
      return store.getState().project?.tracks[0]?.clips[0]?.midiData?.notes?.length ?? 0;
    });
    expect(noteCount).toBe(1);
  });
});
