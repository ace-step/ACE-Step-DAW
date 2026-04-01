/** Vite ?raw imports — any file imported with ?raw suffix returns a string */
declare module '*?raw' {
  const content: string;
  export default content;
}

/** Shared Strudel type interfaces used across module declarations. */

/** A rational time span with begin/end. */
interface StrudelTimeSpan {
  begin: { valueOf(): number };
  end: { valueOf(): number };
}

/** A single event (hap) from a Strudel pattern query. */
interface StrudelHap {
  whole: StrudelTimeSpan;
  part: StrudelTimeSpan;
  value: Record<string, unknown> | string | number;
  duration?: { valueOf(): number };
  hasOnset(): boolean;
  ensureObjectValue(): void;
}

/** A Strudel pattern that can be queried for events. */
interface StrudelPattern {
  queryArc(begin: number, end: number, controls?: Record<string, unknown>): StrudelHap[];
}

/** Superdough audio controller with its destination gain node. */
interface SuperdoughAudioController {
  output: { destinationGain: GainNode };
}

/** A webaudioRepl instance for evaluating and playing Strudel patterns. */
interface StrudelRepl {
  evaluate(code: string): Promise<StrudelPattern>;
  start(): void;
  stop(): void;
  setCps(cps: number): void;
}

/** Type declarations for @strudel packages (untyped ESM modules). */
declare module '@strudel/mini' {
  export function mini(code: string): StrudelPattern;
  export function miniAllStrings(): void;
}

declare module '@strudel/core' {
  export class Pattern implements StrudelPattern {
    queryArc(begin: number, end: number, controls?: Record<string, unknown>): StrudelHap[];
  }
  export class Hap implements StrudelHap {
    whole: StrudelTimeSpan;
    part: StrudelTimeSpan;
    value: Record<string, unknown> | string | number;
    duration?: { valueOf(): number };
    hasOnset(): boolean;
    ensureObjectValue(): void;
  }
  export function evalScope(...modules: Promise<Record<string, unknown>>[]): Promise<void>;
}

declare module '@strudel/webaudio' {
  export function webaudioRepl(options?: Record<string, unknown>): StrudelRepl;
  export function webaudioOutput(hap: StrudelHap, deadline: number, hapDuration: number, cps: number, t?: number): void;
  export function samples(sampleMap: string | Record<string, unknown>, baseUrl?: string, options?: Record<string, unknown>): Promise<void>;
  export function getAudioContext(): AudioContext;
  export function setAudioContext(ctx: AudioContext | OfflineAudioContext | null): void;
  export function getSuperdoughAudioController(): SuperdoughAudioController | null;
  export function setSuperdoughAudioController(controller: SuperdoughAudioController | null): void;
  export function initAudio(options?: Record<string, unknown>): Promise<void>;
  export function initAudioOnFirstClick(options?: Record<string, unknown>): void;
  export function resetGlobalEffects(): void;
  export function registerSynthSounds(): void;
  export function registerZZFXSounds(): void;
}

declare module '@strudel/codemirror' {
  export class StrudelMirror {
    constructor(options: Record<string, unknown>);
    setCode(code: string): void;
    evaluate(): void;
    stop(): void;
  }
}

declare module 'superdough' {
  export function registerSynthSounds(): void;
  export function initAudio(options?: Record<string, unknown>): Promise<void>;
  export function registerSound(key: string, onTrigger: (value: Record<string, unknown>, t: number, dur: number) => void, data?: Record<string, unknown>): void;
  export function getAudioContext(): AudioContext;
  export function setAudioContext(ctx: AudioContext | OfflineAudioContext | null): void;
  export function getSuperdoughAudioController(): SuperdoughAudioController | null;
  export function setSuperdoughAudioController(controller: SuperdoughAudioController | null): void;
  export function resetGlobalEffects(): void;
  export function superdough(value: Record<string, unknown>, t: number, dur: number, cps?: number, cycle?: number): Promise<void>;
}

declare module 'superdough/superdoughoutput.mjs' {
  export class SuperdoughAudioController {
    constructor(ctx: AudioContext | OfflineAudioContext);
    output: { destinationGain: GainNode };
  }
}

declare module '@strudel/tonal' {}
declare module '@strudel/soundfonts' {
  export function registerSoundfonts(): Promise<void>;
}

declare module '@strudel/transpiler' {
  export function transpiler(code: string, options?: Record<string, unknown>): { output: string };
}

declare module '@strudel/repl' {
  /** Load all default samples (dirt-samples, drum machines, soundfonts, etc.) */
  export function prebake(): Promise<void>;
}

declare module '@kabelsalat/web' {
  export class SalatRepl {
    constructor(options?: Record<string, unknown>);
    evaluate(code: string): any;
    stop(): void;
  }
  export function exportModule(): void;
}
