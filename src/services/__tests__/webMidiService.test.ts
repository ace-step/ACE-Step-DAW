import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebMidiService } from '../webMidiService';
import type { MidiMessage } from '../../types/midiController';

// Mock Web MIDI API
function createMockMIDIInput(id: string, name: string, manufacturer = 'Test') {
  const listeners = new Map<string, Set<(e: unknown) => void>>();
  return {
    id,
    name,
    manufacturer,
    state: 'connected' as const,
    type: 'input' as const,
    connection: 'open' as const,
    addEventListener: vi.fn((event: string, handler: (e: unknown) => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
    }),
    removeEventListener: vi.fn((event: string, handler: (e: unknown) => void) => {
      listeners.get(event)?.delete(handler);
    }),
    // Helper to simulate a MIDI message
    _emit: (event: string, data: unknown) => {
      listeners.get(event)?.forEach((h) => h(data));
    },
    _listeners: listeners,
  };
}

function createMockMIDIAccess(inputs: ReturnType<typeof createMockMIDIInput>[]) {
  const inputMap = new Map(inputs.map((inp) => [inp.id, inp]));
  const stateListeners = new Set<(e: unknown) => void>();
  return {
    inputs: inputMap,
    outputs: new Map(),
    addEventListener: vi.fn((event: string, handler: (e: unknown) => void) => {
      if (event === 'statechange') stateListeners.add(handler);
    }),
    removeEventListener: vi.fn((event: string, handler: (e: unknown) => void) => {
      if (event === 'statechange') stateListeners.delete(handler);
    }),
    _stateListeners: stateListeners,
    _emitStateChange: (port: unknown) => {
      stateListeners.forEach((h) => h({ port }));
    },
  };
}

