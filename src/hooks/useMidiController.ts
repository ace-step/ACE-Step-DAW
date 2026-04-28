/**
 * useMidiController — React hook that wires Web MIDI to DAW parameters.
 *
 * When enabled, this hook:
 * 1. Connects WebMidiService on mount
 * 2. Routes incoming MIDI messages through the mapping engine
 * 3. Applies mapped values to projectStore (track volume/mute/solo),
 *    transportStore, and master volume
 * 4. Handles MIDI Learn mode (auto-completes mapping on CC/NoteOn input)
 *
 * Mount this once in the editor shell.
 */
import { useEffect } from 'react';
import { useProjectStore } from '../store/projectStore';
import { useMidiControllerStore } from '../store/midiControllerStore';
import { getWebMidiService, WebMidiService } from '../services/webMidiService';
import { getMidiMappingEngine, type ResolvedTarget } from '../services/midiMappingEngine';
import type { MidiMessage } from '../types/midiController';

const toggleGateState = new Map<string, boolean>();

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
      toggleTrackBooleanParam(trackId, 'mute', value, () => {
        store.updateTrack(trackId, { muted: !track.muted });
      });
      break;
    case 'solo':
      toggleTrackBooleanParam(trackId, 'solo', value, () => {
        store.updateTrack(trackId, { soloed: !track.soloed });
      });
      break;
    default:
      break;
  }
}

function toggleTrackBooleanParam(trackId: string, param: 'mute' | 'solo', value: number, applyToggle: () => void): void {
  const key = `${trackId}:${param}`;
  const gateActive = value > 0.5;
  const wasActive = toggleGateState.get(key) ?? false;

  if (!gateActive) {
    toggleGateState.set(key, false);
    return;
  }

  if (wasActive) return;
  toggleGateState.set(key, true);
  applyToggle();
}

function handleMasterParam(target: ResolvedTarget, value: number): void {
  if (target.param !== 'volume') return;
  const store = useProjectStore.getState();
  store.updateProject({ masterVolume: Math.max(0, Math.min(1, value)) });
}

function handleTransportParam(target: ResolvedTarget, value: number): void {
  if (target.param === 'bpm') {
    const bpm = Math.round(Math.max(20, Math.min(300, value)));
    useProjectStore.getState().updateProject({ bpm });
  }
}

function isToggleMappingTarget(targetParam: string): boolean {
  const parts = targetParam.split(':');
  return parts[0] === 'track' && (parts[2] === 'mute' || parts[2] === 'solo');
}

export function useMidiController(): void {
  const enabled = useMidiControllerStore((s) => s.enabled);

  useEffect(() => {
    if (!enabled || !WebMidiService.isSupported()) return;

    const service = getWebMidiService();
    const engine = getMidiMappingEngine();
    let cancelled = false;
    toggleGateState.clear();

    // Register scope handlers
    engine.registerHandler('track', handleTrackParam);
    engine.registerHandler('master', handleMasterParam);
    engine.registerHandler('transport', handleTransportParam);

    // Connect (idempotent) and refresh device list
    useMidiControllerStore.getState().setConnectionError(null);
    service.connect()
      .then((devices) => {
        if (cancelled) {
          service.destroy();
          return;
        }
        useMidiControllerStore.getState().setDevices(devices);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'Failed to connect MIDI input';
        useMidiControllerStore.getState().setConnectionError(message);
      });

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
      if (msg.type === 'cc' || msg.type === 'noteOn' || msg.type === 'noteOff' || msg.type === 'pitchBend') {
        const controlType = msg.type === 'pitchBend' ? 'pitchBend' : msg.type === 'cc' ? 'cc' : 'note';
        const mapping = store.findMapping(msg.deviceId, msg.channel, controlType, msg.control);
        if (msg.type === 'noteOff' && mapping && !isToggleMappingTarget(mapping.targetParam)) {
          return;
        }
        if (mapping) {
          engine.processMessage(msg, mapping);
        }
      }
    });

    return () => {
      cancelled = true;
      unsubDevices();
      unsubMessages();
      service.destroy();
      engine.removeHandler('track');
      engine.removeHandler('master');
      engine.removeHandler('transport');
      toggleGateState.clear();
    };
  }, [enabled]);
}
