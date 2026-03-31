import { describe, it, expect } from 'vitest';
import {
  parseCommand,
  formatPan,
  formatTime,
  formatStatus,
  formatMixer,
  formatTransport,
  formatResult,
} from '../../server/daw-cli-format';

describe('daw-cli-format', () => {
  describe('parseCommand', () => {
    it('parses status command', () => {
      expect(parseCommand(['status'])).toEqual({
        tool: 'daw_get_project',
        params: {},
      });
    });

    it('parses tracks command', () => {
      expect(parseCommand(['tracks'])).toEqual({
        tool: 'daw_get_tracks',
        params: {},
      });
    });

    it('parses transport command', () => {
      expect(parseCommand(['transport'])).toEqual({
        tool: 'daw_get_transport',
        params: {},
      });
    });

    it('parses mix command', () => {
      expect(parseCommand(['mix'])).toEqual({
        tool: 'daw_get_mixer',
        params: {},
      });
    });

    it('parses play/stop/loop', () => {
      expect(parseCommand(['play'])).toEqual({ tool: 'daw_play', params: {} });
      expect(parseCommand(['stop'])).toEqual({ tool: 'daw_stop', params: {} });
      expect(parseCommand(['loop'])).toEqual({ tool: 'daw_toggle_loop', params: {} });
    });

    it('parses set-bpm with valid value', () => {
      expect(parseCommand(['set-bpm', '140'])).toEqual({
        tool: 'daw_set_bpm',
        params: { bpm: 140 },
      });
    });

    it('rejects set-bpm with invalid value', () => {
      const result = parseCommand(['set-bpm', 'abc']);
      expect('error' in result).toBe(true);
    });

    it('rejects set-bpm out of range', () => {
      expect('error' in parseCommand(['set-bpm', '5'])).toBe(true);
      expect('error' in parseCommand(['set-bpm', '1000'])).toBe(true);
    });

    it('parses add-track with type and optional name', () => {
      expect(parseCommand(['add-track', 'stems'])).toEqual({
        tool: 'daw_add_track',
        params: { type: 'stems' },
      });
      expect(parseCommand(['add-track', 'pianoroll', 'My', 'Piano'])).toEqual({
        tool: 'daw_add_track',
        params: { type: 'pianoroll', name: 'My Piano' },
      });
    });

    it('rejects add-track with invalid type', () => {
      expect('error' in parseCommand(['add-track', 'bogus'])).toBe(true);
    });

    it('parses delete-track', () => {
      expect(parseCommand(['delete-track', 'track-1'])).toEqual({
        tool: 'daw_delete_track',
        params: { trackId: 'track-1' },
      });
    });

    it('parses volume', () => {
      expect(parseCommand(['volume', 'track-1', '0.8'])).toEqual({
        tool: 'daw_set_volume',
        params: { trackId: 'track-1', volume: 0.8 },
      });
    });

    it('parses pan', () => {
      expect(parseCommand(['pan', 'track-1', '-0.5'])).toEqual({
        tool: 'daw_set_pan',
        params: { trackId: 'track-1', pan: -0.5 },
      });
    });

    it('parses mute/solo', () => {
      expect(parseCommand(['mute', 'track-1'])).toEqual({
        tool: 'daw_toggle_mute',
        params: { trackId: 'track-1' },
      });
      expect(parseCommand(['solo', 'track-1'])).toEqual({
        tool: 'daw_toggle_solo',
        params: { trackId: 'track-1' },
      });
    });

    it('parses generate with trackId and prompt', () => {
      expect(parseCommand(['generate', 'track-1', 'a', 'lofi', 'beat'])).toEqual({
        tool: 'daw_generate',
        params: { trackId: 'track-1', prompt: 'a lofi beat' },
      });
    });

    it('rejects generate without prompt', () => {
      expect('error' in parseCommand(['generate', 'track-1'])).toBe(true);
    });

    it('parses midi note', () => {
      expect(parseCommand(['midi', 'clip-1', '60', '0', '1'])).toEqual({
        tool: 'daw_add_midi_note',
        params: { clipId: 'clip-1', pitch: 60, startBeat: 0, durationBeats: 1 },
      });
    });

    it('parses midi note with velocity', () => {
      expect(parseCommand(['midi', 'clip-1', '60', '0', '1', '100'])).toEqual({
        tool: 'daw_add_midi_note',
        params: { clipId: 'clip-1', pitch: 60, startBeat: 0, durationBeats: 1, velocity: 100 },
      });
    });

    it('parses step toggle', () => {
      expect(parseCommand(['step', 'track-1', 'kick', '3'])).toEqual({
        tool: 'daw_toggle_step',
        params: { trackId: 'track-1', rowId: 'kick', stepIndex: 3 },
      });
    });

    it('returns error for unknown command', () => {
      const result = parseCommand(['bogus']);
      expect('error' in result).toBe(true);
      expect((result as { error: string }).error).toContain('Unknown command');
    });

    it('returns error for empty args', () => {
      const result = parseCommand([]);
      expect('error' in result).toBe(true);
    });
  });

  describe('formatPan', () => {
    it('formats center', () => {
      expect(formatPan(0)).toBe('C');
      expect(formatPan(0.02)).toBe('C');
      expect(formatPan(-0.03)).toBe('C');
    });

    it('formats left', () => {
      expect(formatPan(-0.5)).toBe('L.5');
      expect(formatPan(-1)).toBe('L1.0');
    });

    it('formats right', () => {
      expect(formatPan(0.3)).toBe('R.3');
      expect(formatPan(1)).toBe('R1.0');
    });
  });

  describe('formatTime', () => {
    it('formats seconds to M:SS', () => {
      expect(formatTime(0)).toBe('0:00');
      expect(formatTime(65)).toBe('1:05');
      expect(formatTime(130)).toBe('2:10');
    });
  });

  describe('formatStatus', () => {
    it('formats project summary', () => {
      const data = {
        name: 'My Song',
        bpm: 128,
        timeSignature: '4/4',
        tracks: [
          { name: 'Drums', type: 'sequencer', clips: [1, 2], volume: 0.8, pan: 0, muted: false, soloed: false },
          { name: 'Bass', type: 'pianoroll', clips: [1], volume: 0.7, pan: -0.1, muted: true, soloed: false },
        ],
      };
      const output = formatStatus(data);
      expect(output).toContain('My Song');
      expect(output).toContain('128bpm');
      expect(output).toContain('Drums');
      expect(output).toContain('Bass');
      expect(output).toContain('MUTED');
      expect(output).toContain('2clips');
    });
  });

  describe('formatMixer', () => {
    it('formats mixer table', () => {
      const data = {
        tracks: [
          { name: 'Drums', volume: 0.8, pan: 0, muted: false, soloed: false },
          { name: 'Bass', volume: 0.7, pan: -0.5, muted: true, soloed: false },
        ],
      };
      const output = formatMixer(data);
      expect(output).toContain('Track');
      expect(output).toContain('Drums');
      expect(output).toContain('0.80');
      expect(output).toContain('Bass');
      expect(output).toContain('M');
    });

    it('handles empty tracks', () => {
      expect(formatMixer({ tracks: [] })).toBe('No tracks');
    });
  });

  describe('formatTransport', () => {
    it('formats playing state', () => {
      const output = formatTransport({ isPlaying: true, currentTime: 65, loopEnabled: true });
      expect(output).toContain('▶ playing');
      expect(output).toContain('1:05');
      expect(output).toContain('loop on');
    });

    it('formats stopped state', () => {
      const output = formatTransport({ isPlaying: false, currentTime: 0, loopEnabled: false });
      expect(output).toContain('■ stopped');
      expect(output).toContain('loop off');
    });
  });

  describe('formatResult', () => {
    it('formats project result', () => {
      const output = formatResult('daw_get_project', { name: 'Test', bpm: 120, timeSignature: '4/4', tracks: [] });
      expect(output).toContain('Test');
      expect(output).toContain('120bpm');
    });

    it('formats write operation success', () => {
      const output = formatResult('daw_set_bpm', { success: true, message: 'BPM set to 140' });
      expect(output).toContain('✓');
      expect(output).toContain('BPM set to 140');
    });

    it('passes through string results', () => {
      expect(formatResult('unknown', 'hello')).toBe('hello');
    });
  });
});
