/**
 * MidiMappingEngine — resolves incoming MIDI messages to DAW parameter changes.
 *
 * Responsibilities:
 * - Scale MIDI values (7-bit CC / 14-bit pitchBend) to target parameter ranges
 * - Parse target parameter identifiers (e.g. 'track:t1:volume')
 * - Dispatch resolved values to registered scope handlers
 */
import type { MidiMapping, MidiMessage } from '../types/midiController';

/** Parsed target identifying which DAW parameter to control. */
export interface ResolvedTarget {
  scope: string;
  trackId?: string;
  param: string;
  index?: number;
}

type ScopeHandler = (target: ResolvedTarget, value: number) => void;

export class MidiMappingEngine {
  private handlers = new Map<string, ScopeHandler>();

  /**
   * Register a handler for a specific scope (e.g. 'track', 'transport', 'master').
   * The handler receives the parsed target and the scaled value.
   */
  registerHandler(scope: string, handler: ScopeHandler): void {
    this.handlers.set(scope, handler);
  }

  /** Remove a handler for a scope. */
  removeHandler(scope: string): void {
    this.handlers.delete(scope);
  }

  /**
   * Scale a MIDI message value to the mapping's [min, max] range.
   *
   * CC and note: 0-127 → [min, max]
   * PitchBend: 0-16383 → [min, max]
   */
  resolveValue(msg: MidiMessage, mapping: MidiMapping): number {
    const maxRaw = msg.type === 'pitchBend' ? 16383 : 127;
    const normalized = msg.value / maxRaw;
    return mapping.min + normalized * (mapping.max - mapping.min);
  }

  /**
   * Parse a target parameter string into a structured ResolvedTarget.
   *
   * Supported formats:
   * - 'track:<trackId>:<param>'         → { scope: 'track', trackId, param }
   * - 'track:<trackId>:send:<index>'    → { scope: 'track', trackId, param: 'send', index }
   * - 'transport:<param>'               → { scope: 'transport', param }
   * - 'master:<param>'                  → { scope: 'master', param }
   */
  parseTarget(target: string): ResolvedTarget | null {
    if (!target) return null;

    const parts = target.split(':');
    if (parts.length < 2) return null;

    const scope = parts[0];

    if (scope === 'track' && parts.length >= 3) {
      const trackId = parts[1];
      const param = parts[2];

      if (param === 'send' && parts.length >= 4) {
        const index = parseInt(parts[3], 10);
        return { scope, trackId, param, index: isNaN(index) ? 0 : index };
      }

      return { scope, trackId, param };
    }

    if (scope === 'transport' || scope === 'master') {
      return { scope, param: parts[1] };
    }

    return null;
  }

  /**
   * Process an incoming MIDI message against a mapping:
   * scale the value, parse the target, and dispatch to the handler.
   */
  processMessage(msg: MidiMessage, mapping: MidiMapping): void {
    const target = this.parseTarget(mapping.targetParam);
    if (!target) return;

    const value = this.resolveValue(msg, mapping);
    const handler = this.handlers.get(target.scope);
    if (handler) {
      handler(target, value);
    }
  }

  /**
   * Build a target parameter identifier string.
   */
  static buildTargetId(
    scope: string,
    trackId: string | undefined,
    param: string,
    index?: number,
  ): string {
    if (scope === 'track' && trackId) {
      if (index !== undefined) {
        return `${scope}:${trackId}:${param}:${index}`;
      }
      return `${scope}:${trackId}:${param}`;
    }
    return `${scope}:${param}`;
  }
}

// ── Singleton ──────────────────────────────────────────────

let _instance: MidiMappingEngine | null = null;

export function getMidiMappingEngine(): MidiMappingEngine {
  if (!_instance) _instance = new MidiMappingEngine();
  return _instance;
}
