/**
 * MPE-aware voice manager.
 *
 * Extends VoiceManager with per-voice MIDI channel tracking and expression state
 * (pitch bend, slide/CC74, channel pressure). In MPE mode, each voice is
 * assigned to a unique MIDI channel, and expression messages on that channel
 * are routed to the corresponding voice.
 *
 * When MPE is disabled, this behaves identically to VoiceManager.
 */

import { VoiceManager, type VoiceCallbacks } from './voice-manager';
import {
  type MpeConfig,
  type MpeNoteExpression,
  createDefaultMpeConfig,
  createDefaultExpression,
  getMpeZoneForChannel,
  isMasterChannel,
  pitchBendToSemitones,
  MPE_CC_SLIDE,
  MPE_DEFAULT_BEND_RANGE,
  MPE_MASTER_BEND_RANGE,
} from './mpe';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MpeVoiceState<T> {
  instance: T;
  /** MIDI channel this voice is assigned to (MPE mode), or -1. */
  channel: number;
  /** Per-note expression values. */
  expression: MpeNoteExpression;
}

export interface MpeExpressionCallback<T> {
  /** Called when per-voice expression changes. */
  onExpression: (voice: T, expression: MpeNoteExpression) => void;
}

// ---------------------------------------------------------------------------
// MpeVoiceManager
// ---------------------------------------------------------------------------

export class MpeVoiceManager<T> {
  private readonly _vm: VoiceManager<T>;
  private readonly _voiceStates: Map<T, MpeVoiceState<T>> = new Map();
  private _mpeConfig: MpeConfig;
  private _expressionCallback: MpeExpressionCallback<T> | null;

  /** Master channel expression (applies to all voices). */
  private _masterExpression: MpeNoteExpression = createDefaultExpression();

  constructor(
    voiceInstances: T[],
    callbacks: VoiceCallbacks<T>,
    mpeConfig?: MpeConfig,
    expressionCallback?: MpeExpressionCallback<T>,
  ) {
    this._vm = new VoiceManager(voiceInstances, callbacks);
    this._mpeConfig = mpeConfig ?? createDefaultMpeConfig();
    this._expressionCallback = expressionCallback ?? null;

    // Initialize per-voice state
    for (const instance of voiceInstances) {
      this._voiceStates.set(instance, {
        instance,
        channel: -1,
        expression: createDefaultExpression(),
      });
    }
  }

  get mpeConfig(): MpeConfig { return this._mpeConfig; }
  set mpeConfig(config: MpeConfig) { this._mpeConfig = config; }

  get maxPolyphony(): number { return this._vm.maxPolyphony; }
  get activeCount(): number { return this._vm.activeCount; }

  get masterExpression(): MpeNoteExpression { return { ...this._masterExpression }; }

  /**
   * Trigger a note on a specific MIDI channel.
   * In MPE mode, the channel is tracked so expression messages can be routed.
   */
  noteOn(note: number, velocity: number, channel: number = 0): T {
    const instance = this._vm.noteOn(note, velocity);

    const state = this._voiceStates.get(instance);
    if (state) {
      state.channel = channel;
      state.expression = createDefaultExpression();
    }

    return instance;
  }

  /**
   * Release a note. In non-MPE mode, finds by note number.
   * In MPE mode, uses channel to find the correct voice.
   */
  noteOff(note: number, channel: number = 0): void {
    if (this._mpeConfig.enabled) {
      // In MPE mode, find voice by channel (more specific)
      const targetState = this._findVoiceByChannel(channel);
      if (targetState) {
        this._vm.noteOff(note);
      }
    } else {
      this._vm.noteOff(note);
    }
  }

