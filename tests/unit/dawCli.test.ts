import { describe, it, expect } from 'vitest';
import { parseArgs, formatOutput } from '../../server/daw-cli';

describe('daw-cli parseArgs', () => {
  // ── Read commands ──
  it('parses "status" → daw_get_project', () => {
    expect(parseArgs(['status'])).toEqual({ tool: 'daw_get_project', params: {} });
  });

  it('parses "tracks" → daw_get_tracks', () => {
    expect(parseArgs(['tracks'])).toEqual({ tool: 'daw_get_tracks', params: {} });
  });

  it('parses "transport" → daw_get_transport', () => {
    expect(parseArgs(['transport'])).toEqual({ tool: 'daw_get_transport', params: {} });
  });

  it('parses "mixer" → daw_get_mixer', () => {
    expect(parseArgs(['mixer'])).toEqual({ tool: 'daw_get_mixer', params: {} });
  });

  // ── Transport commands ──
  it('parses "play" → daw_play', () => {
    expect(parseArgs(['play'])).toEqual({ tool: 'daw_play', params: {} });
  });

  it('parses "stop" → daw_stop', () => {
    expect(parseArgs(['stop'])).toEqual({ tool: 'daw_stop', params: {} });
  });

  it('parses "loop" → daw_toggle_loop', () => {
    expect(parseArgs(['loop'])).toEqual({ tool: 'daw_toggle_loop', params: {} });
  });

  // ── set-bpm ──
  it('parses "set-bpm 140" → daw_set_bpm with bpm=140', () => {
    expect(parseArgs(['set-bpm', '140'])).toEqual({ tool: 'daw_set_bpm', params: { bpm: 140 } });
  });

  it('throws on "set-bpm" without number', () => {
    expect(() => parseArgs(['set-bpm'])).toThrow('Usage: set-bpm');
  });

  it('throws on "set-bpm abc"', () => {
    expect(() => parseArgs(['set-bpm', 'abc'])).toThrow('Usage: set-bpm');
  });

  // ── add-track ──
  it('parses "add-track stems" → daw_add_track', () => {
    expect(parseArgs(['add-track', 'stems'])).toEqual({ tool: 'daw_add_track', params: { type: 'stems' } });
  });

  it('parses "add-track pianoroll My Piano" with name', () => {
    expect(parseArgs(['add-track', 'pianoroll', 'My', 'Piano'])).toEqual({
      tool: 'daw_add_track',
      params: { type: 'pianoroll', name: 'My Piano' },
    });
  });

  it('throws on "add-track" without type', () => {
    expect(() => parseArgs(['add-track'])).toThrow('Usage: add-track');
  });

  // ── delete-track ──
  it('parses "delete-track abc123"', () => {
    expect(parseArgs(['delete-track', 'abc123'])).toEqual({ tool: 'daw_delete_track', params: { trackId: 'abc123' } });
  });

  // ── Mixer commands ──
  it('parses "volume tid 0.5"', () => {
    expect(parseArgs(['volume', 'tid', '0.5'])).toEqual({ tool: 'daw_set_volume', params: { trackId: 'tid', volume: 0.5 } });
  });

  it('parses "pan tid -0.3"', () => {
    expect(parseArgs(['pan', 'tid', '-0.3'])).toEqual({ tool: 'daw_set_pan', params: { trackId: 'tid', pan: -0.3 } });
  });

  it('parses "mute tid"', () => {
    expect(parseArgs(['mute', 'tid'])).toEqual({ tool: 'daw_toggle_mute', params: { trackId: 'tid' } });
  });

  it('parses "solo tid"', () => {
    expect(parseArgs(['solo', 'tid'])).toEqual({ tool: 'daw_toggle_solo', params: { trackId: 'tid' } });
  });

  // ── MIDI ──
  it('parses "add-note clipX 60 0 1"', () => {
    expect(parseArgs(['add-note', 'clipX', '60', '0', '1'])).toEqual({
      tool: 'daw_add_midi_note',
      params: { clipId: 'clipX', pitch: 60, startBeat: 0, durationBeats: 1 },
    });
  });

  it('parses "add-note clipX 60 0 1 0.5" with velocity', () => {
    expect(parseArgs(['add-note', 'clipX', '60', '0', '1', '0.5'])).toEqual({
      tool: 'daw_add_midi_note',
      params: { clipId: 'clipX', pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.5 },
    });
  });

  // ── Sequencer ──
  it('parses "toggle-step tid rid 3"', () => {
    expect(parseArgs(['toggle-step', 'tid', 'rid', '3'])).toEqual({
      tool: 'daw_toggle_step',
      params: { trackId: 'tid', rowId: 'rid', stepIndex: 3 },
    });
  });

  // ── Generate ──
  it('parses "generate lo-fi hip hop" joining words', () => {
    expect(parseArgs(['generate', 'lo-fi', 'hip', 'hop'])).toEqual({
      tool: 'daw_generate',
      params: { prompt: 'lo-fi hip hop' },
    });
  });

  it('throws on "generate" without prompt', () => {
    expect(() => parseArgs(['generate'])).toThrow('Usage: generate');
  });

  // ── show-mixer ──
  it('parses "show-mixer"', () => {
    expect(parseArgs(['show-mixer'])).toEqual({ tool: 'daw_show_mixer', params: {} });
  });

  // ── Error cases ──
  it('throws on empty args', () => {
    expect(() => parseArgs([])).toThrow();
  });

  it('throws on unknown command', () => {
    expect(() => parseArgs(['foobar'])).toThrow('Unknown command: foobar');
  });
});