describe('WebMidiService', () => {
  let service: WebMidiService;
  let originalRequestMIDIAccess: typeof navigator.requestMIDIAccess;

  beforeEach(() => {
    originalRequestMIDIAccess = navigator.requestMIDIAccess;
    service = new WebMidiService();
  });

  afterEach(() => {
    service.destroy();
    Object.defineProperty(navigator, 'requestMIDIAccess', {
      value: originalRequestMIDIAccess,
      writable: true,
      configurable: true,
    });
  });

  describe('isSupported', () => {
    it('returns true when navigator.requestMIDIAccess exists', () => {
      Object.defineProperty(navigator, 'requestMIDIAccess', {
        value: vi.fn(),
        writable: true,
        configurable: true,
      });
      expect(WebMidiService.isSupported()).toBe(true);
    });

    it('returns false when navigator.requestMIDIAccess is undefined', () => {
      Object.defineProperty(navigator, 'requestMIDIAccess', {
        value: undefined,
        writable: true,
        configurable: true,
      });
      expect(WebMidiService.isSupported()).toBe(false);
    });
  });

  describe('connect', () => {
    it('enumerates connected MIDI inputs on connect', async () => {
      const input1 = createMockMIDIInput('inp-1', 'Keyboard A', 'Yamaha');
      const input2 = createMockMIDIInput('inp-2', 'Pad B', 'Akai');
      const access = createMockMIDIAccess([input1, input2]);

      Object.defineProperty(navigator, 'requestMIDIAccess', {
        value: vi.fn().mockResolvedValue(access),
        writable: true,
        configurable: true,
      });

      await service.connect();
      const devices = service.getDevices();

      expect(devices).toHaveLength(2);
      expect(devices[0]).toEqual({
        id: 'inp-1',
        name: 'Keyboard A',
        manufacturer: 'Yamaha',
        state: 'connected',
      });
      expect(devices[1]).toEqual({
        id: 'inp-2',
        name: 'Pad B',
        manufacturer: 'Akai',
        state: 'connected',
      });
    });

    it('throws when Web MIDI is not supported', async () => {
      Object.defineProperty(navigator, 'requestMIDIAccess', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      await expect(service.connect()).rejects.toThrow('Web MIDI API is not supported');
    });

    it('is idempotent and does not duplicate MIDI access or input listeners', async () => {
      const input = createMockMIDIInput('inp-1', 'Controller');
      const access = createMockMIDIAccess([input]);
      const requestMIDIAccess = vi.fn().mockResolvedValue(access);
      Object.defineProperty(navigator, 'requestMIDIAccess', {
        value: requestMIDIAccess,
        writable: true,
        configurable: true,
      });

      await service.connect();
      await service.connect();

      expect(requestMIDIAccess).toHaveBeenCalledTimes(1);
      expect(input.addEventListener).toHaveBeenCalledTimes(1);
      expect(access.addEventListener).toHaveBeenCalledTimes(1);
    });
  });

  describe('MIDI message handling', () => {
    it('parses CC messages and notifies listener', async () => {
      const input = createMockMIDIInput('inp-1', 'Controller');
      const access = createMockMIDIAccess([input]);
      Object.defineProperty(navigator, 'requestMIDIAccess', {
        value: vi.fn().mockResolvedValue(access),
        writable: true,
        configurable: true,
      });

      const messages: MidiMessage[] = [];
      service.onMessage((msg) => messages.push(msg));
      await service.connect();

      // CC message: status 0xB0 (channel 0), CC 7, value 100
      input._emit('midimessage', { data: new Uint8Array([0xb0, 7, 100]), timeStamp: 1000 });

      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({
        deviceId: 'inp-1',
        channel: 0,
        type: 'cc',
        control: 7,
        value: 100,
        timestamp: 1000,
      });
    });

    it('parses noteOn messages', async () => {
      const input = createMockMIDIInput('inp-1', 'Keys');
      const access = createMockMIDIAccess([input]);
      Object.defineProperty(navigator, 'requestMIDIAccess', {
        value: vi.fn().mockResolvedValue(access),
        writable: true,
        configurable: true,
      });

      const messages: MidiMessage[] = [];
      service.onMessage((msg) => messages.push(msg));
      await service.connect();

      // NoteOn: status 0x90 (channel 0), note 60, velocity 127
      input._emit('midimessage', { data: new Uint8Array([0x90, 60, 127]), timeStamp: 2000 });

      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe('noteOn');
      expect(messages[0].control).toBe(60);
      expect(messages[0].value).toBe(127);
    });

    it('parses noteOff messages (velocity 0 as noteOff)', async () => {
      const input = createMockMIDIInput('inp-1', 'Keys');
      const access = createMockMIDIAccess([input]);
      Object.defineProperty(navigator, 'requestMIDIAccess', {
        value: vi.fn().mockResolvedValue(access),
        writable: true,
        configurable: true,
      });

      const messages: MidiMessage[] = [];
      service.onMessage((msg) => messages.push(msg));
      await service.connect();

      // NoteOn with velocity 0 = noteOff
      input._emit('midimessage', { data: new Uint8Array([0x90, 60, 0]), timeStamp: 3000 });
      expect(messages[0].type).toBe('noteOff');

      // Explicit noteOff: 0x80
      input._emit('midimessage', { data: new Uint8Array([0x80, 60, 64]), timeStamp: 3001 });
      expect(messages[1].type).toBe('noteOff');
    });

    it('parses pitchBend messages', async () => {
      const input = createMockMIDIInput('inp-1', 'Controller');
      const access = createMockMIDIAccess([input]);
      Object.defineProperty(navigator, 'requestMIDIAccess', {
        value: vi.fn().mockResolvedValue(access),
        writable: true,
        configurable: true,
      });

      const messages: MidiMessage[] = [];
      service.onMessage((msg) => messages.push(msg));
      await service.connect();

      // PitchBend: 0xE0 (channel 0), LSB=0, MSB=64 → center (8192)
      input._emit('midimessage', { data: new Uint8Array([0xe0, 0, 64]), timeStamp: 4000 });

      expect(messages[0].type).toBe('pitchBend');
      expect(messages[0].control).toBe(0);
      expect(messages[0].value).toBe(8192);
    });

    it('handles channel extraction for non-zero channels', async () => {
      const input = createMockMIDIInput('inp-1', 'Multi');
      const access = createMockMIDIAccess([input]);
      Object.defineProperty(navigator, 'requestMIDIAccess', {
        value: vi.fn().mockResolvedValue(access),
        writable: true,
        configurable: true,
      });

      const messages: MidiMessage[] = [];
      service.onMessage((msg) => messages.push(msg));
      await service.connect();

      // CC on channel 9 (0xB9)
      input._emit('midimessage', { data: new Uint8Array([0xb9, 1, 50]), timeStamp: 5000 });
      expect(messages[0].channel).toBe(9);
    });
  });

  describe('device state changes', () => {
    it('detects newly connected device', async () => {
      const access = createMockMIDIAccess([]);
      Object.defineProperty(navigator, 'requestMIDIAccess', {
        value: vi.fn().mockResolvedValue(access),
        writable: true,
        configurable: true,
      });

      const deviceChanges: string[] = [];
      service.onDeviceChange((devices) => {
        deviceChanges.push(devices.map((d) => d.name).join(','));
      });
      await service.connect();
      expect(service.getDevices()).toHaveLength(0);

      // Simulate new device connection
      const newInput = createMockMIDIInput('inp-new', 'New Device');
      access.inputs.set('inp-new', newInput);
      access._emitStateChange({ ...newInput, type: 'input', state: 'connected' });

      expect(service.getDevices()).toHaveLength(1);
      expect(service.getDevices()[0].name).toBe('New Device');
      expect(deviceChanges.length).toBeGreaterThan(0);
    });

    it('detaches MIDI message listener when an input disconnects', async () => {
      const input = createMockMIDIInput('inp-1', 'Controller');
      const access = createMockMIDIAccess([input]);
      Object.defineProperty(navigator, 'requestMIDIAccess', {
        value: vi.fn().mockResolvedValue(access),
        writable: true,
        configurable: true,
      });

      await service.connect();
      access._emitStateChange({ ...input, type: 'input', state: 'disconnected' });

      expect(input.removeEventListener).toHaveBeenCalledWith('midimessage', expect.any(Function));
    });
  });

  describe('removeListener', () => {
    it('stops receiving messages after removing listener', async () => {
      const input = createMockMIDIInput('inp-1', 'Test');
      const access = createMockMIDIAccess([input]);
      Object.defineProperty(navigator, 'requestMIDIAccess', {
        value: vi.fn().mockResolvedValue(access),
        writable: true,
        configurable: true,
      });

      const messages: MidiMessage[] = [];
      const unsub = service.onMessage((msg) => messages.push(msg));
      await service.connect();

      input._emit('midimessage', { data: new Uint8Array([0xb0, 1, 50]), timeStamp: 100 });
      expect(messages).toHaveLength(1);

      unsub();
      input._emit('midimessage', { data: new Uint8Array([0xb0, 1, 60]), timeStamp: 200 });
      expect(messages).toHaveLength(1); // no new message
    });
  });
});
