import { describe, it, expect, beforeEach } from 'vitest';
import { useSessionStore } from '../sessionStore';

const TRACK_IDS = ['t1', 't2', 't3'];

describe('sessionStore', () => {
  beforeEach(() => {
    useSessionStore.setState({
      slots: [],
      scenes: [],
      sceneCount: 0,
      recordingToArrangement: false,
      recordedEvents: [],
    });
    useSessionStore.getState().clearMidiBuffer();
  });

  describe('initSession', () => {
    it('creates slots for each track × scene combination', () => {
      useSessionStore.getState().initSession(TRACK_IDS, 4);
      const state = useSessionStore.getState();
      expect(state.slots).toHaveLength(12); // 3 tracks × 4 scenes
      expect(state.sceneCount).toBe(4);
    });

    it('creates the correct number of scenes', () => {
      useSessionStore.getState().initSession(TRACK_IDS, 4);
      expect(useSessionStore.getState().scenes).toHaveLength(4);
    });

    it('names scenes sequentially', () => {
      useSessionStore.getState().initSession(TRACK_IDS, 3);
      const names = useSessionStore.getState().scenes.map((s) => s.name);
      expect(names).toEqual(['Scene 1', 'Scene 2', 'Scene 3']);
    });

    it('defaults to 8 scenes when no count is provided', () => {
      useSessionStore.getState().initSession(TRACK_IDS);
      expect(useSessionStore.getState().sceneCount).toBe(8);
      expect(useSessionStore.getState().scenes).toHaveLength(8);
    });

    it('creates slots with correct trackId and sceneIndex', () => {
      useSessionStore.getState().initSession(['t1', 't2'], 2);
      const slots = useSessionStore.getState().slots;
      // Scene 0: t1, t2; Scene 1: t1, t2
      expect(slots[0].trackId).toBe('t1');
      expect(slots[0].sceneIndex).toBe(0);
      expect(slots[1].trackId).toBe('t2');
      expect(slots[1].sceneIndex).toBe(0);
      expect(slots[2].trackId).toBe('t1');
      expect(slots[2].sceneIndex).toBe(1);
    });

    it('initializes all slots as stopped with no clip', () => {
      useSessionStore.getState().initSession(TRACK_IDS, 2);
      const slots = useSessionStore.getState().slots;
      for (const slot of slots) {
        expect(slot.state).toBe('stopped');
        expect(slot.clipId).toBeNull();
      }
    });

    it('clears recorded events on re-init', () => {
      useSessionStore.getState().recordSessionEvent({
        slotId: 's1', clipId: 'c1', trackId: 't1', action: 'launch', timestamp: 100,
      });
      useSessionStore.getState().initSession(TRACK_IDS, 2);
      expect(useSessionStore.getState().recordedEvents).toEqual([]);
    });
  });

  describe('slot operations', () => {
    beforeEach(() => {
      useSessionStore.getState().initSession(TRACK_IDS, 2);
    });

    it('assignClipToSlot assigns a clip id', () => {
      const slotId = useSessionStore.getState().slots[0].id;
      useSessionStore.getState().assignClipToSlot(slotId, 'clip-1');
      expect(useSessionStore.getState().slots[0].clipId).toBe('clip-1');
    });

    it('clearSlot removes the clip and stops the slot', () => {
      const slotId = useSessionStore.getState().slots[0].id;
      useSessionStore.getState().assignClipToSlot(slotId, 'clip-1');
      useSessionStore.getState().launchSlot(slotId);
      useSessionStore.getState().clearSlot(slotId);
      const slot = useSessionStore.getState().slots[0];
      expect(slot.clipId).toBeNull();
      expect(slot.state).toBe('stopped');
    });

    it('launchSlot sets slot to playing', () => {
      const slotId = useSessionStore.getState().slots[0].id;
      useSessionStore.getState().assignClipToSlot(slotId, 'clip-1');
      useSessionStore.getState().launchSlot(slotId);
      expect(useSessionStore.getState().slots[0].state).toBe('playing');
    });

    it('launchSlot is a no-op when no clip is assigned', () => {
      const slotId = useSessionStore.getState().slots[0].id;
      useSessionStore.getState().launchSlot(slotId);
      expect(useSessionStore.getState().slots[0].state).toBe('stopped');
    });

    it('launchSlot stops other playing slots on the same track', () => {
      const slots = useSessionStore.getState().slots;
      // Find two slots for the same track (t1) in different scenes
      const t1Slots = slots.filter((s) => s.trackId === 't1');
      useSessionStore.getState().assignClipToSlot(t1Slots[0].id, 'clip-1');
      useSessionStore.getState().assignClipToSlot(t1Slots[1].id, 'clip-2');

      useSessionStore.getState().launchSlot(t1Slots[0].id);
      expect(useSessionStore.getState().slots.find((s) => s.id === t1Slots[0].id)!.state).toBe('playing');

      useSessionStore.getState().launchSlot(t1Slots[1].id);
      expect(useSessionStore.getState().slots.find((s) => s.id === t1Slots[0].id)!.state).toBe('stopped');
      expect(useSessionStore.getState().slots.find((s) => s.id === t1Slots[1].id)!.state).toBe('playing');
    });

    it('stopSlot sets slot to stopped', () => {
      const slotId = useSessionStore.getState().slots[0].id;
      useSessionStore.getState().assignClipToSlot(slotId, 'clip-1');
      useSessionStore.getState().launchSlot(slotId);
      useSessionStore.getState().stopSlot(slotId);
      expect(useSessionStore.getState().slots[0].state).toBe('stopped');
    });
  });

  describe('scene operations', () => {
    beforeEach(() => {
      useSessionStore.getState().initSession(TRACK_IDS, 3);
      // Assign clips to all slots in scene 0 and scene 1
      const slots = useSessionStore.getState().slots;
      slots.filter((s) => s.sceneIndex <= 1).forEach((s) => {
        useSessionStore.getState().assignClipToSlot(s.id, `clip-${s.id}`);
      });
    });

    it('launchScene plays all clips in that scene', () => {
      useSessionStore.getState().launchScene(0);
      const scene0Slots = useSessionStore.getState().slots.filter((s) => s.sceneIndex === 0);
      for (const slot of scene0Slots) {
        expect(slot.state).toBe('playing');
      }
    });

    it('launchScene stops playing slots in other scenes', () => {
      useSessionStore.getState().launchScene(0);
      useSessionStore.getState().launchScene(1);
      const scene0Slots = useSessionStore.getState().slots.filter((s) => s.sceneIndex === 0);
      for (const slot of scene0Slots) {
        expect(slot.state).toBe('stopped');
      }
    });

    it('launchScene does not play slots without clips', () => {
      useSessionStore.getState().launchScene(2); // Scene 2 has no clips
      const scene2Slots = useSessionStore.getState().slots.filter((s) => s.sceneIndex === 2);
      for (const slot of scene2Slots) {
        expect(slot.state).toBe('stopped');
      }
    });

    it('stopScene stops all slots in the scene', () => {
      useSessionStore.getState().launchScene(0);
      useSessionStore.getState().stopScene(0);
      const scene0Slots = useSessionStore.getState().slots.filter((s) => s.sceneIndex === 0);
      for (const slot of scene0Slots) {
        expect(slot.state).toBe('stopped');
      }
    });

    it('stopAll stops every slot', () => {
      useSessionStore.getState().launchScene(0);
      useSessionStore.getState().launchScene(1);
      useSessionStore.getState().stopAll();
      for (const slot of useSessionStore.getState().slots) {
        expect(slot.state).toBe('stopped');
      }
    });
  });

  describe('scene management', () => {
    beforeEach(() => {
      useSessionStore.getState().initSession(TRACK_IDS, 2);
    });

    it('renameScene changes the scene name', () => {
      const sceneId = useSessionStore.getState().scenes[0].id;
      useSessionStore.getState().renameScene(sceneId, 'Intro');
      expect(useSessionStore.getState().scenes[0].name).toBe('Intro');
    });

    it('updateSceneProperties updates partial scene data', () => {
      const sceneId = useSessionStore.getState().scenes[0].id;
      useSessionStore.getState().updateSceneProperties(sceneId, { tempo: 140 });
      expect(useSessionStore.getState().scenes[0].tempo).toBe(140);
    });

    it('updateSceneProperties is a no-op for unknown scene id', () => {
      const before = useSessionStore.getState().scenes;
      useSessionStore.getState().updateSceneProperties('nonexistent', { tempo: 999 });
      expect(useSessionStore.getState().scenes).toBe(before);
    });

    it('setSceneFollowAction sets follow action and time', () => {
      const sceneId = useSessionStore.getState().scenes[0].id;
      useSessionStore.getState().setSceneFollowAction(sceneId, 'next', 4);
      const scene = useSessionStore.getState().scenes[0];
      expect(scene.followAction).toBe('next');
      expect(scene.followActionTime).toBe(4);
    });

    it('setSceneFollowAction clears time when action is none', () => {
      const sceneId = useSessionStore.getState().scenes[0].id;
      useSessionStore.getState().setSceneFollowAction(sceneId, 'next', 4);
      useSessionStore.getState().setSceneFollowAction(sceneId, 'none');
      const scene = useSessionStore.getState().scenes[0];
      expect(scene.followAction).toBe('none');
      expect(scene.followActionTime).toBeUndefined();
    });

    it('setFollowActionConfig sets config with clamped chanceA', () => {
      const sceneId = useSessionStore.getState().scenes[0].id;
      useSessionStore.getState().setFollowActionConfig(sceneId, {
        actionA: 'next',
        actionB: 'stop',
        chanceA: 1.5, // Should be clamped to 1
        bars: 4,
      } as any);
      const config = useSessionStore.getState().scenes[0].followActionConfig;
      expect(config!.chanceA).toBe(1);
    });

    it('setFollowActionConfig clamps negative chanceA to 0', () => {
      const sceneId = useSessionStore.getState().scenes[0].id;
      useSessionStore.getState().setFollowActionConfig(sceneId, {
        actionA: 'next',
        actionB: 'stop',
        chanceA: -0.5,
        bars: 4,
      } as any);
      const config = useSessionStore.getState().scenes[0].followActionConfig;
      expect(config!.chanceA).toBe(0);
    });

    it('setFollowActionConfig is a no-op for unknown scene id', () => {
      const before = useSessionStore.getState().scenes;
      useSessionStore.getState().setFollowActionConfig('nonexistent', {
        actionA: 'next', actionB: 'stop', chanceA: 0.5, bars: 4,
      } as any);
      expect(useSessionStore.getState().scenes).toBe(before);
    });

    it('clearFollowActionConfig removes the config', () => {
      const sceneId = useSessionStore.getState().scenes[0].id;
      useSessionStore.getState().setFollowActionConfig(sceneId, {
        actionA: 'next', actionB: 'stop', chanceA: 0.5, bars: 4,
      } as any);
      useSessionStore.getState().clearFollowActionConfig(sceneId);
      expect(useSessionStore.getState().scenes[0].followActionConfig).toBeUndefined();
    });

    it('addScene adds a new scene and slots', () => {
      useSessionStore.getState().addScene(TRACK_IDS);
      const state = useSessionStore.getState();
      expect(state.scenes).toHaveLength(3);
      expect(state.sceneCount).toBe(3);
      expect(state.scenes[2].name).toBe('Scene 3');
      const newSlots = state.slots.filter((s) => s.sceneIndex === 2);
      expect(newSlots).toHaveLength(3);
    });
  });

  describe('arrangement recording', () => {
    it('setRecordingToArrangement toggles the flag', () => {
      useSessionStore.getState().setRecordingToArrangement(true);
      expect(useSessionStore.getState().recordingToArrangement).toBe(true);
    });

    it('recordSessionEvent appends an event', () => {
      const event = { slotId: 's1', clipId: 'c1', trackId: 't1', action: 'launch' as const, timestamp: 100 };
      useSessionStore.getState().recordSessionEvent(event);
      expect(useSessionStore.getState().recordedEvents).toHaveLength(1);
      expect(useSessionStore.getState().recordedEvents[0]).toEqual(event);
    });

    it('records multiple events in order', () => {
      useSessionStore.getState().recordSessionEvent({
        slotId: 's1', clipId: 'c1', trackId: 't1', action: 'launch', timestamp: 100,
      });
      useSessionStore.getState().recordSessionEvent({
        slotId: 's1', clipId: 'c1', trackId: 't1', action: 'stop', timestamp: 200,
      });
      const events = useSessionStore.getState().recordedEvents;
      expect(events).toHaveLength(2);
      expect(events[0].action).toBe('launch');
      expect(events[1].action).toBe('stop');
    });

    it('clearRecordedEvents empties the list', () => {
      useSessionStore.getState().recordSessionEvent({
        slotId: 's1', clipId: 'c1', trackId: 't1', action: 'launch', timestamp: 100,
      });
      useSessionStore.getState().clearRecordedEvents();
      expect(useSessionStore.getState().recordedEvents).toEqual([]);
    });
  });

  describe('MIDI capture', () => {
    it('captures note on/off events', () => {
      const store = useSessionStore.getState();
      store.midiNoteOn(60, 100, 0);
      store.midiNoteOff(60, 0.5);
      const captured = useSessionStore.getState().captureMidi();
      expect(captured.length).toBeGreaterThanOrEqual(1);
    });

    it('clearMidiBuffer empties the capture buffer', () => {
      const store = useSessionStore.getState();
      store.midiNoteOn(60, 100, 0);
      store.midiNoteOff(60, 0.5);
      store.clearMidiBuffer();
      const captured = useSessionStore.getState().captureMidi();
      expect(captured).toHaveLength(0);
    });
  });
});
