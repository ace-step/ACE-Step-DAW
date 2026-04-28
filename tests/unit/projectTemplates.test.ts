import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '../../src/store/projectStore';
import type { ProjectTemplate } from '../../src/types/project';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('project templates', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useProjectStore.getState().createProject({ name: 'Source Project', bpm: 140, keyScale: 'D minor', timeSignature: 3 });
  });

  describe('saveProjectAsTemplate', () => {
    it('creates a template from the current project with correct settings', () => {
      const template = useProjectStore.getState().saveProjectAsTemplate('My Template', 'A cool template');

      expect(template.name).toBe('My Template');
      expect(template.description).toBe('A cool template');
      expect(template.bpm).toBe(140);
      expect(template.keyScale).toBe('D minor');
      expect(template.timeSignature).toBe(3);
      expect(template.measures).toBe(128);
      expect(template.id.length).toBeGreaterThan(0);
      expect(template.createdAt).toBeGreaterThan(0);
    });

    it('captures track layout without clips', () => {
      const store = useProjectStore.getState();
      const track = store.addTrack('drums', 'sequencer');

      // Add a clip to the track
      store.addClip(track.id, {
        startTime: 0,
        duration: 4,
        prompt: 'test',
        lyrics: '',
      });

      const template = store.saveProjectAsTemplate('Template with tracks');

      expect(template.tracks).toHaveLength(1);
      expect(template.tracks[0].trackName).toBe('drums');
      expect(template.tracks[0].trackType).toBe('sequencer');
      expect(template.tracks[0].displayName.length).toBeGreaterThan(0);
      // Template tracks should NOT contain clips
      expect((template.tracks[0] as Record<string, unknown>).clips).toBeUndefined();
    });

    it('captures track effects and settings', () => {
      const store = useProjectStore.getState();
      const track = store.addTrack('bass', 'pianoRoll');
      store.updateTrack(track.id, { volume: 0.7 });
      store.addTrackEffect(track.id, 'reverb');

      const template = store.saveProjectAsTemplate('FX Template');

      expect(template.tracks[0].volume).toBe(0.7);
      expect(template.tracks[0].effects).toHaveLength(1);
      expect(template.tracks[0].effects![0].type).toBe('reverb');
    });

    it('throws when no project is loaded', () => {
      useProjectStore.setState({ project: null });
      expect(() => useProjectStore.getState().saveProjectAsTemplate('test')).toThrow('No project');
    });

    it('throws when name is empty', () => {
      expect(() => useProjectStore.getState().saveProjectAsTemplate('  ')).toThrow('Template name is required');
    });

    it('defaults description to empty string when not provided', () => {
      const template = useProjectStore.getState().saveProjectAsTemplate('No Desc');
      expect(template.description).toBe('');
    });

    it('captures generation defaults', () => {
      const template = useProjectStore.getState().saveProjectAsTemplate('Gen Defaults');
      expect(template.generationDefaults).not.toBeUndefined();
      expect(template.generationDefaults.inferenceSteps).toBeGreaterThan(0);
    });
  });

  describe('createProjectFromTemplate', () => {
    let template: ProjectTemplate;

    beforeEach(() => {
      const store = useProjectStore.getState();
      store.addTrack('drums', 'sequencer');
      store.addTrack('bass', 'pianoRoll');
      store.addTrack('vocals', 'stems');
      template = store.saveProjectAsTemplate('Session Template', 'For live sessions');
    });

    it('creates a new project with template settings', () => {
      useProjectStore.getState().createProjectFromTemplate(template);

      const project = useProjectStore.getState().project!;
      expect(project.bpm).toBe(140);
      expect(project.keyScale).toBe('D minor');
      expect(project.timeSignature).toBe(3);
      expect(project.measures).toBe(128);
      expect(project.name).toBe('Session Template');
    });

    it('allows overriding the project name', () => {
      useProjectStore.getState().createProjectFromTemplate(template, 'Custom Name');

      const project = useProjectStore.getState().project!;
      expect(project.name).toBe('Custom Name');
    });

    it('creates tracks matching template layout', () => {
      useProjectStore.getState().createProjectFromTemplate(template);

      const project = useProjectStore.getState().project!;
      expect(project.tracks).toHaveLength(3);
      expect(project.tracks[0].trackName).toBe('drums');
      expect(project.tracks[0].trackType).toBe('sequencer');
      expect(project.tracks[1].trackName).toBe('bass');
      expect(project.tracks[1].trackType).toBe('pianoRoll');
      expect(project.tracks[2].trackName).toBe('vocals');
      expect(project.tracks[2].trackType).toBe('stems');
    });

    it('assigns new unique IDs to tracks', () => {
      useProjectStore.getState().createProjectFromTemplate(template);

      const project = useProjectStore.getState().project!;
      const ids = project.tracks.map((t) => t.id);
      // All IDs unique
      expect(new Set(ids).size).toBe(ids.length);
      // Project ID is new
      expect(project.id).not.toBe('');
      expect(project.createdAt).toBeGreaterThan(0);
    });

    it('tracks start with empty clips', () => {
      useProjectStore.getState().createProjectFromTemplate(template);

      const project = useProjectStore.getState().project!;
      for (const track of project.tracks) {
        expect(track.clips).toHaveLength(0);
      }
    });

    it('preserves track colors and display names', () => {
      useProjectStore.getState().createProjectFromTemplate(template);

      const project = useProjectStore.getState().project!;
      for (let i = 0; i < template.tracks.length; i++) {
        expect(project.tracks[i].color).toBe(template.tracks[i].color);
        expect(project.tracks[i].displayName).toBe(template.tracks[i].displayName);
      }
    });

    it('deep-clones effects so mutations are independent', () => {
      // Create a fresh project with just an effect-bearing track
      useProjectStore.getState().createProject({ name: 'FX Project', bpm: 120 });
      const store = useProjectStore.getState();
      const trackWithEffect = store.addTrack('synth', 'pianoRoll');
      useProjectStore.getState().addTrackEffect(trackWithEffect.id, 'delay');

      const tmpl = useProjectStore.getState().saveProjectAsTemplate('FX Template');
      expect(tmpl.tracks).toHaveLength(1);
      expect(tmpl.tracks[0].effects).toHaveLength(1);

      useProjectStore.getState().createProjectFromTemplate(tmpl);

      const project = useProjectStore.getState().project!;
      expect(project.tracks[0].effects).toHaveLength(1);
      expect(project.tracks[0].effects![0].enabled).toBe(true);

      // Mutating the template effect should not affect the project
      tmpl.tracks[0].effects![0].enabled = false;
      const reloaded = useProjectStore.getState().project!;
      expect(reloaded.tracks[0].effects![0].enabled).toBe(true);
    });
  });
});
