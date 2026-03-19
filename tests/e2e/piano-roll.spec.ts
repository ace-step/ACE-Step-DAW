import { test, expect } from '@playwright/test';

type PianoRollTestStore = {
  getState(): {
    createProject: (input: { name: string }) => void;
    addTrack: (name: string, type: 'pianoRoll') => { id: string; trackType: string; displayName: string };
    ensureMidiClip: (trackId: string) => { id: string; midiData?: { notes?: Array<{ id: string; startBeat?: number; isSlide?: boolean; pitch?: number }> } };
    addMidiNote: (
      clipId: string,
      note: { pitch: number; startBeat: number; durationBeats: number; velocity: number; isSlide?: boolean },
    ) => string | undefined;
    quantizeMidiNotes: (clipId: string, noteIds: Array<string | undefined>, gridBeats: number) => void;
    removeMidiNote: (clipId: string, noteId: string | undefined) => void;
    project?: {
      tracks?: Array<{
        clips?: Array<{
          midiData?: {
            notes?: Array<{ id: string; startBeat?: number; isSlide?: boolean; pitch?: number }>;
          };
        }>;
      }>;
    };
  };
};

type PianoRollUIStore = {
  getState(): {
    setOpenPianoRoll: (trackId: string | null, clipId?: string | null) => void;
  };
};

type PianoRollHelpers = {
  beatToX: (beat: number) => number;
  pitchToY: (pitch: number) => number;
  keyHeight: number;
  activeTool: 'select' | 'pencil' | 'paint' | 'erase' | 'slide';
};

test.describe('Piano Roll Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => typeof (window as unknown as { __store?: unknown }).__store !== 'undefined', null, { timeout: 10000 });
    await page.evaluate(() => {
      const store = (window as unknown as { __store: PianoRollTestStore }).__store;
      store.getState().createProject({ name: 'Piano Roll Test' });
    });
  });

  test('can add a keyboard track with pianoRoll type', async ({ page }) => {
    const result = await page.evaluate(() => {
      const store = (window as unknown as { __store: PianoRollTestStore }).__store;
      const track = store.getState().addTrack('keyboard', 'pianoRoll');
      return { trackType: track.trackType, displayName: track.displayName };
    });
    expect(result.trackType).toBe('pianoRoll');
  });

  test('can create a MIDI clip via ensureMidiClip', async ({ page }) => {
    const result = await page.evaluate(() => {
      const store = (window as unknown as { __store: PianoRollTestStore }).__store;
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
      const store = (window as unknown as { __store: PianoRollTestStore }).__store;
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
      const store = (window as unknown as { __store: PianoRollTestStore }).__store;
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
      const store = (window as unknown as { __store: PianoRollTestStore }).__store;
      const track = store.getState().addTrack('keyboard', 'pianoRoll');
      const clip = store.getState().ensureMidiClip(track.id);
      const noteId = store.getState().addMidiNote(clip.id, { pitch: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
      store.getState().addMidiNote(clip.id, { pitch: 64, startBeat: 1, durationBeats: 1, velocity: 80 });
      store.getState().removeMidiNote(clip.id, noteId);
      return store.getState().project?.tracks[0]?.clips[0]?.midiData?.notes?.length ?? 0;
    });
    expect(noteCount).toBe(1);
  });

  test('can persist slide-note metadata via store API', async ({ page }) => {
    const result = await page.evaluate(() => {
      const store = (window as unknown as { __store: PianoRollTestStore }).__store;
      const track = store.getState().addTrack('keyboard', 'pianoRoll');
      const clip = store.getState().ensureMidiClip(track.id);
      const noteId = store.getState().addMidiNote(clip.id, {
        pitch: 67,
        startBeat: 1,
        durationBeats: 1,
        velocity: 96,
        isSlide: true,
      });
      const note = store.getState().project?.tracks?.[0]?.clips?.[0]?.midiData?.notes?.find((n) => n.id === noteId);
      return { isSlide: note?.isSlide, pitch: note?.pitch };
    });

    expect(result).toEqual({ isSlide: true, pitch: 67 });
  });

  test('exposes tool mode state and coordinate helpers for agent-driven canvas testing', async ({ page }) => {
    await page.evaluate(() => {
      const store = (window as unknown as { __store: PianoRollTestStore }).__store;
      const uiStore = (window as unknown as { __uiStore: PianoRollUIStore }).__uiStore;
      const track = store.getState().addTrack('keyboard', 'pianoRoll');
      const clip = store.getState().ensureMidiClip(track.id);
      uiStore.getState().setOpenPianoRoll(track.id, clip.id);
    });

    await expect(page.getByLabel('Piano roll editor')).toBeVisible();
    await expect(page.getByText('Tool: Select')).toBeVisible();

    await page.keyboard.press('5');
    await expect(page.getByText('Tool: Slide')).toBeVisible();

    const helperSnapshot = await page.evaluate(() => {
      const helpers = (window as unknown as { __pianoRollHelpers?: PianoRollHelpers }).__pianoRollHelpers;
      return helpers
        ? {
            activeTool: helpers.activeTool,
            noteX: helpers.beatToX(2),
            noteY: helpers.pitchToY(60) + helpers.keyHeight / 2,
          }
        : null;
    });

    expect(helperSnapshot).not.toBeNull();
    expect(helperSnapshot?.activeTool).toBe('slide');
    expect(helperSnapshot?.noteX).toBeGreaterThan(56);
    expect(helperSnapshot?.noteY).toBeGreaterThan(0);
  });
});
