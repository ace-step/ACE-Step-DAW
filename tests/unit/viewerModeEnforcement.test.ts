import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '../../src/store/projectStore';
import { useCollaborationStore } from '../../src/store/collaborationStore';

// Helper: reset both stores before each test
function resetStores() {
  useCollaborationStore.getState().reset();
  useProjectStore.getState().createProject({ name: 'Viewer Test' });
}

describe('viewer mode enforcement', () => {
  beforeEach(() => {
    resetStores();
  });

  describe('when viewer mode is OFF, mutations work normally', () => {
    it('addTrack creates a track', () => {
      const track = useProjectStore.getState().addTrack('drums');
      expect(track).not.toBeUndefined();
      expect(track.trackName).toBe('drums');
      expect(useProjectStore.getState().project!.tracks.length).toBeGreaterThan(0);
    });

    it('updateProject changes the project name', () => {
      useProjectStore.getState().updateProject({ name: 'New Name' });
      expect(useProjectStore.getState().project!.name).toBe('New Name');
    });
  });

  describe('when viewer mode is ON, mutations are blocked', () => {
    beforeEach(() => {
      useCollaborationStore.getState().setViewerMode(true);
    });

    it('updateProject does not change project', () => {
      const nameBefore = useProjectStore.getState().project!.name;
      useProjectStore.getState().updateProject({ name: 'Hacked' });
      expect(useProjectStore.getState().project!.name).toBe(nameBefore);
    });

    it('updateTrackMixer does not change track', () => {
      // Temporarily disable viewer mode to add a track
      useCollaborationStore.getState().setViewerMode(false);
      const track = useProjectStore.getState().addTrack('drums');
      useCollaborationStore.getState().setViewerMode(true);

      useProjectStore.getState().updateTrackMixer(track.id, { pan: 0.75 });
      const updated = useProjectStore.getState().project!.tracks.find(t => t.id === track.id);
      expect(updated!.pan).not.toBe(0.75);
    });

    it('addTrack returns undefined-cast and does not add', () => {
      const trackCountBefore = useProjectStore.getState().project!.tracks.length;
      const result = useProjectStore.getState().addTrack('guitar');
      expect(result).toBeUndefined();
      expect(useProjectStore.getState().project!.tracks.length).toBe(trackCountBefore);
    });

    it('removeTrack does not remove', () => {
      useCollaborationStore.getState().setViewerMode(false);
      const track = useProjectStore.getState().addTrack('bass');
      useCollaborationStore.getState().setViewerMode(true);

      const countBefore = useProjectStore.getState().project!.tracks.length;
      useProjectStore.getState().removeTrack(track.id);
      expect(useProjectStore.getState().project!.tracks.length).toBe(countBefore);
    });

    it('duplicateTrack returns undefined', () => {
      useCollaborationStore.getState().setViewerMode(false);
      const track = useProjectStore.getState().addTrack('synth');
      useCollaborationStore.getState().setViewerMode(true);

      const result = useProjectStore.getState().duplicateTrack(track.id);
      expect(result).toBeUndefined();
    });

    it('updateTrack does not modify track', () => {
      useCollaborationStore.getState().setViewerMode(false);
      const track = useProjectStore.getState().addTrack('drums');
      useCollaborationStore.getState().setViewerMode(true);

      useProjectStore.getState().updateTrack(track.id, { displayName: 'Modified' });
      const found = useProjectStore.getState().project!.tracks.find(t => t.id === track.id);
      expect(found!.displayName).not.toBe('Modified');
    });

    it('addClip returns undefined-cast and does not add', () => {
      useCollaborationStore.getState().setViewerMode(false);
      const track = useProjectStore.getState().addTrack('vocals');
      useCollaborationStore.getState().setViewerMode(true);

      const clipsBefore = useProjectStore.getState().project!.tracks.find(t => t.id === track.id)!.clips.length;
      const result = useProjectStore.getState().addClip(track.id, {
        startTime: 0,
        duration: 4,
        prompt: 'test',
        lyrics: '',
      });
      expect(result).toBeUndefined();
      expect(useProjectStore.getState().project!.tracks.find(t => t.id === track.id)!.clips.length).toBe(clipsBefore);
    });

    it('updateClip does not change clip', () => {
      useCollaborationStore.getState().setViewerMode(false);
      const track = useProjectStore.getState().addTrack('vocals');
      const clip = useProjectStore.getState().addClip(track.id, {
        startTime: 0,
        duration: 4,
        prompt: 'original',
        lyrics: '',
      });
      useCollaborationStore.getState().setViewerMode(true);

      useProjectStore.getState().updateClip(clip.id, { prompt: 'modified' });
      const found = useProjectStore.getState().project!.tracks
        .flatMap(t => t.clips)
        .find(c => c.id === clip.id);
      expect(found!.prompt).toBe('original');
    });

    it('removeClip does not remove', () => {
      useCollaborationStore.getState().setViewerMode(false);
      const track = useProjectStore.getState().addTrack('vocals');
      const clip = useProjectStore.getState().addClip(track.id, {
        startTime: 0,
        duration: 4,
        prompt: 'keep',
        lyrics: '',
      });
      useCollaborationStore.getState().setViewerMode(true);

      useProjectStore.getState().removeClip(clip.id);
      const found = useProjectStore.getState().project!.tracks
        .flatMap(t => t.clips)
        .find(c => c.id === clip.id);
      expect(found).not.toBeUndefined();
    });

    it('duplicateClip returns undefined', () => {
      useCollaborationStore.getState().setViewerMode(false);
      const track = useProjectStore.getState().addTrack('vocals');
      const clip = useProjectStore.getState().addClip(track.id, {
        startTime: 0,
        duration: 4,
        prompt: 'dup',
        lyrics: '',
      });
      useCollaborationStore.getState().setViewerMode(true);

      const result = useProjectStore.getState().duplicateClip(clip.id);
      expect(result).toBeUndefined();
    });

    it('toggleSequencerStep does not toggle', () => {
      useCollaborationStore.getState().setViewerMode(false);
      const track = useProjectStore.getState().addTrack('drums', 'sequencer');
      const pattern = useProjectStore.getState().project!.tracks.find(t => t.id === track.id)?.sequencerPattern;
      if (!pattern || pattern.rows.length === 0) return; // skip if no pattern

      const rowId = pattern.rows[0].id;
      const stepBefore = pattern.rows[0].steps[0].active;
      useCollaborationStore.getState().setViewerMode(true);

      useProjectStore.getState().toggleSequencerStep(track.id, rowId, 0);
      const stepAfter = useProjectStore.getState().project!.tracks
        .find(t => t.id === track.id)?.sequencerPattern?.rows[0].steps[0].active;
      expect(stepAfter).toBe(stepBefore);
    });

    it('addMidiNote returns undefined', () => {
      useCollaborationStore.getState().setViewerMode(false);
      const track = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
      const clip = useProjectStore.getState().addClip(track.id, {
        startTime: 0,
        duration: 4,
        prompt: '',
        lyrics: '',
        midiData: { notes: [], grid: '1/16' },
      });
      useCollaborationStore.getState().setViewerMode(true);

      const result = useProjectStore.getState().addMidiNote(clip.id, {
        pitch: 60,
        startBeat: 0,
        durationBeats: 1,
        velocity: 0.8,
      });
      expect(result).toBeUndefined();
    });

    it('updateMidiNote does not change note', () => {
      useCollaborationStore.getState().setViewerMode(false);
      const track = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
      const clip = useProjectStore.getState().addClip(track.id, {
        startTime: 0,
        duration: 4,
        prompt: '',
        lyrics: '',
        midiData: { notes: [], grid: '1/16' },
      });
      const noteId = useProjectStore.getState().addMidiNote(clip.id, {
        pitch: 60,
        startBeat: 0,
        durationBeats: 1,
        velocity: 0.8,
      })!;
      useCollaborationStore.getState().setViewerMode(true);

      useProjectStore.getState().updateMidiNote(clip.id, noteId, { pitch: 72 });
      const notes = useProjectStore.getState().project!.tracks
        .flatMap(t => t.clips)
        .find(c => c.id === clip.id)?.midiData?.notes;
      expect(notes?.find(n => n.id === noteId)?.pitch).toBe(60);
    });

    it('removeMidiNote does not remove', () => {
      useCollaborationStore.getState().setViewerMode(false);
      const track = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
      const clip = useProjectStore.getState().addClip(track.id, {
        startTime: 0,
        duration: 4,
        prompt: '',
        lyrics: '',
        midiData: { notes: [], grid: '1/16' },
      });
      const noteId = useProjectStore.getState().addMidiNote(clip.id, {
        pitch: 60,
        startBeat: 0,
        durationBeats: 1,
        velocity: 0.8,
      })!;
      useCollaborationStore.getState().setViewerMode(true);

      useProjectStore.getState().removeMidiNote(clip.id, noteId);
      const notes = useProjectStore.getState().project!.tracks
        .flatMap(t => t.clips)
        .find(c => c.id === clip.id)?.midiData?.notes;
      expect(notes?.find(n => n.id === noteId)).not.toBeUndefined();
    });
  });

  describe('read-only state access still works in viewer mode', () => {
    it('project state is readable', () => {
      useCollaborationStore.getState().setViewerMode(true);
      const project = useProjectStore.getState().project;
      expect(project).not.toBeUndefined();
      expect(typeof project!.name).toBe('string');
    });

    it('tracks are readable', () => {
      useCollaborationStore.getState().setViewerMode(false);
      useProjectStore.getState().addTrack('drums');
      useCollaborationStore.getState().setViewerMode(true);

      const tracks = useProjectStore.getState().project!.tracks;
      expect(tracks.length).toBeGreaterThan(0);
    });
  });
});
