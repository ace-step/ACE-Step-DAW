import { useEffect, useRef, useCallback, useState } from 'react';
import {
  connectMidiController,
  listMidiInputDevices,
  DEFAULT_MIDI_MAPPING,
  type MidiMapping,
  type MidiDevice,
} from '../services/midiControllerService';

interface UseMidiControllerOptions {
  enabled: boolean;
  deviceId?: string | null;
  mapping?: MidiMapping;
  onClipLaunch: (trackIndex: number, sceneIndex: number) => void;
  onSceneLaunch: (sceneIndex: number) => void;
  onStopAll: () => void;
}

export function useMidiController({
  enabled,
  deviceId = null,
  mapping = DEFAULT_MIDI_MAPPING,
  onClipLaunch,
  onSceneLaunch,
  onStopAll,
}: UseMidiControllerOptions) {
  const [devices, setDevices] = useState<MidiDevice[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const disconnectRef = useRef<(() => void) | null>(null);

  // Stable callback refs to avoid reconnect on every render
  const callbacksRef = useRef({ onClipLaunch, onSceneLaunch, onStopAll });
  callbacksRef.current = { onClipLaunch, onSceneLaunch, onStopAll };

  const refreshDevices = useCallback(async () => {
    const list = await listMidiInputDevices();
    setDevices(list);
  }, []);

  useEffect(() => {
    if (!enabled) {
      disconnectRef.current?.();
      disconnectRef.current = null;
      setIsConnected(false);
      return;
    }

    const { disconnect, connected } = connectMidiController(
      deviceId ?? null,
      mapping,
      {
        onClipLaunch: (trackIndex, sceneIndex) =>
          callbacksRef.current.onClipLaunch(trackIndex, sceneIndex),
        onSceneLaunch: (sceneIndex) =>
          callbacksRef.current.onSceneLaunch(sceneIndex),
        onStopAll: () =>
          callbacksRef.current.onStopAll(),
      },
    );

    disconnectRef.current = disconnect;
    connected.then((success) => setIsConnected(success));

    return () => {
      disconnect();
      setIsConnected(false);
    };
  }, [enabled, deviceId, mapping]);

  return { devices, isConnected, refreshDevices };
}
