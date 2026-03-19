import { test, expect } from '@playwright/test';

type CaptureMidiStore = {
  getState(): {
    createProject: (input: { name: string }) => void;
    addTrack: (name: string, type: 'pianoRoll') => { id: string; displayName: string };
    recordMidiNoteOn: (trackId: string, pitch: number, velocity?: number, options?: { timestampMs?: number; transportTime?: number | null; source?: 'agent' | 'live' }) => void;
    recordMidiNoteOff: (trackId: string, pitch: number, options?: { timestampMs?: number; transportTime?: number | null }) => void;
    captureMidi: (options?: { trackId?: string; nowMs?: number; transportTime?: number | null }) => { status: string; clipId?: string };
    undo: () => void;
    project?: {
      tracks: Array<{
        id: string;
        clips: Array<{
          id: string;
          midiData?: {
            notes: Array<{ pitch: number; startBeat: number; durationBeats: number }>;
          };
        }>;
      }>;
    };
  };
};

type UIStore = {
  getState(): {
    setOpenPianoRoll: (trackId: string | null, clipId?: string | null) => void;
    setShowNewProjectDialog: (open: boolean) => void;
  };
};

test.describe('Capture MIDI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => typeof (window as unknown as { __store?: unknown }).__store !== 'undefined', null, { timeout: 10000 });
    await page.mouse.click(24, 24);
  });

  test('captures buffered MIDI from the toolbar and supports one-step undo', async ({ page }) => {
    await page.evaluate(() => {
      const store = (window as unknown as { __store: CaptureMidiStore }).__store;
      const uiStore = (window as unknown as { __uiStore: UIStore }).__uiStore;

      store.getState().createProject({ name: 'Capture MIDI E2E' });
      uiStore.getState().setShowNewProjectDialog(false);
      const track = store.getState().addTrack('keyboard', 'pianoRoll');
      uiStore.getState().setOpenPianoRoll(track.id, null);
      const now = Date.now();

      store.getState().recordMidiNoteOn(track.id, 60, 100, { timestampMs: now - 1200, transportTime: 0.25, source: 'agent' });
      store.getState().recordMidiNoteOff(track.id, 60, { timestampMs: now - 700, transportTime: 0.5 });
      store.getState().recordMidiNoteOn(track.id, 64, 96, { timestampMs: now - 600, transportTime: 0.75, source: 'agent' });
      store.getState().recordMidiNoteOff(track.id, 64, { timestampMs: now - 150, transportTime: 1.0 });
    });

    await page.getByRole('button', { name: 'Capture MIDI' }).click();

    const captured = await page.evaluate(() => {
      const store = (window as unknown as { __store: CaptureMidiStore }).__store;
      const track = store.getState().project?.tracks[0];
      const clip = track?.clips[0];
      return {
        clipCount: track?.clips.length ?? 0,
        noteCount: clip?.midiData?.notes.length ?? 0,
        pitches: clip?.midiData?.notes.map((note) => note.pitch) ?? [],
      };
    });

    expect(captured).toEqual({
      clipCount: 1,
      noteCount: 2,
      pitches: [60, 64],
    });

    await page.evaluate(() => {
      const store = (window as unknown as { __store: CaptureMidiStore }).__store;
      store.getState().undo();
    });

    const afterUndo = await page.evaluate(() => {
      const store = (window as unknown as { __store: CaptureMidiStore }).__store;
      return store.getState().project?.tracks[0]?.clips.length ?? 0;
    });

    expect(afterUndo).toBe(0);
  });
});
