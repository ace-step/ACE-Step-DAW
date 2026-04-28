import { describe, it, expect, beforeEach } from 'vitest';
import { useMidiControllerStore } from '../midiControllerStore';
import type { MidiDevice, MidiMapping } from '../../types/midiController';

function resetStore() {
  localStorage.removeItem('ace-step-daw-midi-controller');
  useMidiControllerStore.setState(useMidiControllerStore.getInitialState());
}

const device1: MidiDevice = {
  id: 'dev-1',
  name: 'Keyboard A',
  manufacturer: 'Yamaha',
  state: 'connected',
};

const device2: MidiDevice = {
  id: 'dev-2',
  name: 'Pad B',
  manufacturer: 'Akai',
  state: 'connected',
};

function makeMapping(overrides: Partial<MidiMapping> = {}): MidiMapping {
  return {
    id: 'map-1',
    deviceId: 'dev-1',
    deviceName: 'Keyboard A',
    channel: 0,
    controlType: 'cc',
    controlNumber: 7,
    targetParam: 'track:t1:volume',
    targetLabel: 'Track 1 Volume',
    min: 0,
    max: 1,
    ...overrides,
  };
}

describe('midiControllerStore', () => {
  beforeEach(resetStore);

  describe('device management', () => {
    it('starts with no devices', () => {
      expect(useMidiControllerStore.getState().devices).toEqual([]);
    });

    it('sets devices list', () => {
      useMidiControllerStore.getState().setDevices([device1, device2]);
      expect(useMidiControllerStore.getState().devices).toHaveLength(2);
      expect(useMidiControllerStore.getState().devices[0].name).toBe('Keyboard A');
    });

    it('updates device state', () => {
      useMidiControllerStore.getState().setDevices([device1]);
      useMidiControllerStore.getState().updateDeviceState('dev-1', 'disconnected');
      expect(useMidiControllerStore.getState().devices[0].state).toBe('disconnected');
    });

    it('ignores updateDeviceState for unknown device', () => {
      useMidiControllerStore.getState().setDevices([device1]);
      useMidiControllerStore.getState().updateDeviceState('unknown', 'disconnected');
      expect(useMidiControllerStore.getState().devices[0].state).toBe('connected');
    });
  });

  describe('mapping management', () => {
    it('starts with no mappings', () => {
      expect(useMidiControllerStore.getState().mappings).toEqual([]);
    });

    it('adds a mapping', () => {
      const mapping = makeMapping();
      useMidiControllerStore.getState().addMapping(mapping);
      expect(useMidiControllerStore.getState().mappings).toHaveLength(1);
      expect(useMidiControllerStore.getState().mappings[0].targetParam).toBe('track:t1:volume');
    });

    it('removes a mapping by id', () => {
      useMidiControllerStore.getState().addMapping(makeMapping({ id: 'map-1' }));
      useMidiControllerStore.getState().addMapping(makeMapping({ id: 'map-2', controlNumber: 10 }));
      useMidiControllerStore.getState().removeMapping('map-1');
      expect(useMidiControllerStore.getState().mappings).toHaveLength(1);
      expect(useMidiControllerStore.getState().mappings[0].id).toBe('map-2');
    });

    it('updates an existing mapping', () => {
      useMidiControllerStore.getState().addMapping(makeMapping({ id: 'map-1' }));
      useMidiControllerStore.getState().updateMapping('map-1', { min: 0.2, max: 0.8 });
      const updated = useMidiControllerStore.getState().mappings[0];
      expect(updated.min).toBe(0.2);
      expect(updated.max).toBe(0.8);
    });

    it('clears all mappings', () => {
      useMidiControllerStore.getState().addMapping(makeMapping({ id: 'map-1' }));
      useMidiControllerStore.getState().addMapping(makeMapping({ id: 'map-2' }));
      useMidiControllerStore.getState().clearAllMappings();
      expect(useMidiControllerStore.getState().mappings).toEqual([]);
    });

    it('finds mapping by MIDI input (device+channel+control)', () => {
      const mapping = makeMapping({ deviceId: 'dev-1', channel: 0, controlType: 'cc', controlNumber: 7 });
      useMidiControllerStore.getState().addMapping(mapping);
      const found = useMidiControllerStore.getState().findMapping('dev-1', 0, 'cc', 7);
      expect(found).toBeDefined();
      expect(found?.targetParam).toBe('track:t1:volume');
    });

    it('returns undefined for unmatched MIDI input', () => {
      useMidiControllerStore.getState().addMapping(makeMapping());
      const found = useMidiControllerStore.getState().findMapping('dev-1', 0, 'cc', 99);
      expect(found).toBeUndefined();
    });

    it('prevents duplicate mappings for same device+channel+control+type', () => {
      const m1 = makeMapping({ id: 'map-1' });
      const m2 = makeMapping({ id: 'map-2', targetParam: 'track:t2:pan' });
      useMidiControllerStore.getState().addMapping(m1);
      useMidiControllerStore.getState().addMapping(m2);
      // Second mapping should replace the first
      expect(useMidiControllerStore.getState().mappings).toHaveLength(1);
      expect(useMidiControllerStore.getState().mappings[0].targetParam).toBe('track:t2:pan');
    });
  });

  describe('MIDI Learn mode', () => {
    it('starts with learn mode inactive', () => {
      const state = useMidiControllerStore.getState();
      expect(state.learnMode.active).toBe(false);
      expect(state.learnMode.targetParam).toBeNull();
    });

    it('activates learn mode for a target parameter', () => {
      useMidiControllerStore.getState().startLearnMode('track:t1:volume', 'Track 1 Volume');
      const state = useMidiControllerStore.getState();
      expect(state.learnMode.active).toBe(true);
      expect(state.learnMode.targetParam).toBe('track:t1:volume');
      expect(state.learnMode.targetLabel).toBe('Track 1 Volume');
    });

    it('cancels learn mode', () => {
      useMidiControllerStore.getState().startLearnMode('track:t1:volume', 'Track 1 Volume');
      useMidiControllerStore.getState().cancelLearnMode();
      expect(useMidiControllerStore.getState().learnMode.active).toBe(false);
      expect(useMidiControllerStore.getState().learnMode.targetParam).toBeNull();
    });

    it('completeLearnMode creates mapping and deactivates learn', () => {
      useMidiControllerStore.getState().startLearnMode('track:t1:volume', 'Track 1 Volume');
      useMidiControllerStore.getState().completeLearnMode('dev-1', 'Keyboard', 0, 'cc', 7);
      const state = useMidiControllerStore.getState();
      expect(state.learnMode.active).toBe(false);
      expect(state.mappings).toHaveLength(1);
      expect(state.mappings[0].targetParam).toBe('track:t1:volume');
      expect(state.mappings[0].controlNumber).toBe(7);
    });

    it('completeLearnMode does nothing when learn is not active', () => {
      useMidiControllerStore.getState().completeLearnMode('dev-1', 'Keyboard', 0, 'cc', 7);
      expect(useMidiControllerStore.getState().mappings).toEqual([]);
    });
  });

  describe('enabled state', () => {
    it('starts disabled by default (no auto-connect)', () => {
      expect(useMidiControllerStore.getState().enabled).toBe(false);
    });

    it('can be toggled', () => {
      useMidiControllerStore.getState().setEnabled(false);
      expect(useMidiControllerStore.getState().enabled).toBe(false);
      useMidiControllerStore.getState().setEnabled(true);
      expect(useMidiControllerStore.getState().enabled).toBe(true);
    });
  });

  describe('last activity tracking', () => {
    it('starts with no last activity', () => {
      expect(useMidiControllerStore.getState().lastActivity).toBeNull();
    });

    it('records last MIDI activity', () => {
      useMidiControllerStore.getState().setLastActivity({
        deviceId: 'dev-1',
        channel: 0,
        type: 'cc',
        control: 7,
        value: 100,
        timestamp: 12345,
      });
      expect(useMidiControllerStore.getState().lastActivity).toBeDefined();
      expect(useMidiControllerStore.getState().lastActivity?.control).toBe(7);
    });
  });

  describe('import/export', () => {
    it('exports mappings as preset', () => {
      useMidiControllerStore.getState().addMapping(makeMapping({ id: 'map-1' }));
      const preset = useMidiControllerStore.getState().exportMappings('My Preset');
      expect(preset.version).toBe(1);
      expect(preset.name).toBe('My Preset');
      expect(preset.mappings).toHaveLength(1);
      expect(preset.exportedAt).toBeTruthy();
    });

    it('imports mappings from preset, replacing existing', () => {
      useMidiControllerStore.getState().addMapping(makeMapping({ id: 'existing' }));
      const preset = {
        version: 1,
        name: 'Imported',
        mappings: [makeMapping({ id: 'imported-1' }), makeMapping({ id: 'imported-2', controlNumber: 10 })],
        exportedAt: new Date().toISOString(),
      };
      useMidiControllerStore.getState().importMappings(preset);
      expect(useMidiControllerStore.getState().mappings).toHaveLength(2);
      expect(useMidiControllerStore.getState().mappings[0].id).toBe('imported-1');
    });

    it('rejects invalid import payloads and deduplicates mappings by MIDI input', () => {
      const preset = {
        version: 1,
        name: 'Imported',
        mappings: [
          makeMapping({ id: 'valid-1' }),
          makeMapping({ id: 'duplicate-input', targetParam: 'track:t2:volume' }),
          { id: 'bad-control-type', controlType: 'sysex', targetParam: 'track:t3:volume' },
          { id: 'bad-device', deviceName: 'Controller', channel: 0, controlType: 'cc', controlNumber: 10 },
        ],
        exportedAt: new Date().toISOString(),
      };

      useMidiControllerStore.getState().importMappings(preset as never);

      const mappings = useMidiControllerStore.getState().mappings;
      expect(mappings).toHaveLength(1);
      expect(mappings[0].id).toBe('valid-1');
    });
  });
});