describe('daw-cli formatOutput', () => {
  it('formats project status as compact table', () => {
    const result = {
      name: 'My Song',
      bpm: 120,
      timeSignature: [4, 4],
      totalDuration: 60,
      trackCount: 2,
      tracks: [
        { id: 'abcdefgh1234', name: 'Drums', type: 'sequencer', clipCount: 1, volume: 0.8, pan: 0, muted: false, soloed: false },
        { id: 'ijklmnop5678', name: 'Bass', type: 'pianoRoll', clipCount: 2, volume: 0.6, pan: -0.5, muted: true, soloed: false },
      ],
    };
    const output = formatOutput('daw_get_project', result);
    expect(output).toContain('My Song');
    expect(output).toContain('120 BPM');
    expect(output).toContain('4/4');
    expect(output).toContain('Drums');
    expect(output).toContain('80%');
    expect(output).toContain('M.');  // muted bass
    expect(output).toContain('..');  // unmuted drums
  });

  it('formats transport state (playing)', () => {
    const result = { isPlaying: true, currentTime: 12.5, loopEnabled: true, loopStart: 4, loopEnd: 16 };
    const output = formatOutput('daw_get_transport', result);
    expect(output).toContain('PLAYING');
    expect(output).toContain('12.5s');
    expect(output).toContain('loop 4s–16s');
  });

  it('formats transport state (stopped, no loop)', () => {
    const result = { isPlaying: false, currentTime: 0, loopEnabled: false, loopStart: 0, loopEnd: 0 };
    const output = formatOutput('daw_get_transport', result);
    expect(output).toContain('STOPPED');
    expect(output).toContain('loop off');
  });

  it('formats mixer with pan labels', () => {
    const result = {
      tracks: [
        { id: 'aaaaaaaabbbb', name: 'Kick', volume: 1, pan: 0, muted: false, soloed: true },
        { id: 'ccccccccdddd', name: 'Pad', volume: 0.4, pan: -0.7, muted: false, soloed: false },
        { id: 'eeeeeeeeffff', name: 'Lead', volume: 0.7, pan: 0.3, muted: false, soloed: false },
      ],
    };
    const output = formatOutput('daw_get_mixer', result);
    expect(output).toContain('100%');  // kick volume
    expect(output).toContain('C');     // center pan
    expect(output).toContain('L70');   // pad pan left 70
    expect(output).toContain('R30');   // lead pan right 30
    expect(output).toContain('.S');    // kick soloed
  });

  it('formats tracks with clips', () => {
    const result = [
      {
        id: 'track1234567',
        name: 'Lead',
        type: 'stems',
        clips: [
          { id: 'clip12345678', startTime: 0, duration: 4, prompt: 'jazzy piano', generationStatus: 'complete' },
        ],
        volume: 0.8,
        pan: 0,
        muted: false,
        soloed: false,
      },
    ];
    const output = formatOutput('daw_get_tracks', result);
    expect(output).toContain('Lead');
    expect(output).toContain('stems');
    expect(output).toContain('@0s');
    expect(output).toContain('dur=4s');
    expect(output).toContain('[complete]');
    expect(output).toContain('jazzy piano');
  });

  it('formats success result compactly', () => {
    expect(formatOutput('daw_play', { success: true })).toBe('OK');
    expect(formatOutput('daw_set_bpm', { success: true, bpm: 140 })).toBe('OK: bpm=140');
    expect(formatOutput('daw_add_track', { success: true, trackId: 'abc', name: 'Drums' })).toBe('OK: track=abc, name="Drums"');
  });

  it('formats error result', () => {
    expect(formatOutput('daw_set_bpm', { error: 'BPM must be between 20 and 999' })).toBe('Error: BPM must be between 20 and 999');
  });

  it('handles null/undefined', () => {
    expect(formatOutput('daw_play', null)).toBe('OK');
    expect(formatOutput('daw_play', undefined)).toBe('OK');
  });

  it('formats no project loaded', () => {
    expect(formatOutput('daw_get_project', { error: 'No project loaded' })).toBe('No project loaded');
  });

  it('formats empty tracks list', () => {
    expect(formatOutput('daw_get_tracks', [])).toBe('No tracks');
  });

  it('formats empty mixer', () => {
    expect(formatOutput('daw_get_mixer', { tracks: [] })).toBe('No tracks');
  });

  it('formats toggle loop result', () => {
    const output = formatOutput('daw_toggle_loop', { success: true, loopEnabled: true });
    expect(output).toBe('OK: loop=on');
  });
});
