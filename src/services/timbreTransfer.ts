/**
 * Timbre Transfer — use reference audio to influence AI generation output timbre.
 *
 * Provides types, factory functions, and utilities for managing timbre references
 * that can be attached to generation requests to guide the output's sonic character.
 */

export type TimbreSourceType = 'clip' | 'upload';

export interface TimbreReference {
  /** Unique ID for this reference. */
  id: string;
  /** Where the audio came from. */
  sourceType: TimbreSourceType;
  /** Storage key for the audio data. */
  audioKey: string;
  /** Display name. */
  name: string;
  /** How strongly the reference should influence output (0–1, default 0.5). */
  strength: number;
  /** Timestamp of when this reference was created. */
  createdAt: number;
}

interface CreateTimbreReferenceOptions {
  sourceType: TimbreSourceType;
  audioKey: string;
  name: string;
  strength?: number;
}

export function createTimbreReference(options: CreateTimbreReferenceOptions): TimbreReference {
  return {
    id: crypto.randomUUID(),
    sourceType: options.sourceType,
    audioKey: options.audioKey,
    name: options.name,
    strength: options.strength ?? 0.5,
    createdAt: Date.now(),
  };
}

export function validateTimbreStrength(value: number): number {
  return Math.max(0, Math.min(1, value));
}
