import { expect, test } from '@playwright/test';
import { waitForBrowserStores } from '../support/browserStores';

function buildMidiBytes(
  notes: Array<{ pitch: number; velocity: number; startTick: number; durationTicks: number }>,
  options?: { trackName?: string; bpm?: number; tpqn?: number; channel?: number },
): Uint8Array {
  const tpqn = options?.tpqn ?? 480;
  const bpm = options?.bpm ?? 120;
  const trackName = options?.trackName ?? 'E2E MIDI';
  const channel = options?.channel ?? 0;

  function vlq(value: number): number[] {
    const out = [value & 0x7f];
    let remaining = value >> 7;
    while (remaining > 0) {
      out.unshift((remaining & 0x7f) | 0x80);
      remaining >>= 7;
    }
    return out;
  }

  function textBytes(text: string) {
    return [...new TextEncoder().encode(text)];
  }

  const microsPerQuarter = Math.round(60000000 / bpm);
  const tempoBytes = [
    (microsPerQuarter >>> 16) & 0xff,
    (microsPerQuarter >>> 8) & 0xff,
    microsPerQuarter & 0xff,
  ];

  type MidiEvent = { tick: number; order: number; data: number[] };
  const events: MidiEvent[] = [];
  const nameData = textBytes(trackName);
  events.push({ tick: 0, order: 0, data: [0xff, 0x03, ...vlq(nameData.length), ...nameData] });
  events.push({ tick: 0, order: 1, data: [0xff, 0x51, 0x03, ...tempoBytes] });
  events.push({ tick: 0, order: 2, data: [0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08] });

  for (const note of notes) {
    events.push({ tick: note.startTick, order: 4, data: [0x90 | channel, note.pitch, note.velocity] });
    events.push({ tick: note.startTick + note.durationTicks, order: 3, data: [0x80 | channel, note.pitch, 0] });
  }

  events.sort((left, right) => left.tick - right.tick || left.order - right.order);

  const trackData: number[] = [];
  let lastTick = 0;
  for (const event of events) {
    trackData.push(...vlq(event.tick - lastTick), ...event.data);
    lastTick = event.tick;
  }
  trackData.push(...vlq(0), 0xff, 0x2f, 0x00);

  const header = [
    ...textBytes('MThd'),
    0x00, 0x00, 0x00, 0x06,
    0x00, 0x00,
    0x00, 0x01,
    (tpqn >>> 8) & 0xff,
    tpqn & 0xff,
  ];

  const trackChunk = [
    ...textBytes('MTrk'),
    (trackData.length >>> 24) & 0xff,
    (trackData.length >>> 16) & 0xff,
    (trackData.length >>> 8) & 0xff,
    trackData.length & 0xff,
    ...trackData,
  ];

  return Uint8Array.from([...header, ...trackChunk]);
}

