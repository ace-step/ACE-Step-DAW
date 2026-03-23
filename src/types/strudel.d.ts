/** Type declarations for @strudel packages (untyped ESM modules). */
declare module '@strudel/mini' {
  export function mini(code: string): any;
}

declare module '@strudel/core' {
  export class Pattern {
    queryArc(begin: number, end: number, controls?: Record<string, unknown>): any[];
  }
  export class Hap {
    whole: { begin: { valueOf(): number }; end: { valueOf(): number } };
    part: { begin: { valueOf(): number }; end: { valueOf(): number } };
    value: any;
    duration?: { valueOf(): number };
    hasOnset(): boolean;
    ensureObjectValue(): void;
  }
}

declare module '@strudel/webaudio' {
  export function webaudioRepl(options?: Record<string, unknown>): any;
  export function webaudioOutput(hap: any, deadline: number, hapDuration: number, cps: number, t?: number): any;
  export function samples(sampleMap: string | Record<string, unknown>, baseUrl?: string, options?: Record<string, unknown>): Promise<void>;
  export function getAudioContext(): AudioContext;
  export function setAudioContext(ctx: AudioContext | OfflineAudioContext | null): void;
  export function getSuperdoughAudioController(): any;
  export function setSuperdoughAudioController(controller: any): void;
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
  export function registerSound(key: string, onTrigger: any, data?: any): void;
  export function getAudioContext(): AudioContext;
  export function setAudioContext(ctx: AudioContext | OfflineAudioContext | null): void;
  export function getSuperdoughAudioController(): any;
  export function setSuperdoughAudioController(controller: any): void;
  export function resetGlobalEffects(): void;
  export function superdough(value: Record<string, unknown>, t: number, dur: number, cps?: number, cycle?: number): Promise<any>;
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
