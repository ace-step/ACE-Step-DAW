/**
 * Core DSP Library — Phase 2 (#1123).
 *
 * Zero-dependency, AudioWorklet-safe DSP primitives.
 * Every module follows: pre-allocated buffers, block-based API,
 * anti-denormal guards, no allocations in process().
 */

export * from './dsp-utils';
export * from './biquad-filter';
export * from './delay-line';
export * from './oscillator';
export * from './envelope';
export * from './lfo';
export * from './dynamics';
export * from './reverb';
export * from './waveshaper';
export * from './voice-manager';
export * from './spectral-processor';
