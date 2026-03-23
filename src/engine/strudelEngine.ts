/**
 * StrudelEngine — Pattern evaluation and analysis for strudel tracks.
 *
 * Architecture:
 * - Uses Strudel's Pattern.queryArc() for pure, scheduler-free pattern evaluation
 * - Tone.js Transport remains the sole master clock (no competing schedulers)
 * - Pattern evaluation is synchronous (queryArc is pure) — no Worker needed for this
 *   because queryArc is fast (<1ms for typical patterns). Worker isolation is reserved
 *   for the full repl evaluation path if needed later.
 *
 * ┌──────────────────────────────┐
 * │   StrudelEngine (singleton)  │
 * │                              │
 * │  evaluateCode(code)          │──→ mini(code) → Pattern object
 * │  queryEvents(pattern, range) │──→ pattern.queryArc() → StrudelEvent[]
 * │  getPatternInfo(pattern)     │──→ analyze events → StrudelPatternInfo
 * │  bpmToCps(bpm)               │──→ BPM ↔ CPS conversion
 * └──────────────────────────────┘
 */

// Lazy-loaded Strudel modules (loaded on first use)
let miniModule: { mini: (code: string) => any } | null = null;

async function loadStrudelMini(): Promise<{ mini: (code: string) => any }> {
  if (!miniModule) {
    miniModule = await import('@strudel/mini');
  }
  return miniModule!;
}

/** A single event from a Strudel pattern query. */
export interface StrudelEvent {
  /** Start time in cycles (fractional). */
  startCycle: number;
  /** End time in cycles (fractional). */
  endCycle: number;
  /** Duration in cycles. */
  durationCycles: number;
  /** Whether this event starts at this position (vs continuing from a prior cycle). */
  hasOnset: boolean;
  /** The pattern value — typically { s: "bd" } for sounds or a number for notes. */
  value: Record<string, unknown> | string | number;
  /** Extracted sound name, if present. */
  sound?: string;
  /** Extracted MIDI note number, if present. */
  note?: number;
}

/** Pattern analysis info returned by getStrudelPatternInfo. */
export interface StrudelPatternInfo {
  noteCount: number;
  pitchRange: [number, number];
  instruments: string[];
  cycleLengthBars: number;
  rhythmicDensity: number;
  hasMelodicContent: boolean;
}

/**
 * Evaluate a Strudel mini-notation code string into a Pattern object.
 * Returns the pattern or throws on parse error.
 */
export async function evaluateStrudelCode(code: string): Promise<any> {
  const { mini } = await loadStrudelMini();
  // Strip comment lines and trim whitespace before evaluating as mini-notation
  const cleaned = code
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n')
    .trim();
  if (!cleaned) {
    // Empty pattern = silence
    return mini('~');
  }
  return mini(cleaned);
}

/**
 * Query a pattern for events in a given cycle range.
 * Pure function — no audio, no scheduler.
 */
export function queryPatternEvents(
  pattern: any,
  startCycle: number,
  endCycle: number,
): StrudelEvent[] {
  const haps = pattern.queryArc(startCycle, endCycle);
  return haps
    .filter((h: any) => h.hasOnset())
    .map((h: any) => {
      const v = h.value;
      // mini-notation produces string values ("bd"), s() produces objects ({s: "bd"})
      const sound = typeof v === 'string' ? v : (typeof v === 'object' ? (v.s ?? v.value) : undefined);
      const noteVal = typeof v === 'number' ? v : (typeof v === 'object' ? (v.note ?? v.n) : undefined);

      return {
        startCycle: h.whole.begin.valueOf(),
        endCycle: h.whole.end.valueOf(),
        durationCycles: h.duration?.valueOf() ?? (h.whole.end.valueOf() - h.whole.begin.valueOf()),
        hasOnset: true,
        value: v,
        sound: sound ? String(sound) : undefined,
        note: noteVal !== undefined ? Number(noteVal) : undefined,
      };
    });
}

/**
 * Analyze a pattern and return aggregate info.
 * Queries exactly 1 cycle (0 to 1).
 */
export function getPatternInfo(pattern: any, cycleLengthBars: number = 1): StrudelPatternInfo {
  const events = queryPatternEvents(pattern, 0, 1);

  const instruments = new Set<string>();
  let minPitch = 127;
  let maxPitch = 0;
  let hasMelodicContent = false;

  for (const e of events) {
    if (e.sound) instruments.add(e.sound);
    if (e.note !== undefined) {
      hasMelodicContent = true;
      minPitch = Math.min(minPitch, e.note);
      maxPitch = Math.max(maxPitch, e.note);
    }
  }

  return {
    noteCount: events.length,
    pitchRange: events.length > 0 && hasMelodicContent ? [minPitch, maxPitch] : [0, 0],
    instruments: [...instruments],
    cycleLengthBars,
    rhythmicDensity: events.length / 4, // events per beat (assuming 4 beats per cycle)
    hasMelodicContent,
  };
}

/** Convert DAW BPM to Strudel CPS (cycles per second). Default: 4 beats per cycle (4/4 time). */
export function bpmToCps(bpm: number, beatsPerCycle: number = 4): number {
  return bpm / 60 / beatsPerCycle;
}

/** Convert Strudel cycle time to seconds for Tone.js scheduling. */
export function cycleTimeToSeconds(cycleTime: number, cps: number): number {
  return cycleTime / cps;
}