test.describe('MIDI to Strudel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await waitForBrowserStores(page);
    await page.evaluate(() => {
      (window as any).__store.getState().createProject({
        name: 'MIDI to Strudel E2E',
        bpm: 124,
        keyScale: 'C major',
      });
      (window as any).__uiStore.getState().setShowNewProjectDialog(false);
    });
  });

  test('converts the current piano roll clip from the toolbar and opens the Strudel panel on the target track', async ({ page }) => {
    const setup = await page.evaluate(() => {
      const store = (window as any).__store.getState();
      const ui = (window as any).__uiStore.getState();
      const track = store.addTrack('keyboard', 'pianoRoll');
      const clip = store.ensureMidiClip(track.id);
      store.addMidiNote(clip.id, { pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.9 });
      store.addMidiNote(clip.id, { pitch: 64, startBeat: 1, durationBeats: 1, velocity: 0.8 });
      store.addMidiNote(clip.id, { pitch: 67, startBeat: 2, durationBeats: 1, velocity: 0.85 });
      ui.setOpenPianoRoll(track.id, clip.id);
      return { trackId: track.id, clipId: clip.id };
    });

    await expect(page.getByRole('button', { name: 'To Strudel' })).toBeVisible();
    await page.getByRole('button', { name: 'To Strudel' }).click();

    await page.waitForFunction(() => {
      const dawWindow = window as any;
      const ui = dawWindow.__uiStore.getState();
      const store = dawWindow.__store.getState();
      const targetTrackId = ui.openStrudelEditorTrackId;
      if (!ui.strudelPanelOpen || !targetTrackId) return false;
      const track = store.project.tracks.find((candidate: any) => candidate.id === targetTrackId);
      return Boolean(track?.trackType === 'strudel' && track.strudelCode?.includes('stack('));
    });

    const result = await page.evaluate(() => {
      const dawWindow = window as any;
      const ui = dawWindow.__uiStore.getState();
      const store = dawWindow.__store.getState();
      const track = store.project.tracks.find((candidate: any) => candidate.id === ui.openStrudelEditorTrackId);
      return {
        strudelPanelOpen: ui.strudelPanelOpen,
        openStrudelEditorTrackId: ui.openStrudelEditorTrackId,
        trackType: track?.trackType ?? null,
        code: track?.strudelCode ?? '',
      };
    });

    expect(result.strudelPanelOpen).toBe(true);
    expect(result.openStrudelEditorTrackId).toBeTruthy();
    expect(result.trackType).toBe('strudel');
    expect(result.code).toContain('const BPM = 124');
    expect(result.code).toContain('stack(');
    expect(result.code).toContain('note(');
    await expect(page.getByTestId('strudel-editor-panel')).toBeVisible();
    expect(setup.trackId).toBeTruthy();
    expect(setup.clipId).toBeTruthy();
  });

  test('imports a .mid file from the Strudel editor sidebar onto the current Strudel track', async ({ page }) => {
    const strudelTrackId = await page.evaluate(() => {
      const store = (window as any).__store.getState();
      const ui = (window as any).__uiStore.getState();
      const midiTrack = store.addTrack('keyboard', 'pianoRoll');
      const clip = store.ensureMidiClip(midiTrack.id);
      store.addMidiNote(clip.id, { pitch: 72, startBeat: 0, durationBeats: 1, velocity: 0.95 });
      store.addMidiNote(clip.id, { pitch: 76, startBeat: 1, durationBeats: 1, velocity: 0.8 });
      ui.setOpenPianoRoll(midiTrack.id, clip.id);
      const strudelTrack = store.addTrack('custom', 'strudel');
      ui.setOpenStrudelEditor(strudelTrack.id);
      return strudelTrack.id;
    });

    await expect(page.getByTestId('strudel-editor-panel')).toBeVisible();
    await page.getByRole('button', { name: 'import' }).click();

    const midiBuffer = Buffer.from(buildMidiBytes([
      { pitch: 60, velocity: 96, startTick: 0, durationTicks: 480 },
      { pitch: 64, velocity: 88, startTick: 480, durationTicks: 480 },
      { pitch: 67, velocity: 92, startTick: 960, durationTicks: 480 },
    ], { trackName: 'SidebarImport', bpm: 138 }));

    await page.locator('input[type="file"]').setInputFiles({
      name: 'sidebar-import.mid',
      mimeType: 'audio/midi',
      buffer: midiBuffer,
    });

    await page.waitForFunction((targetTrackId) => {
      const track = (window as any).__store.getState().project.tracks.find((candidate: any) => candidate.id === targetTrackId);
      return Boolean(track?.strudelCode?.includes('SidebarImport') || track?.strudelCode?.includes('const BPM = 138'));
    }, strudelTrackId);

    const result = await page.evaluate((targetTrackId) => {
      const dawWindow = window as any;
      const ui = dawWindow.__uiStore.getState();
      const store = dawWindow.__store.getState();
      const track = store.project.tracks.find((candidate: any) => candidate.id === targetTrackId);
      return {
        openStrudelEditorTrackId: ui.openStrudelEditorTrackId,
        code: track?.strudelCode ?? '',
      };
    }, strudelTrackId);

    expect(result.openStrudelEditorTrackId).toBe(strudelTrackId);
    expect(result.code).toContain('const BPM = 138');
    expect(result.code).toContain('stack(');
    expect(result.code).toContain('// Source: sidebar-import');
  });

});
