import { describe, expect, it } from 'vitest';
import { generateProjectSummary, generateProjectStructure } from '../../src/utils/dawStateSummary';
import { useProjectStore } from '../../src/store/projectStore';

describe('DAW State Summary', () => {
  describe('generateProjectSummary', () => {
    it('returns "No project loaded" for null', () => {
      expect(generateProjectSummary(null)).toBe('No project loaded.');
    });

    it('generates summary for empty project', () => {
      useProjectStore.getState().createProject({ name: 'Test Song', bpm: 140 });
      const summary = generateProjectSummary(useProjectStore.getState().project);
      expect(summary).toContain('Test Song');
      expect(summary).toContain('140 BPM');
      expect(summary).toContain('0 tracks');
    });

    it('includes track info with clips', () => {
      useProjectStore.getState().createProject({ name: 'With Tracks' });
      const track = useProjectStore.getState().addTrack('drums');
      useProjectStore.getState().addClip(track.id, {
        startTime: 0, duration: 30, prompt: 'funky beat', lyrics: '',
      });
      const summary = generateProjectSummary(useProjectStore.getState().project);
      expect(summary).toContain('Drums');
      expect(summary).toContain('1 tracks');
      expect(summary).toContain('funky beat');
    });

    it('shows muted/solo/armed status', () => {
      useProjectStore.getState().createProject();
      const track = useProjectStore.getState().addTrack('bass');
      useProjectStore.getState().updateTrack(track.id, { muted: true });
      const summary = generateProjectSummary(useProjectStore.getState().project);
      expect(summary).toContain('[MUTED]');
    });

    it('shows MIDI clip note count', () => {
      useProjectStore.getState().createProject();
      const track = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
      const clip = useProjectStore.getState().ensureMidiClip(track.id);
      useProjectStore.getState().addMidiNote(clip.id, { pitch: 60, startBeat: 0, durationBeats: 1, velocity: 100 });
      useProjectStore.getState().addMidiNote(clip.id, { pitch: 64, startBeat: 1, durationBeats: 1, velocity: 80 });
      const summary = generateProjectSummary(useProjectStore.getState().project);
      expect(summary).toContain('MIDI(2 notes)');
    });
  });

  describe('generateProjectStructure', () => {
    it('returns null for null project', () => {
      expect(generateProjectStructure(null)).toBeNull();
    });

    it('returns structured data for project', () => {
      useProjectStore.getState().createProject({ name: 'Structured', bpm: 128 });
      useProjectStore.getState().addTrack('drums');
      const result = generateProjectStructure(useProjectStore.getState().project) as any;
      expect(result.name).toBe('Structured');
      expect(result.bpm).toBe(128);
      expect(result.trackCount).toBe(1);
      expect(result.tracks[0].name).toBe('Drums');
    });
  });
});
