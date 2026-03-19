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
    updateMidiNote: (
      clipId: string,
      noteId: string | undefined,
      updates: { velocity?: number },
    ) => void;
    quantizeMidiNotes: (clipId: string, noteIds: Array<string | undefined>, gridBeats: number) => void;
    removeMidiNote: (clipId: string, noteId: string | undefined) => void;
    project?: {
      tracks?: Array<{
        clips?: Array<{
          midiData?: {
            notes?: Array<{ id: string; startBeat?: number; isSlide?: boolean; pitch?: number; velocity?: number }>;
          };
        }>;
      }>;
    };
  };
};

type PianoRollUIStore = {
  getState(): {
    setOpenPianoRoll: (trackId: string | null, clipId?: string | null) => void;
    skipOnboarding: () => void;
  };
};

type PianoRollHelpers = {
  beatToX: (beat: number) => number;
  pitchToY: (pitch: number) => number;
  keyHeight: number;
  activeTool: 'select' | 'pencil' | 'paint' | 'erase' | 'slide';
  velocityLaneTop: number;
  velocityLaneHeight: number;
};

test.describe('Piano Roll Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => typeof (window as unknown as { __store?: unknown }).__store !== 'undefined', null, { timeout: 10000 });
    await page.evaluate(() => {
      const store = (window as unknown as { __store: PianoRollTestStore }).__store;
      const uiStore = (window as unknown as { __uiStore: PianoRollUIStore }).__uiStore;
      store.getState().createProject({ name: 'Piano Roll Test' });
      uiStore.getState().skipOnboarding();
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

  test('renders and edits velocity across low, medium, and high notes', async ({ page }) => {
    await page.evaluate(() => {
      const store = (window as unknown as { __store: PianoRollTestStore }).__store;
      const uiStore = (window as unknown as { __uiStore: PianoRollUIStore }).__uiStore;
      const track = store.getState().addTrack('keyboard', 'pianoRoll');
      const clip = store.getState().ensureMidiClip(track.id);

      store.getState().addMidiNote(clip.id, { pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.2 });
      store.getState().addMidiNote(clip.id, { pitch: 64, startBeat: 1, durationBeats: 1, velocity: 0.5 });
      store.getState().addMidiNote(clip.id, { pitch: 67, startBeat: 2, durationBeats: 1, velocity: 0.9 });
      uiStore.getState().setOpenPianoRoll(track.id, clip.id);
    });

    const canvas = page.getByLabel('Piano roll editor');
    await expect(canvas).toBeVisible();
    await page.mouse.click(8, 8);

    const helperSnapshot = await page.evaluate(() => {
      const helpers = (window as unknown as { __pianoRollHelpers?: PianoRollHelpers }).__pianoRollHelpers;
      return helpers
        ? {
            lowX: helpers.beatToX(0) + 10,
            mediumX: helpers.beatToX(1) + 10,
            highX: helpers.beatToX(2) + 10,
            lowY: helpers.pitchToY(60) + helpers.keyHeight / 2,
            mediumY: helpers.pitchToY(64) + helpers.keyHeight / 2,
            highY: helpers.pitchToY(67) + helpers.keyHeight / 2,
            velocityLaneTop: helpers.velocityLaneTop,
            velocityLaneHeight: helpers.velocityLaneHeight,
          }
        : null;
    });

    expect(helperSnapshot).not.toBeNull();

    const samplePixel = async (x: number, y: number) => page.evaluate(({ x: localX, y: localY }) => {
      const canvasElement = document.querySelector('canvas[aria-label="Piano roll editor"]') as HTMLCanvasElement | null;
      if (!canvasElement) return null;

      const ctx = canvasElement.getContext('2d');
      if (!ctx) return null;

      const dpr = window.devicePixelRatio || 1;
      const data = ctx.getImageData(Math.floor(localX * dpr), Math.floor(localY * dpr), 1, 1).data;
      return Array.from(data);
    }, { x, y });

    const lowPixel = await samplePixel(helperSnapshot!.lowX, helperSnapshot!.lowY);
    const highPixel = await samplePixel(helperSnapshot!.highX, helperSnapshot!.highY);

    expect(lowPixel).not.toBeNull();
    expect(highPixel).not.toBeNull();
    expect(lowPixel).not.toEqual(highPixel);

    const beforeVelocity = await page.evaluate(() => {
      const store = (window as unknown as { __store: PianoRollTestStore }).__store;
      return store.getState().project?.tracks?.[0]?.clips?.[0]?.midiData?.notes?.[1]?.velocity ?? null;
    });

    await canvas.click({
      position: {
        x: helperSnapshot!.mediumX,
        y: helperSnapshot!.velocityLaneTop + helperSnapshot!.velocityLaneHeight * 0.15,
      },
    });

    await page.waitForFunction(() => {
      const store = (window as unknown as { __store: PianoRollTestStore }).__store;
      const velocity = store.getState().project?.tracks?.[0]?.clips?.[0]?.midiData?.notes?.[1]?.velocity;
      return typeof velocity === 'number' && velocity > 100;
    });

    const afterVelocity = await page.evaluate(() => {
      const store = (window as unknown as { __store: PianoRollTestStore }).__store;
      return store.getState().project?.tracks?.[0]?.clips?.[0]?.midiData?.notes?.[1]?.velocity ?? null;
    });
    const updatedMediumPixel = await samplePixel(helperSnapshot!.mediumX, helperSnapshot!.mediumY);

    expect(beforeVelocity).not.toBeNull();
    expect(afterVelocity).toBeGreaterThan(beforeVelocity as number);
    expect(updatedMediumPixel).not.toBeNull();
    expect(updatedMediumPixel).not.toEqual(lowPixel);
  });
});
