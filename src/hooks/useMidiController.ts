/**
 * useMidiController — React hook that wires Web MIDI to DAW parameters.
 *
 * When enabled, this hook:
 * 1. Connects WebMidiService on mount
 * 2. Routes incoming MIDI messages through the mapping engine
 * 3. Applies mapped values to projectStore (track volume/pan/mute/solo),
 *    transportStore, and master volume
 * 4. Handles MIDI Learn mode (auto-completes mapping on CC/NoteOn input)
 *
 * Mount this once at the app root level (AppShell).
 */
import { useEffect, useRef } from 'react';
import { useProjectStore } from '../store/projectStore';
import { useMidiControllerStore } from '../store/midiControllerStore';
import { getWebMidiService, WebMidiService } from '../services/webMidiService';
import { getMidiMappingEngine, type ResolvedTarget } from '../services/midiMappingEngine';
import type { MidiMessage } from '../types/midiController';

function handleTrackParam(target: ResolvedTarget, value: number): void {
  const { trackId, param } = target;
  if (!trackId) return;

  const store = useProjectStore.getState();
  const project = store.project;
  if (!project) return;

  const track = project.tracks.find((t) => t.id === trackId);
  if (!track) return;

  switch (param) {
    case 'volume':
      store.updateTrack(trackId, { volume: Math.max(0, Math.min(1, value)) });
      break;
    case 'mute':
      // Toggle on any value > 0.5
      if (value > 0.5) {
        store.updateTrack(trackId, { muted: !track.muted });
      }
      break;
    case 'solo':
      if (value > 0.5) {
        store.updateTrack(trackId, { soloed: !track.soloed });
      }
      break;
    default:
      break;
  }
}

function handleMasterParam(_target: ResolvedTarget, value: number): void {
  const store = useProjectStore.getState();
  store.updateProject({ masterVolume: Math.max(0, Math.min(1, value)) });
}

function handleTransportParam(target: ResolvedTarget, value: number): void {
  if (target.param === 'bpm') {
    const bpm = Math.round(Math.max(20, Math.min(300, value)));
    useProjectStore.getState().updateProject({ bpm });
  }
}

export function useMidiController(): void {
  const enabled = useMidiControllerStore((s) => s.enabled);
  const connectedRef = useRef(false);

  useEffect(() => {
    if (!enabled || !WebMidiService.isSupported()) return;

    const service = getWebMidiService();
    const engine = getMidiMappingEngine();

    // Register scope handlers
    engine.registerHandler('track', handleTrackParam);
    engine.registerHandler('master', handleMasterParam);
    engine.registerHandler('transport', handleTransportParam);

    // Connect if not already connected
    if (!connectedRef.current) {
      service.connect()
        .then((devices) => {
          useMidiControllerStore.getState().setDevices(devices);
          connectedRef.current = true;
        })
        .catch(() => {
          // Silently fail — panel will show error if user opens it
        });
    }

    // Subscribe to device changes
    const unsubDevices = service.onDeviceChange((devices) => {
      useMidiControllerStore.getState().setDevices(devices);
    });

    // Subscribe to MIDI messages
    const unsubMessages = service.onMessage((msg: MidiMessage) => {
      const store = useMidiControllerStore.getState();

      // Update activity indicator
      store.setLastActivity(msg);

      // Handle MIDI Learn mode
      if (store.learnMode.active && (msg.type === 'cc' || msg.type === 'noteOn')) {
        const controlType = msg.type === 'cc' ? 'cc' : 'note';
        const device = store.devices.find((d) => d.id === msg.deviceId);
        store.completeLearnMode(
          msg.deviceId,
          device?.name ?? 'Unknown',
          msg.channel,
          controlType,
          msg.control,
        );
        return; // Don't process as regular input during learn
      }

      // Route through mapping engine
      if (msg.type === 'cc' || msg.type === 'noteOn' || msg.type === 'pitchBend') {
        const controlType = msg.type === 'pitchBend' ? 'pitchBend' : msg.type === 'cc' ? 'cc' : 'note';
        const mapping = store.findMapping(msg.deviceId, msg.channel, controlType, msg.control);
        if (mapping) {
          engine.processMessage(msg, mapping);
        }
      }
    });

    return () => {
      unsubDevices();
      unsubMessages();
      engine.removeHandler('track');
      engine.removeHandler('master');
      engine.removeHandler('transport');
    };
  }, [enabled]);
}
