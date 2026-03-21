/**
 * Covered story ids:
 * - TRK-002
 * - PNR-001, PNR-002
 *
 * Persona: melodic editor user and QA agent
 * Workflow summary: seed piano roll state, open the editor, and verify note
 * creation, editing, and tool behavior.
 * Why this test exists: this is the detailed editor suite for core MIDI stories.
 * Left to other layers: human feel judgment and higher-level arrangement flows.
 */
import { test, expect } from '@playwright/test';

type PianoRollTestStore = {
  getState(): {
    createProject: (input: { name: string }) => void;
    addTrack: (name: string, type: 'pianoRoll') => { id: string; trackType: string; displayName: string };
    ensureMidiClip: (trackId: string) => {
      id: string;
      midiData?: { notes?: Array<{ id: string; startBeat?: number; isSlide?: boolean; pitch?: number }> };
    };
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
    activePianoRollTool: 'select' | 'pencil' | 'paint' | 'erase' | 'slide';
    setActivePianoRollTool: (tool: 'select' | 'pencil' | 'paint' | 'erase' | 'slide') => void;
    project?: {
      tracks?: Array<{
        clips?: Array<{
          midiData?: {
            notes?: Array<{
              id: string;
              startBeat?: number;
              isSlide?: boolean;
              pitch?: number;
              velocity?: number;
              durationBeats?: number;
            }>;
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
  velocityLaneTop: number;
  velocityLaneHeight: number;
  applyToolStroke: (points: Array<{ x: number; y: number }>) => void;
  selectNoteAt: (x: number, y: number, additive?: boolean) => string | null;
  eraseNoteAt: (x: number, y: number) => string | null;
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
    expect(result).toBe(0);
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
    const enableAudio = page.getByText('Click anywhere to enable audio');
    if (await enableAudio.isVisible()) {
      await enableAudio.click();
    }

    await page.getByRole('region').click();
    await page.keyboard.press('3');
    await expect(page.getByText('Tool: Paint')).toBeVisible();

    const helperSnapshot = await page.evaluate(() => {
      const helpers = (window as unknown as { __pianoRollHelpers?: PianoRollHelpers }).__pianoRollHelpers;
      const store = (window as unknown as { __store: PianoRollTestStore }).__store;
      return helpers
        ? {
            activeTool: store.getState().activePianoRollTool,
            noteX: helpers.beatToX(2),
            noteY: helpers.pitchToY(60) + helpers.keyHeight / 2,
          }
        : null;
    });

    expect(helperSnapshot).not.toBeNull();
    expect(helperSnapshot?.activeTool).toBe('paint');
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

    const samplePixel = async (x: number, y: number) =>
      page.evaluate(({ x: localX, y: localY }) => {
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

  test('supports a short composition workflow with pencil, paint, select, and erase tools', async ({ page }) => {
    await page.evaluate(() => {
      const store = (window as unknown as { __store: PianoRollTestStore }).__store;
      const uiStore = (window as unknown as { __uiStore: PianoRollUIStore }).__uiStore;
      const track = store.getState().addTrack('keyboard', 'pianoRoll');
      const clip = store.getState().ensureMidiClip(track.id);
      uiStore.getState().setOpenPianoRoll(track.id, clip.id);
    });

    const editor = page.getByLabel('Piano roll editor');
    await expect(editor).toBeVisible();
    const enableAudio = page.getByText('Click anywhere to enable audio');
    if (await enableAudio.isVisible()) {
      await enableAudio.click();
    }

    const helper = await page.evaluate(() => {
      const helpers = (window as unknown as { __pianoRollHelpers?: PianoRollHelpers }).__pianoRollHelpers;
      if (!helpers) return null;
      return {
        beat0X: helpers.beatToX(0) + 1,
        beat1X: helpers.beatToX(1) + 1,
        beat125X: helpers.beatToX(1.25) + 1,
        beat150X: helpers.beatToX(1.5) + 1,
        pitch60Y: helpers.pitchToY(60) + helpers.keyHeight / 2,
        pitch62Y: helpers.pitchToY(62) + helpers.keyHeight / 2,
      };
    });
    expect(helper).not.toBeNull();

    const box = await editor.boundingBox();
    expect(box).not.toBeNull();
    if (!helper || !box) {
      throw new Error('Piano roll helper coordinates were unavailable');
    }

    await page.getByRole('region').click();

    await page.getByLabel('Activate pencil tool').click();
    await page.mouse.click(box.x + helper.beat0X, box.y + helper.pitch60Y);
    await expect
      .poll(async () =>
        page.evaluate(() =>
          (window as unknown as { __store: PianoRollTestStore }).__store.getState().project?.tracks?.[0]?.clips?.[0]?.midiData?.notes?.length ?? 0,
        ),
      )
      .toBe(1);

    await page.keyboard.press('3');
    await expect
      .poll(async () =>
        page.evaluate(() => (window as unknown as { __store: PianoRollTestStore }).__store.getState().activePianoRollTool),
      )
      .toBe('paint');

    await page.evaluate(({ points }) => {
      const helpers = (window as unknown as { __pianoRollHelpers?: PianoRollHelpers }).__pianoRollHelpers;
      if (!helpers) {
        throw new Error('Piano roll helpers not available');
      }
      helpers.applyToolStroke(points);
    }, {
      points: [
        { x: helper.beat1X, y: helper.pitch62Y },
        { x: helper.beat125X, y: helper.pitch62Y },
        { x: helper.beat150X, y: helper.pitch62Y },
      ],
    });

    await expect
      .poll(async () =>
        page.evaluate(() =>
          (window as unknown as { __store: PianoRollTestStore }).__store.getState().project?.tracks?.[0]?.clips?.[0]?.midiData?.notes?.length ?? 0,
        ),
      )
      .toBe(4);

    await page.keyboard.press('1');
    await expect
      .poll(async () =>
        page.evaluate(() => (window as unknown as { __store: PianoRollTestStore }).__store.getState().activePianoRollTool),
      )
      .toBe('select');

    await page.evaluate(({ x, y }) => {
      const helpers = (window as unknown as { __pianoRollHelpers?: PianoRollHelpers }).__pianoRollHelpers;
      if (!helpers) {
        throw new Error('Piano roll helpers not available');
      }
      helpers.selectNoteAt(x, y, false);
    }, { x: helper.beat125X, y: helper.pitch62Y });
    await page.waitForTimeout(50);
    await page.keyboard.press('ArrowRight');

    await expect.poll(async () => page.evaluate(() => {
      const notes = (window as unknown as { __store: PianoRollTestStore }).__store.getState().project?.tracks?.[0]?.clips?.[0]?.midiData?.notes ?? [];
      return notes
        .filter((note) => note.pitch === 62)
        .map((note) => note.startBeat)
        .sort((a, b) => (a ?? 0) - (b ?? 0));
    })).toEqual([1, 1.5, 1.5]);

    await page.keyboard.press('4');
    await expect
      .poll(async () =>
        page.evaluate(() => (window as unknown as { __store: PianoRollTestStore }).__store.getState().activePianoRollTool),
      )
      .toBe('erase');

    await page.evaluate(({ x, y }) => {
      const helpers = (window as unknown as { __pianoRollHelpers?: PianoRollHelpers }).__pianoRollHelpers;
      if (!helpers) {
        throw new Error('Piano roll helpers not available');
      }
      helpers.eraseNoteAt(x, y);
    }, { x: helper.beat150X, y: helper.pitch62Y });

    await expect.poll(async () => page.evaluate(() => {
      const notes = (window as unknown as { __store: PianoRollTestStore }).__store.getState().project?.tracks?.[0]?.clips?.[0]?.midiData?.notes ?? [];
      return {
        count: notes.length,
        pitches: notes.map((note) => note.pitch).sort((a, b) => (a ?? 0) - (b ?? 0)),
      };
    })).toEqual({
      count: 3,
      pitches: [60, 62, 62],
    });
  });
});
