/**
 * WebMidiService — thin wrapper around the Web MIDI API.
 *
 * Responsibilities:
 * - Request MIDI access and enumerate connected input devices
 * - Listen for MIDI messages on all inputs and parse them into MidiMessage
 * - Track device connect/disconnect via statechange events
 * - Provide subscribe/unsubscribe for message and device-change callbacks
 */
import type { MidiDevice, MidiMessage } from '../types/midiController';

type MessageListener = (msg: MidiMessage) => void;
type DeviceChangeListener = (devices: MidiDevice[]) => void;

export class WebMidiService {
  private access: MIDIAccess | null = null;
  private messageListeners = new Set<MessageListener>();
  private deviceChangeListeners = new Set<DeviceChangeListener>();
  private inputHandlers = new Map<string, (e: Event) => void>();
  private stateChangeHandler: ((e: Event) => void) | null = null;

  /** Check browser support before calling connect(). */
  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';
  }

  /** Request MIDI access and start listening to all inputs. Idempotent — safe to call multiple times. */
  async connect(): Promise<MidiDevice[]> {
    if (!WebMidiService.isSupported()) {
      throw new Error('Web MIDI API is not supported in this browser');
    }

    // Idempotent: if already connected, just return current devices
    if (this.access) {
      return this.getDevices();
    }

    this.access = await navigator.requestMIDIAccess({ sysex: false });
    this.listenToAllInputs();
    this.watchStateChanges();

    return this.getDevices();
  }

  /** Return the current list of MIDI input devices (connected and disconnected). */
  getDevices(): MidiDevice[] {
    if (!this.access) return [];

    const devices: MidiDevice[] = [];
    this.access.inputs.forEach((input) => {
      devices.push({
        id: input.id,
        name: input.name ?? 'Unknown Device',
        manufacturer: input.manufacturer ?? 'Unknown',
        state: input.state as 'connected' | 'disconnected',
      });
    });
    return devices;
  }

  /** Subscribe to parsed MIDI messages from all inputs. Returns unsubscribe fn. */
  onMessage(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => {
      this.messageListeners.delete(listener);
    };
  }

  /** Subscribe to device connection state changes. Returns unsubscribe fn. */
  onDeviceChange(listener: DeviceChangeListener): () => void {
    this.deviceChangeListeners.add(listener);
    return () => {
      this.deviceChangeListeners.delete(listener);
    };
  }

  /** Clean up all event listeners and release MIDI access. */
  destroy(): void {
    if (this.access && this.stateChangeHandler) {
      this.access.removeEventListener('statechange', this.stateChangeHandler);
    }

    this.inputHandlers.forEach((handler, inputId) => {
      const input = this.access?.inputs.get(inputId);
      if (input) {
        input.removeEventListener('midimessage', handler);
      }
    });

    this.inputHandlers.clear();
    this.stateChangeHandler = null;
    this.messageListeners.clear();
    this.deviceChangeListeners.clear();
    this.access = null;
  }

  // ── Internal ──────────────────────────────────────────────

  private listenToAllInputs(): void {
    if (!this.access) return;

    this.access.inputs.forEach((input) => {
      this.attachInput(input);
    });
  }

  private attachInput(input: MIDIInput): void {
    if (this.inputHandlers.has(input.id)) return;

    const handler = (e: Event) => {
      const midiEvent = e as MIDIMessageEvent;
      const msg = this.parseMidiMessage(input.id, midiEvent);
      if (msg) {
        this.messageListeners.forEach((listener) => listener(msg));
      }
    };

    input.addEventListener('midimessage', handler);
    this.inputHandlers.set(input.id, handler);
  }

  private detachInput(inputId: string): void {
    const handler = this.inputHandlers.get(inputId);
    const input = this.access?.inputs.get(inputId);
    if (handler && input) {
      input.removeEventListener('midimessage', handler);
    }
    this.inputHandlers.delete(inputId);
  }

  private watchStateChanges(): void {
    if (!this.access) return;
    if (this.stateChangeHandler) {
      this.access.removeEventListener('statechange', this.stateChangeHandler);
    }

    this.stateChangeHandler = (e: Event) => {
      const event = e as MIDIConnectionEvent;
      const port = event.port;
      if (!port) return;

      if (port.type === 'input') {
        if (port.state === 'connected') {
          this.attachInput(port as MIDIInput);
        } else {
          this.detachInput(port.id);
        }
        const devices = this.getDevices();
        this.deviceChangeListeners.forEach((listener) => listener(devices));
      }
    };

    this.access.addEventListener('statechange', this.stateChangeHandler);
  }

  private parseMidiMessage(deviceId: string, event: MIDIMessageEvent): MidiMessage | null {
    const data = event.data;
    if (!data || data.length < 2) return null;

    const statusByte = data[0];
    const channel = statusByte & 0x0f;
    const messageType = statusByte & 0xf0;

    switch (messageType) {
      case 0x80: // Note Off
        return {
          deviceId,
          channel,
          type: 'noteOff',
          control: data[1],
          value: data.length > 2 ? data[2] : 0,
          timestamp: event.timeStamp,
        };

      case 0x90: // Note On (velocity 0 = Note Off)
        return {
          deviceId,
          channel,
          type: data.length > 2 && data[2] > 0 ? 'noteOn' : 'noteOff',
          control: data[1],
          value: data.length > 2 ? data[2] : 0,
          timestamp: event.timeStamp,
        };

      case 0xb0: // Control Change
        return {
          deviceId,
          channel,
          type: 'cc',
          control: data[1],
          value: data.length > 2 ? data[2] : 0,
          timestamp: event.timeStamp,
        };

      case 0xe0: // Pitch Bend
        {
          const lsb = data[1];
          const msb = data.length > 2 ? data[2] : 0;
          const value = (msb << 7) | lsb;
          return {
            deviceId,
            channel,
            type: 'pitchBend',
            control: 0,
            value,
            timestamp: event.timeStamp,
          };
        }

      default:
        return null;
    }
  }
}

// ── Singleton ──────────────────────────────────────────────

let _instance: WebMidiService | null = null;

export function getWebMidiService(): WebMidiService {
  if (!_instance) _instance = new WebMidiService();
  return _instance;
}

/** Reset singleton (for testing). */
export function resetWebMidiService(): void {
  _instance?.destroy();
  _instance = null;
}
