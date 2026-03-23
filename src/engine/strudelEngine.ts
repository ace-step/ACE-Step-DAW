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

    // Load drum samples via @strudel/webaudio (same superdough singleton).
    // Do NOT use @strudel/repl's prebake — Vite bundles it as a separate module
    // with its own superdough instance, so samples register in the wrong place.
    if (webaudioMod.samples) {
      const ds = 'https://raw.githubusercontent.com/felixroos/dough-samples/main';
      await Promise.allSettled([
        webaudioMod.samples('github:tidalcycles/dirt-samples'),
        webaudioMod.samples(`${ds}/tidal-drum-machines.json`),
      ]);
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
 * Evaluate full Strudel JS code (s(), note(), bank(), etc.) and return the
 * pattern object — **without** starting audio playback.
 *
 * This loads the full Strudel scope (s, note, bank, stack, …) onto globalThis,
 * then evaluates the code as an async expression. Use this for pattern analysis
 * and conversion (freeze-to-MIDI, freeze-to-drums) where you need the real
 * pattern from `s("bd sd")` rather than mini-notation parsing.
 */
export async function evaluateStrudelPatternPure(code: string): Promise<any> {
  await ensureStrudelLoaded();

  const cleaned = code
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .map((line) => {
      const trimmed = line.trimStart();
      if (trimmed.startsWith('$:')) return line.replace(/\$:\s*/, '');
      return line;
    })
    .join('\n')
    .trim();

  if (!cleaned) return null;

  // After ensureStrudelLoaded, s/note/bank/stack/etc. are on globalThis.
  // Evaluate the code as a JS expression to get the Pattern object.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const AsyncFunction = Object.getPrototypeOf(async function () {/* */}).constructor;
  try {
    // Try as expression first (common case: `s("bd sd").bank("tr909")`)
    const fn = new AsyncFunction(`return (${cleaned})`);
    return await fn();
  } catch {
    // Fall back to statement evaluation (multi-line code with let/const)
    try {
      const fn = new AsyncFunction(cleaned);
      return await fn();
    } catch {
      // Last resort: try mini-notation
      return evaluateMiniNotation(cleaned);
    }
  }
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
 * Render a strudel pattern to an AudioBuffer via real-time playback + recording.
 *
 * Why not OfflineAudioContext: superdough lazy-fetches samples via network.
 * OfflineAudioContext.startRendering() completes before fetches finish → silence.
 *
 * Approach:
 * 1. Create a webaudioRepl (properly initializes superdough + samples + worklets)
 * 2. Evaluate the code → real-time audio playback begins
 * 3. Record from superdough's destinationGain via MediaRecorder
 * 4. Wait for durationSeconds (user hears the pattern play)
 * 5. Stop, decode recording → AudioBuffer
 *
 * Trade-off: takes real-time (4 bars at 120 BPM = 8 seconds) but captures
 * the EXACT audio superdough produces — samples, effects, banks, everything.
 */
export async function renderStrudelOffline(
  code: string,
  durationSeconds: number,
  bpm: number,
  _sampleRate: number = 48_000,
  onProgress?: (progress: number) => void,
): Promise<AudioBuffer> {
  await ensureStrudelLoaded();

  const { webaudioRepl, getAudioContext, getSuperdoughAudioController } = await import('@strudel/webaudio') as any;
  const { transpiler } = await import('@strudel/transpiler') as any;

  const cleanCode = code
    .split('\n')
    .filter((line: string) => !line.trimStart().startsWith('//'))
    .join('\n')
    .replace(/^\$:\s*/gm, '')
    .trim();

  if (!cleanCode) throw new Error('No strudel code to render');

  // Create repl WITH transpiler — this is critical!
  // Without transpiler, mini-notation strings like "[bd hh]*2" are not parsed
  // and get treated as literal sound/note names → "not a note" errors.
  const repl = webaudioRepl({ transpiler });
  const cps = bpmToCps(bpm);
  repl.setCps?.(cps);

  // Start real-time playback (transpiler converts mini-notation → proper Pattern)
  await repl.evaluate(cleanCode);
  onProgress?.(0.1);

  // Give superdough a moment to initialize its audio graph + fetch first samples
  await new Promise((r) => setTimeout(r, 500));

  // Tap superdough's final output node for recording
  const ctx: AudioContext = getAudioContext();
  const controller = getSuperdoughAudioController();
  const outputGain: GainNode | null = controller?.output?.destinationGain ?? null;

  if (!outputGain) {
    repl.stop?.();
    throw new Error('Could not access superdough output for recording');
  }

  const captureNode = ctx.createMediaStreamDestination();
  outputGain.connect(captureNode);

  // Record via MediaRecorder
  const recorder = new MediaRecorder(captureNode.stream, {
    mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus' : 'audio/webm',
  });
  const chunks: Blob[] = [];
  const recordingDone = new Promise<Blob>((resolve) => {
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType }));
  });
  recorder.start(200); // collect chunks every 200ms

  // Wait for the pattern to play, reporting progress
  const startTime = Date.now();
  const totalMs = durationSeconds * 1000;
  await new Promise<void>((resolve) => {
    const tick = () => {
      const elapsed = Date.now() - startTime;
      onProgress?.(0.1 + 0.8 * Math.min(1, elapsed / totalMs));
      if (elapsed >= totalMs) { resolve(); return; }
      requestAnimationFrame(tick);
    };
    tick();
  });

  // Stop recording and playback
  recorder.stop();
  try { repl.stop?.(); } catch { /* ignore */ }
  try { outputGain.disconnect(captureNode); } catch { /* ignore */ }

  onProgress?.(0.95);

  const blob = await recordingDone;
  if (blob.size < 100) {
    throw new Error('Recording produced no audio data');
  }

  // Decode to AudioBuffer
  const arrayBuffer = await blob.arrayBuffer();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

  onProgress?.(1.0);
  return audioBuffer;
}
