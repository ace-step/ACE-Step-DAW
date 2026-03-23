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
  }
}

declare module '@strudel/webaudio' {
  export function webaudioRepl(options?: Record<string, unknown>): any;
}

declare module '@kabelsalat/web' {
  export class SalatRepl {
    constructor(options?: Record<string, unknown>);
    evaluate(code: string): any;
    stop(): void;
  }
  export function exportModule(): void;
}
