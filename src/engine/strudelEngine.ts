/**
 * StrudelEngine — Live audio playback for strudel tracks using @strudel/webaudio.
 *
 * Architecture:
 * - Each strudel track gets its own webaudioRepl instance
 * - repl.evaluate(code) handles BOTH parsing AND scheduling audio
 * - Supports the full Strudel JavaScript API: s(), note(), bank(), stack(), etc.
 * - Audio output goes through superdough (Strudel's audio engine)
 * - Transport sync: start/stop/BPM forwarded from DAW transport
 *
 * ┌─────────────────────────────────────────────┐
 * │          StrudelEngine (singleton map)       │
 * │                                              │
 * │  Track A → webaudioRepl instance             │
 * │    └─ evaluate(code) → audio output          │
 * │    └─ start() / stop() / setCps()            │
 * │                                              │
 * │  Track B → webaudioRepl instance             │
 * │    └─ evaluate(code) → audio output          │
 * │    └─ start() / stop() / setCps()            │
 * └─────────────────────────────────────────────┘
 */

// ─── Types ──────────────────────────────────────────────────

/** A single event from a Strudel pattern query. */
export interface StrudelEvent {
  startCycle: number;
  endCycle: number;
  durationCycles: number;
  hasOnset: boolean;
  value: Record<string, unknown> | string | number;
  sound?: string;
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

/** State of a per-track strudel repl instance. */
interface TrackRepl {
  repl: any;
  isPlaying: boolean;
  lastCode: string;
  lastError: string | null;
}

// ─── Singleton State ────────────────────────────────────────

const trackRepls = new Map<string, TrackRepl>();
let webaudioReplFactory: ((opts?: any) => any) | null = null;
let scopeRegistered = false;

/**
 * Lazily load @strudel/webaudio and register Strudel controls on globalThis.
 * Must be called from a user gesture context (click/keydown).
 */
async function ensureStrudelLoaded(): Promise<void> {
  if (!webaudioReplFactory) {
    const mod = await import('@strudel/webaudio');
    webaudioReplFactory = mod.webaudioRepl;
  }
  // Register s(), note(), bank(), etc. on globalThis so repl.evaluate() can find them.
  // Also register mini-notation string parser and initialize audio engine.
  if (!scopeRegistered) {
    const core = await import('@strudel/core') as any;
    const miniMod = await import('@strudel/mini') as any;
    const webaudioMod = await import('@strudel/webaudio') as any;

    // Enable mini-notation parsing for all string arguments in pattern functions
    if (miniMod.miniAllStrings) {
      miniMod.miniAllStrings();
    }

    // Initialize superdough audio engine (registers synth sounds + loads worklets)
    if (webaudioMod.registerSynthSounds) {
      webaudioMod.registerSynthSounds();
    }
    if (webaudioMod.initAudio) {
      await webaudioMod.initAudio();
    }

    // Register all Strudel functions on globalThis for repl.evaluate()
    const evalScope = core.evalScope;
    if (evalScope) {
      await evalScope(
        import('@strudel/core'),
        import('@strudel/mini'),
        import('@strudel/webaudio'),
      );
    }

    // Load default drum/instrument samples from Strudel's CDN
    // This enables bank("RolandTR909"), bank("RolandTR808"), etc.
    if (webaudioMod.samples) {
      webaudioMod.samples('github:tidalcycles/dirt-samples').catch(() => {
        // Non-blocking — samples load on demand, patterns work with synths meanwhile
      });
    }

    scopeRegistered = true;
  }
}

/**
 * Get or create a webaudioRepl for a track.
 */
async function getOrCreateRepl(trackId: string): Promise<TrackRepl> {
  let entry = trackRepls.get(trackId);
  if (entry) return entry;

  await ensureStrudelLoaded();

  const replInstance = webaudioReplFactory!({
    id: trackId,
  });

  entry = {
    repl: replInstance,
    isPlaying: false,
    lastCode: '',
    lastError: null,
  };

  trackRepls.set(trackId, entry);
  return entry;
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Evaluate Strudel code for a track. This handles:
 * - Full Strudel JS API: s("bd sd").bank("tr909"), note("c3 e3"), etc.
 * - Mini-notation: "bd sd bd sd" (auto-wrapped in s())
 * - $: prefix patterns
 * - Audio starts automatically on evaluate
 *
 * Call from a user gesture (click/keydown) to ensure AudioContext is allowed.
 */
export async function evaluateStrudelCode(
  code: string,
  trackId?: string,
): Promise<any> {
  // If no trackId, use pure mini-notation evaluation (for tests/analysis)
  if (!trackId) {
    return evaluateMiniNotation(code);
  }

  const entry = await getOrCreateRepl(trackId);

  // Strip comments and handle $: prefix (REPL syntax that requires transpiler)
  const stripped = code
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .map((line) => {
      // Strip $: prefix — it's Strudel REPL syntax that requires a transpiler.
      // Without transpiler, convert "$: expr" → "expr" (equivalent for single-pattern use)
      const trimmed = line.trimStart();
      if (trimmed.startsWith('$:')) {
        return line.replace(/\$:\s*/, '');
      }
      return line;
    })
    .join('\n')
    .trim();

  if (!stripped) {
    entry.repl.stop();
    entry.isPlaying = false;
    entry.lastError = null;
    return null;
  }

  try {
    const pattern = await entry.repl.evaluate(stripped);
    entry.lastCode = code;
    entry.isPlaying = true;
    entry.lastError = null;
    return pattern;
  } catch (err) {
    entry.lastError = err instanceof Error ? err.message : String(err);
    throw err;
  }
}

/**
 * Pure mini-notation evaluation (no audio, for tests and pattern analysis).
 */
async function evaluateMiniNotation(code: string): Promise<any> {
  const { mini } = await import('@strudel/mini');
  const cleaned = code
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n')
    .trim();
  if (!cleaned) return mini('~');
  return mini(cleaned);
}

/**
 * Stop a strudel track's audio playback.
 */
export function stopStrudelTrack(trackId: string): void {
  const entry = trackRepls.get(trackId);
  if (entry) {
    entry.repl.stop();
    entry.isPlaying = false;
  }
}

/**
 * Start a strudel track's audio playback (re-evaluates last code).
 */
export async function startStrudelTrack(trackId: string): Promise<void> {
  const entry = trackRepls.get(trackId);
  if (entry && entry.lastCode) {
    entry.repl.start();
    entry.isPlaying = true;
  }
}

/**
 * Set BPM for a strudel track (converts to CPS).
 */
export function setStrudelBpm(trackId: string, bpm: number, beatsPerCycle: number = 4): void {
  const entry = trackRepls.get(trackId);
  if (entry) {
    const cps = bpm / 60 / beatsPerCycle;
    entry.repl.setCps(cps);
  }
}

/**
 * Set BPM for ALL active strudel tracks.
 */
export function setAllStrudelBpm(bpm: number, beatsPerCycle: number = 4): void {
  const cps = bpm / 60 / beatsPerCycle;
  for (const entry of trackRepls.values()) {
    entry.repl.setCps(cps);
  }
}

/**
 * Stop all strudel tracks.
 */
export function stopAllStrudelTracks(): void {
  for (const entry of trackRepls.values()) {
    entry.repl.stop();
    entry.isPlaying = false;
  }
}

/**
 * Start all strudel tracks that have code.
 */
export function startAllStrudelTracks(): void {
  for (const entry of trackRepls.values()) {
    if (entry.lastCode) {
      entry.repl.start();
      entry.isPlaying = true;
    }
  }
}

/**
 * Remove a track's repl instance (on track deletion).
 */
export function removeStrudelTrack(trackId: string): void {
  const entry = trackRepls.get(trackId);
  if (entry) {
    entry.repl.stop();
    trackRepls.delete(trackId);
  }
}

/**
 * Check if a track has an active repl.
 */
export function hasStrudelRepl(trackId: string): boolean {
  return trackRepls.has(trackId);
}

/**
 * Get the last error for a track.
 */
export function getStrudelError(trackId: string): string | null {
  return trackRepls.get(trackId)?.lastError ?? null;
}

// ─── Pattern Analysis (pure, no audio) ──────────────────────

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
    rhythmicDensity: events.length / 4,
    hasMelodicContent,
  };
}

/** Convert DAW BPM to Strudel CPS. */
export function bpmToCps(bpm: number, beatsPerCycle: number = 4): number {
  return bpm / 60 / beatsPerCycle;
}

/** Convert Strudel cycle time to seconds. */
export function cycleTimeToSeconds(cycleTime: number, cps: number): number {
  return cycleTime / cps;
}