  /**
   * Apply pitch bend to a voice.
   * - If channel is a member channel: applies per-note bend
   * - If channel is a master channel: applies to all voices in that zone
   */
  pitchBend(channel: number, bendValue: number): void {
    if (!this._mpeConfig.enabled) {
      // Non-MPE: apply to all voices
      const semitones = pitchBendToSemitones(bendValue, MPE_MASTER_BEND_RANGE);
      this._masterExpression.pitchBend = semitones;
      this._notifyAllVoices();
      return;
    }

    if (isMasterChannel(this._mpeConfig, channel)) {
      // Master channel bend: applies globally
      const semitones = pitchBendToSemitones(bendValue, MPE_MASTER_BEND_RANGE);
      this._masterExpression.pitchBend = semitones;
      this._notifyAllVoices();
    } else {
      // Member channel bend: per-note
      const state = this._findVoiceByChannel(channel);
      if (state) {
        state.expression.pitchBend = pitchBendToSemitones(bendValue, MPE_DEFAULT_BEND_RANGE);
        this._notifyVoice(state);
      }
    }
  }

  /**
   * Apply CC74 (slide/timbre) to a voice.
   * - Member channel: per-note slide
   * - Master channel: global slide
   */
  slide(channel: number, value: number): void {
    const normalized = value / 127;

    if (!this._mpeConfig.enabled) {
      this._masterExpression.slide = normalized;
      this._notifyAllVoices();
      return;
    }

    if (isMasterChannel(this._mpeConfig, channel)) {
      this._masterExpression.slide = normalized;
      this._notifyAllVoices();
    } else {
      const state = this._findVoiceByChannel(channel);
      if (state) {
        state.expression.slide = normalized;
        this._notifyVoice(state);
      }
    }
  }

  /**
   * Apply channel pressure (aftertouch) to a voice.
   * - Member channel: per-note pressure
   * - Master channel: global pressure
   */
  pressure(channel: number, value: number): void {
    const normalized = value / 127;

    if (!this._mpeConfig.enabled) {
      this._masterExpression.pressure = normalized;
      this._notifyAllVoices();
      return;
    }

    if (isMasterChannel(this._mpeConfig, channel)) {
      this._masterExpression.pressure = normalized;
      this._notifyAllVoices();
    } else {
      const state = this._findVoiceByChannel(channel);
      if (state) {
        state.expression.pressure = normalized;
        this._notifyVoice(state);
      }
    }
  }

  /**
   * Get the combined expression for a voice (master + per-note).
   */
  getVoiceExpression(instance: T): MpeNoteExpression {
    const state = this._voiceStates.get(instance);
    if (!state) return createDefaultExpression();

    return {
      pitchBend: this._masterExpression.pitchBend + state.expression.pitchBend,
      slide: Math.min(1, this._masterExpression.slide + state.expression.slide),
      pressure: Math.min(1, this._masterExpression.pressure + state.expression.pressure),
    };
  }

  /** Get per-note expression state (without master). */
  getPerNoteExpression(instance: T): MpeNoteExpression {
    const state = this._voiceStates.get(instance);
    return state ? { ...state.expression } : createDefaultExpression();
  }

  /** Mark a voice as ended (free). */
  voiceEnded(instance: T): void {
    this._vm.voiceEnded(instance);
    const state = this._voiceStates.get(instance);
    if (state) {
      state.channel = -1;
      state.expression = createDefaultExpression();
    }
  }

  /** Release all active voices. */
  releaseAll(): void {
    this._vm.releaseAll();
  }

  /** Force-stop all voices. */
  stopAll(): void {
    this._vm.stopAll();
    for (const state of this._voiceStates.values()) {
      state.channel = -1;
      state.expression = createDefaultExpression();
    }
    this._masterExpression = createDefaultExpression();
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  private _findVoiceByChannel(channel: number): MpeVoiceState<T> | undefined {
    for (const state of this._voiceStates.values()) {
      if (state.channel === channel) return state;
    }
    return undefined;
  }

  private _notifyVoice(state: MpeVoiceState<T>): void {
    if (this._expressionCallback) {
      this._expressionCallback.onExpression(
        state.instance,
        this.getVoiceExpression(state.instance),
      );
    }
  }

  private _notifyAllVoices(): void {
    if (!this._expressionCallback) return;
    for (const state of this._voiceStates.values()) {
      if (state.channel >= 0) {
        this._expressionCallback.onExpression(
          state.instance,
          this.getVoiceExpression(state.instance),
        );
      }
    }
  }
}
