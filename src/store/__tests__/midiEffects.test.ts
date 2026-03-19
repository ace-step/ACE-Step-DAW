import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../projectStore';
import type { MidiEffect } from '../../types/project';

vi.mock('../../services/projectStorage', () => ({ saveProject: vi.fn() }));

describe('MIDI effects', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject({ name: 'Test', bpm: 120 });
    useProjectStore.getState().addTrack('pianoRoll');
  });

  it('addMidiEffect appends a MIDI effect with correct defaults to a track', () => {
    const trackId = useProjectStore.getState().project!.tracks[0].id;

    const arpId = useProjectStore.getState().addMidiEffect(trackId, 'arpeggiator');
    const chordId = useProjectStore.getState().addMidiEffect(trackId, 'chord-gen');
    const scaleId = useProjectStore.getState().addMidiEffect(trackId, 'scale-lock');

    const track = useProjectStore.getState().project!.tracks.find((t) => t.id === trackId)!;
    expect(track.midiEffects).toHaveLength(3);

    const arp = track.midiEffects!.find((e) => e.id === arpId)!;
    expect(arp.type).toBe('arpeggiator');
    expect(arp.enabled).toBe(true);
    expect(arp.params).toEqual({ rate: '1/8', pattern: 'up', octaves: 1 });

    const chord = track.midiEffects!.find((e) => e.id === chordId)!;
    expect(chord.type).toBe('chord-gen');
    expect(chord.params).toEqual({ chordType: 'major', inversion: 0 });

    const scale = track.midiEffects!.find((e) => e.id === scaleId)!;
    expect(scale.type).toBe('scale-lock');
    expect(scale.params).toEqual({ root: 0, scale: 'major' });
  });

  it('removeMidiEffect removes a MIDI effect by id without affecting others', () => {
    const trackId = useProjectStore.getState().project!.tracks[0].id;

    const arpId = useProjectStore.getState().addMidiEffect(trackId, 'arpeggiator')!;
    const chordId = useProjectStore.getState().addMidiEffect(trackId, 'chord-gen')!;

    useProjectStore.getState().removeMidiEffect(trackId, arpId);

    const track = useProjectStore.getState().project!.tracks.find((t) => t.id === trackId)!;
    expect(track.midiEffects).toHaveLength(1);
    expect(track.midiEffects![0].id).toBe(chordId);
    expect(track.midiEffects![0].type).toBe('chord-gen');
  });

  it('updateMidiEffect updates params without changing type or id', () => {
    const trackId = useProjectStore.getState().project!.tracks[0].id;
    const arpId = useProjectStore.getState().addMidiEffect(trackId, 'arpeggiator')!;

    useProjectStore.getState().updateMidiEffect(trackId, arpId, {
      params: { rate: '1/16', pattern: 'down', octaves: 2 },
    } as Partial<MidiEffect>);

    const track = useProjectStore.getState().project!.tracks.find((t) => t.id === trackId)!;
    const arp = track.midiEffects!.find((e) => e.id === arpId)!;
    expect(arp.type).toBe('arpeggiator');
    expect(arp.id).toBe(arpId);
    expect(arp.params).toEqual({ rate: '1/16', pattern: 'down', octaves: 2 });
  });

  it('toggleMidiEffect flips the enabled flag', () => {
    const trackId = useProjectStore.getState().project!.tracks[0].id;
    const arpId = useProjectStore.getState().addMidiEffect(trackId, 'arpeggiator')!;

    // Initially enabled
    let track = useProjectStore.getState().project!.tracks.find((t) => t.id === trackId)!;
    expect(track.midiEffects![0].enabled).toBe(true);

    // Toggle off
    useProjectStore.getState().toggleMidiEffect(trackId, arpId);
    track = useProjectStore.getState().project!.tracks.find((t) => t.id === trackId)!;
    expect(track.midiEffects![0].enabled).toBe(false);

    // Toggle back on
    useProjectStore.getState().toggleMidiEffect(trackId, arpId);
    track = useProjectStore.getState().project!.tracks.find((t) => t.id === trackId)!;
    expect(track.midiEffects![0].enabled).toBe(true);
  });

  it('reorderMidiEffect moves an effect from one position to another', () => {
    const trackId = useProjectStore.getState().project!.tracks[0].id;
    const arpId = useProjectStore.getState().addMidiEffect(trackId, 'arpeggiator')!;
    const chordId = useProjectStore.getState().addMidiEffect(trackId, 'chord-gen')!;
    const scaleId = useProjectStore.getState().addMidiEffect(trackId, 'scale-lock')!;

    // Move arpeggiator (index 0) to index 2
    useProjectStore.getState().reorderMidiEffect(trackId, 0, 2);

    const track = useProjectStore.getState().project!.tracks.find((t) => t.id === trackId)!;
    expect(track.midiEffects!.map((e) => e.id)).toEqual([chordId, scaleId, arpId]);
  });

  it('reorderMidiEffect is no-op for out-of-bounds indices', () => {
    const trackId = useProjectStore.getState().project!.tracks[0].id;
    useProjectStore.getState().addMidiEffect(trackId, 'arpeggiator');

    // Out-of-bounds - should not throw or change anything
    useProjectStore.getState().reorderMidiEffect(trackId, 0, 5);
    const track = useProjectStore.getState().project!.tracks.find((t) => t.id === trackId)!;
    expect(track.midiEffects).toHaveLength(1);
  });
});
