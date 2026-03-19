import { test, expect } from '@playwright/test';

/**
 * Helper: build a minimal valid MIDI file (Type 0) as a Uint8Array.
 * Contains one track with the given notes on channel 0.
 */
function buildMidiBytes(
  notes: Array<{ pitch: number; velocity: number; startTick: number; durationTicks: number }>,
  options?: { trackName?: string; bpm?: number; tpqn?: number },
): Uint8Array {
  const tpqn = options?.tpqn ?? 480;
  const bpm = options?.bpm ?? 120;
  const trackName = options?.trackName ?? 'E2E Track';

  function vlq(value: number): number[] {
    const buf = [value & 0x7f];
    let remaining = value >> 7;
    while (remaining > 0) {
      buf.unshift((remaining & 0x7f) | 0x80);
      remaining >>= 7;
    }
    return buf;
  }

  function textBytes(s: string) { return [...new TextEncoder().encode(s)]; }

  const microsPerQuarter = Math.round(60000000 / bpm);
  const tempoBytes = [
    (microsPerQuarter >>> 16) & 0xff,
    (microsPerQuarter >>> 8) & 0xff,
    microsPerQuarter & 0xff,
  ];

  // Build events sorted by absolute tick
  type Ev = { tick: number; order: number; data: number[] };
  const events: Ev[] = [];

  // Meta: track name
  const nameData = textBytes(trackName);
  events.push({ tick: 0, order: 0, data: [0xff, 0x03, ...vlq(nameData.length), ...nameData] });
  // Meta: tempo
  events.push({ tick: 0, order: 1, data: [0xff, 0x51, 0x03, ...tempoBytes] });
  // Meta: time sig 4/4
  events.push({ tick: 0, order: 2, data: [0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08] });

  for (const n of notes) {
    events.push({ tick: n.startTick, order: 4, data: [0x90, n.pitch, n.velocity] });
    events.push({ tick: n.startTick + n.durationTicks, order: 3, data: [0x80, n.pitch, 0] });
  }

  events.sort((a, b) => a.tick - b.tick || a.order - b.order);

  const trackData: number[] = [];
  let prevTick = 0;
  for (const ev of events) {
    trackData.push(...vlq(ev.tick - prevTick), ...ev.data);
    prevTick = ev.tick;
  }
  // End of track
  trackData.push(...vlq(0), 0xff, 0x2f, 0x00);

  const trackChunk = [
    ...textBytes('MTrk'),
    (trackData.length >>> 24) & 0xff,
    (trackData.length >>> 16) & 0xff,
    (trackData.length >>> 8) & 0xff,
    trackData.length & 0xff,
    ...trackData,
  ];

  const header = [
    ...textBytes('MThd'),
    0x00, 0x00, 0x00, 0x06,
    0x00, 0x00, // format 0
    0x00, 0x01, // 1 track
    (tpqn >>> 8) & 0xff,
    tpqn & 0xff,
  ];

  return Uint8Array.from([...header, ...trackChunk]);
}

test.describe('MIDI Import', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => typeof (window as any).__store !== 'undefined', null, { timeout: 10000 });
    await page.evaluate(() => {
      (window as any).__store.getState().createProject({ name: 'MIDI Import E2E' });
      (window as any).__uiStore.getState().setShowNewProjectDialog(false);
    });
  });

  test('imports a MIDI file via store action and creates piano roll tracks', async ({ page }) => {
    // Build MIDI bytes and pass them to the store's importMidiFile action
    const midiBase64 = Buffer.from(buildMidiBytes([
      { pitch: 60, velocity: 100, startTick: 0, durationTicks: 480 },
      { pitch: 64, velocity: 80, startTick: 480, durationTicks: 240 },
      { pitch: 67, velocity: 90, startTick: 720, durationTicks: 480 },
    ], { trackName: 'TestPiano', bpm: 130 })).toString('base64');

    const trackIds = await page.evaluate(async (b64: string) => {
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const file = new File([bytes], 'test.mid', { type: 'audio/midi' });
      return (window as any).__store.getState().importMidiFile(file, { applyMetadata: true });
    }, midiBase64);

    expect(trackIds).toHaveLength(1);

    // Verify the track was created with correct data
    const trackData = await page.evaluate((trackId: string) => {
      const store = (window as any).__store.getState();
      const track = store.getTrackById(trackId);
      if (!track) return null;
      return {
        displayName: track.displayName,
        trackType: track.trackType,
        clipCount: track.clips.length,
        noteCount: track.clips[0]?.midiData?.notes?.length ?? 0,
        firstNote: track.clips[0]?.midiData?.notes?.[0],
      };
    }, trackIds[0]);

    expect(trackData).not.toBeNull();
    expect(trackData!.displayName).toBe('TestPiano');
    expect(trackData!.trackType).toBe('pianoRoll');
    expect(trackData!.clipCount).toBe(1);
    expect(trackData!.noteCount).toBe(3);
    expect(trackData!.firstNote.pitch).toBe(60);

    // Verify BPM was applied
    const bpm = await page.evaluate(() => {
      return (window as any).__store.getState().project.bpm;
    });
    expect(bpm).toBeCloseTo(130, 0);
  });

  test('multi-channel MIDI creates multiple tracks', async ({ page }) => {
    // Build a type 0 file with notes on channels 0 and 1
    const tpqn = 480;
    function vlq(value: number): number[] {
      const buf = [value & 0x7f];
      let remaining = value >> 7;
      while (remaining > 0) {
        buf.unshift((remaining & 0x7f) | 0x80);
        remaining >>= 7;
      }
      return buf;
    }
    function textBytes(s: string) { return [...new TextEncoder().encode(s)]; }

    const nameData = textBytes('MultiCh');
    const trackData: number[] = [
      // Track name
      ...vlq(0), 0xff, 0x03, ...vlq(nameData.length), ...nameData,
      // Ch 0 note
      ...vlq(0), 0x90, 60, 100,
      // Ch 1 note (simultaneous)
      ...vlq(0), 0x91, 67, 80,
      // Ch 0 note-off
      ...vlq(480), 0x80, 60, 0,
      // Ch 1 note-off
      ...vlq(0), 0x81, 67, 0,
      // End of track
      ...vlq(0), 0xff, 0x2f, 0x00,
    ];

    const trackChunk = [
      ...textBytes('MTrk'),
      (trackData.length >>> 24) & 0xff,
      (trackData.length >>> 16) & 0xff,
      (trackData.length >>> 8) & 0xff,
      trackData.length & 0xff,
      ...trackData,
    ];

    const header = [
      ...textBytes('MThd'),
      0x00, 0x00, 0x00, 0x06,
      0x00, 0x00, // format 0
      0x00, 0x01,
      (tpqn >>> 8) & 0xff,
      tpqn & 0xff,
    ];

    const midiBase64 = Buffer.from(Uint8Array.from([...header, ...trackChunk])).toString('base64');

    const trackIds = await page.evaluate(async (b64: string) => {
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const file = new File([bytes], 'multi.mid', { type: 'audio/midi' });
      return (window as any).__store.getState().importMidiFile(file);
    }, midiBase64);

    expect(trackIds).toHaveLength(2);

    // Verify track names include channel info
    const names = await page.evaluate((ids: string[]) => {
      const store = (window as any).__store.getState();
      return ids.map((id) => store.getTrackById(id)?.displayName);
    }, trackIds);

    expect(names).toEqual(['MultiCh Ch 1', 'MultiCh Ch 2']);
  });
});
