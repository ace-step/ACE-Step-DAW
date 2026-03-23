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
    // MUST be awaited — bounce needs samples loaded before evaluating patterns
    if (webaudioMod.samples) {
      await webaudioMod.samples('github:tidalcycles/dirt-samples').catch(() => {
        // Sample loading failed — synth patterns still work, but s("bd") etc. won't
        console.warn('[StrudelEngine] Failed to load default samples from CDN');
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

/**
 * Extract MIDI notes from a strudel pattern for N cycles.
 *
 * Fast path: no audio rendering. Parses the pattern, queries events via
 * queryArc, and converts to MidiNote[] compatible with the DAW's pianoRoll.
 * Returns instantly — no real-time waiting.
 */
export async function extractStrudelMidiNotes(
  code: string,
  bars: number,
  bpm: number,
  beatsPerBar: number = 4,
): Promise<{ notes: Array<{ pitch: number; startBeat: number; durationBeats: number; velocity: number }>; instruments: string[] }> {
  await ensureStrudelLoaded();

  const cleanCode = code
    .split('\n')
    .filter((line: string) => !line.trimStart().startsWith('//'))
    .join('\n')
    .replace(/^\$:\s*/gm, '')
    .trim();

  if (!cleanCode) return { notes: [], instruments: [] };

  // Evaluate Strudel JS code to get a Pattern object.
  // ensureStrudelLoaded() registers note(), s(), sound(), bank(), etc. on globalThis.
  // We use new Function() (not eval) because eval inside an ES module resolves to
  // module scope where globalThis DSL functions aren't visible. new Function()
  // always evaluates in global scope.
  let pattern: any;
  try {
    const fn = new Function(`return (async () => { return ${cleanCode} })()`) as () => Promise<any>;
    pattern = await fn();
  } catch {
    // Fallback: try without return wrapper (multi-line code)
    try {
      const fn = new Function(`return (async () => { ${cleanCode} })()`) as () => Promise<any>;
      pattern = await fn();
    } catch {
      // Last resort: try mini-notation
      try {
        const { mini } = await import('@strudel/mini');
        pattern = mini(cleanCode);
      } catch { return { notes: [], instruments: [] }; }
    }
  }

  if (!pattern?.queryArc) return { notes: [], instruments: [] };

  const cps = bpmToCps(bpm, beatsPerBar);
  const totalCycles = bars; // 1 bar = 1 cycle by default
  const events = pattern.queryArc(0, totalCycles);

  const notes: Array<{ pitch: number; startBeat: number; durationBeats: number; velocity: number }> = [];
  const instruments = new Set<string>();

  for (const hap of events) {
    if (!hap.hasOnset?.()) continue;

    const val = hap.value ?? {};
    const startCycle = typeof hap.whole?.begin?.valueOf === 'function' ? hap.whole.begin.valueOf() : 0;
    const endCycle = typeof hap.whole?.end?.valueOf === 'function' ? hap.whole.end.valueOf() : startCycle + 0.25;
    const durationCycles = endCycle - startCycle;

    // Convert cycle time to beats
    const startBeat = startCycle * beatsPerBar;
    const durationBeats = Math.max(durationCycles * beatsPerBar, 0.125);

    // Extract pitch (MIDI note number)
    let pitch = 60; // default C4
    if (typeof val === 'object') {
      if ('note' in val && typeof val.note === 'number') pitch = val.note;
      else if ('n' in val && typeof val.n === 'number') pitch = val.n;
      else if ('freq' in val && typeof val.freq === 'number') pitch = Math.round(12 * Math.log2((val.freq as number) / 440) + 69);
      if ('s' in val) instruments.add(String(val.s));
      if ('sound' in val) instruments.add(String(val.sound));
    }

    const velocity = typeof val === 'object' && 'gain' in val ? Math.min(1, Number(val.gain)) : 0.8;

    notes.push({ pitch, startBeat, durationBeats: Math.round(durationBeats * 1000) / 1000, velocity });
  }

  return { notes, instruments: [...instruments] };
}

/**
 * Render a strudel pattern to an AudioBuffer using OfflineAudioContext.
 *
 * Replicates the approach from strudel's own `renderPatternAudio()`
 * (node_modules/@strudel/webaudio/webaudio.mjs:40-103):
 *
 * 1. Save the current superdough AudioContext + controller
 * 2. Create an OfflineAudioContext
 * 3. Reset superdough to use the offline context
 * 4. Evaluate code → Pattern object
 * 5. Query events via pattern.queryArc() → schedule each via superdough()
 * 6. Render via offlineCtx.startRendering() → AudioBuffer
 * 7. Restore original context + controller
 *
 * This is FAST (no real-time waiting) and produces the EXACT audio that
 * superdough would play — samples, effects, banks, everything.
 */
export async function renderStrudelOffline(
  code: string,
  durationSeconds: number,
  bpm: number,
  sampleRate: number = 48_000,
  onProgress?: (progress: number) => void,
): Promise<AudioBuffer> {
  await ensureStrudelLoaded();

  const {
    getAudioContext, setAudioContext,
    getSuperdoughAudioController, setSuperdoughAudioController,
    initAudio, resetGlobalEffects,
  } = await import('@strudel/webaudio') as any;
  const { superdough: superdoughFn } = await import('superdough') as any;
  const { SuperdoughAudioController } = await import('superdough/superdoughoutput.mjs') as any;

  // ── Save original state ──
  const origCtx = getAudioContext();
  const origController = getSuperdoughAudioController();

  const cps = bpmToCps(bpm);
  const totalCycles = durationSeconds * cps; // bars (mathematically equivalent)
  const totalSamples = Math.ceil(durationSeconds * sampleRate);

  try {
    onProgress?.(0.1);

    // ── Evaluate code → Pattern object ──
    const cleanCode = code
      .split('\n')
      .filter((line: string) => !line.trimStart().startsWith('//'))
      .join('\n')
      .replace(/^\$:\s*/gm, '')
      .trim();

    if (!cleanCode) throw new Error('No strudel code to render');

    // Evaluate in global scope where s(), note(), bank() etc. are registered
    let pattern: any;
    try {
      const fn = new Function(`return (async () => { return ${cleanCode} })()`) as () => Promise<any>;
      pattern = await fn();
    } catch {
      try {
        const fn = new Function(`return (async () => { ${cleanCode} })()`) as () => Promise<any>;
        pattern = await fn();
      } catch (e) {
        throw new Error(`Failed to evaluate strudel code: ${e instanceof Error ? e.message : e}`);
      }
    }

    if (!pattern?.queryArc) {
      throw new Error('Strudel code did not return a valid pattern');
    }

    onProgress?.(0.2);

    // ── Create OfflineAudioContext + reset superdough ──
    const offlineCtx = new OfflineAudioContext(2, totalSamples, sampleRate);
    setAudioContext(offlineCtx);
    setSuperdoughAudioController(new SuperdoughAudioController(offlineCtx));
    await initAudio();

    onProgress?.(0.3);

    // ── Query pattern events and schedule via superdough ──
    // Sort by onset time (required for controls like `cut`)
    const haps = pattern
      .queryArc(0, totalCycles, { _cps: cps })
      .sort((a: any, b: any) => a.whole.begin.valueOf() - b.whole.begin.valueOf());

    for (let i = 0; i < haps.length; i++) {
      const hap = haps[i];
      if (hap.hasOnset?.()) {
        try {
          // Convert string values to object format (e.g. "bd" → {s: "bd"})
          if (hap.ensureObjectValue) hap.ensureObjectValue();
          const onset = hap.whole.begin.valueOf() / cps;
          const hapDuration = (typeof hap.duration?.valueOf === 'function' ? hap.duration.valueOf() : (hap.whole.end.valueOf() - hap.whole.begin.valueOf())) / cps;
          await superdoughFn(hap.value, onset, hapDuration, cps, hap.whole.begin.valueOf() / cps);
        } catch {
          // Skip individual haps that fail (e.g. missing samples)
        }
      }
      // Report progress during scheduling
      if (i % 20 === 0) onProgress?.(0.3 + 0.4 * (i / haps.length));
    }

    onProgress?.(0.8);

    // ── Render ──
    const audioBuffer = await offlineCtx.startRendering();

    onProgress?.(1.0);
    return audioBuffer;
  } finally {
    // ── Always restore original state ──
    setAudioContext(origCtx);
    setSuperdoughAudioController(origController);
    resetGlobalEffects();
  }
}
