/**
 * MPE-aware MIDI input service for note playing.
 *
 * Handles routing of MIDI messages from hardware controllers to the synth engine.
 * Supports both standard MIDI (all notes on channel 0) and MPE mode
 * (per-note channels with independent expression).
 *
 * This is separate from midiControllerService.ts which handles clip/scene launching.
 */

import {
  parseMidiMessage,
  MpeConfigDetector,
  getMpeZoneForChannel,
  isMasterChannel,
  MPE_CC_SLIDE,
  type MpeConfig,
  type MidiMessage,
} from '../engine/dsp/core/mpe';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MpeInputCallbacks {
  /** Note triggered with velocity and MIDI channel. */
  onNoteOn: (note: number, velocity: number, channel: number) => void;
  /** Note released on a specific channel. */
  onNoteOff: (note: number, channel: number) => void;
  /** Pitch bend on a channel (14-bit value, 0-16383). */
  onPitchBend: (channel: number, value: number) => void;
  /** CC74 slide/timbre on a channel (0-127). */
  onSlide: (channel: number, value: number) => void;
  /** Channel pressure/aftertouch on a channel (0-127). */
  onPressure: (channel: number, value: number) => void;
  /** MPE configuration changed (zone added/removed). */
  onMpeConfigChanged?: (config: MpeConfig) => void;
}

export interface MpeInputState {
  /** Whether the service is initialized and listening. */
  isActive: boolean;
  /** Current MPE configuration (auto-detected or manual). */
  mpeConfig: MpeConfig;
  /** Connected MIDI input device name. */
  deviceName: string | null;
}

// ---------------------------------------------------------------------------
// Service State
// ---------------------------------------------------------------------------

let midiAccess: MIDIAccess | null = null;
let currentInput: MIDIInput | null = null;
let callbacks: MpeInputCallbacks | null = null;
let configDetector = new MpeConfigDetector();
let stateChangeCallback: ((state: MpeInputState) => void) | null = null;
let isActive = false;

// ---------------------------------------------------------------------------
// MIDI Message Handler
// ---------------------------------------------------------------------------

function handleMidiMessage(event: MIDIMessageEvent): void {
  if (!callbacks) return;
  const data = event.data;
  if (!data || data.length < 1) return;

  const msg = parseMidiMessage(data);
  if (!msg) return;

  const config = configDetector.config;

  switch (msg.type) {
    case 'noteOn':
      callbacks.onNoteOn(msg.data1, msg.data2 / 127, msg.channel);
      break;

    case 'noteOff':
      callbacks.onNoteOff(msg.data1, msg.channel);
      break;

    case 'pitchBend':
      callbacks.onPitchBend(msg.channel, msg.data2);
      break;

    case 'cc':
      // Check for MPE Configuration Message (RPN 6)
      if (configDetector.processCC(msg.channel, msg.data1, msg.data2)) {
        callbacks.onMpeConfigChanged?.(configDetector.config);
        notifyStateChange();
      }
      // CC74 = MPE slide/timbre
      if (msg.data1 === MPE_CC_SLIDE) {
        callbacks.onSlide(msg.channel, msg.data2);
      }
      break;

    case 'channelPressure':
      callbacks.onPressure(msg.channel, msg.data1);
      break;
  }
}

// ---------------------------------------------------------------------------
// State Notifications
// ---------------------------------------------------------------------------

function notifyStateChange(): void {
  if (stateChangeCallback) {
    stateChangeCallback(getState());
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialize the MPE input service with Web MIDI API.
 * Returns the initial state.
 */
export async function initMpeInput(): Promise<MpeInputState> {
  if (!navigator.requestMIDIAccess) {
    return { isActive: false, mpeConfig: configDetector.config, deviceName: null };
  }

  try {
    const access = await navigator.requestMIDIAccess() as MIDIAccess;
    midiAccess = access;

    const inputs = Array.from(access.inputs.values());
    if (inputs.length > 0) {
      connectInput(inputs[0] as MIDIInput);
    }

    // Listen for device connect/disconnect
    access.onstatechange = (event) => {
      if (event.port?.type === 'input') {
        if (event.port.state === 'connected' && !currentInput) {
          connectInput(event.port as MIDIInput);
        } else if (event.port.state === 'disconnected' && currentInput?.id === event.port.id) {
          disconnectInput();
        }
      }
    };

    isActive = true;
    return getState();
  } catch {
    return { isActive: false, mpeConfig: configDetector.config, deviceName: null };
  }
}

/**
 * Set the callbacks for MIDI events.
 */
export function setMpeInputCallbacks(cbs: MpeInputCallbacks | null): void {
  callbacks = cbs;
}

/**
 * Set a callback to be notified when state changes.
 */
export function setMpeStateChangeCallback(cb: ((state: MpeInputState) => void) | null): void {
  stateChangeCallback = cb;
}

/**
 * Manually set MPE configuration (e.g., from settings UI).
 */
export function setMpeConfig(config: MpeConfig): void {
  configDetector = new MpeConfigDetector(config);
  callbacks?.onMpeConfigChanged?.(config);
  notifyStateChange();
}

/**
 * Get the current MPE configuration.
 */
export function getMpeConfig(): MpeConfig {
  return configDetector.config;
}

/**
 * Get the current state of the MPE input service.
 */
export function getState(): MpeInputState {
  return {
    isActive,
    mpeConfig: configDetector.config,
    deviceName: currentInput?.name ?? null,
  };
}

/**
 * Select a specific MIDI input device by ID.
 */
export function selectMpeInput(inputId: string): boolean {
  if (!midiAccess) return false;
  const input = midiAccess.inputs.get(inputId);
  if (!input) return false;
  connectInput(input);
  return true;
}

/**
 * List available MIDI input devices.
 */
export function listMpeInputs(): Array<{ id: string; name: string }> {
  if (!midiAccess) return [];
  return Array.from(midiAccess.inputs.values()).map((input) => ({
    id: input.id,
    name: input.name ?? 'Unknown Device',
  }));
}

/**
 * Disconnect and clean up.
 */
export function disconnectMpeInput(): void {
  disconnectInput();
  midiAccess = null;
  callbacks = null;
  stateChangeCallback = null;
  configDetector = new MpeConfigDetector();
  isActive = false;
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function connectInput(input: MIDIInput): void {
  if (currentInput) {
    currentInput.onmidimessage = null;
  }
  currentInput = input;
  currentInput.onmidimessage = handleMidiMessage;
  notifyStateChange();
}

function disconnectInput(): void {
  if (currentInput) {
    currentInput.onmidimessage = null;
    currentInput = null;
  }
  notifyStateChange();
}
