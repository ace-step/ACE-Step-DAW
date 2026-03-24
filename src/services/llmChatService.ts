/**
 * LLM Chat Service
 * Calls OpenRouter (or any OpenAI-compatible provider) with DAW context.
 * Parses ACTION blocks from the response and executes them on the DAW.
 */

import { useProjectStore } from '../store/projectStore';
import { useGenerationStore } from '../store/generationStore';
import { TRACK_CATALOG } from '../constants/tracks';
import type { TrackName } from '../types/project';

const PROVIDERS_KEY = 'ace-step-daw-chat-providers';
const MODEL = 'google/gemini-2.0-flash-lite-001';

const MAX_DURATION_SECONDS = 270;

// Generation order: drums first (conditioned on silence), vocals last (conditioned on all)
const LEGO_TRACK_ORDER: TrackName[] = [
  'drums', 'bass', 'guitar', 'keyboard', 'percussion',
  'strings', 'synth', 'brass', 'woodwinds', 'backing_vocals', 'vocals',
];

const VOCAL_TRACKS = new Set<TrackName>(['vocals', 'backing_vocals']);

interface Provider {
  id: string;
  apiKey: string;
  baseUrl: string;
  enabled: boolean;
}

function getActiveProvider(): Provider | null {
  try {
    const stored = localStorage.getItem(PROVIDERS_KEY);
    if (!stored) return null;
    const providers: Provider[] = JSON.parse(stored);
    const or = providers.find((p) => p.id === 'openrouter' && p.apiKey);
    if (or) return or;
    return providers.find((p) => p.apiKey) ?? null;
  } catch {
    return null;
  }
}

function buildSystemPrompt(dawSummary: string): string {
  return `You are an expert music producer AI embedded inside ACE-Step DAW. You have deep knowledge of genre-specific sounds, BPMs, and production techniques.

## Current DAW State
${dawSummary}

---

## GENRE KNOWLEDGE — use these exact characteristics when matching a genre

**Trap / Drill**
- BPM: 130–170 (trap ~140, drill ~140–150)
- Drums: 808 kick with long decay, hard snare/clap on 2&4, trap hi-hat rolls (16th/32nd triplets), open hi-hat, rimshot, percs
- Bass: 808 sub bass with portamento pitch slides, heavy low end, distorted
- Synth: dark minor-key pads, haunting melismatic synths, ominous bells, distorted leads
- Vocals: male/female, autotune, melodic rap, ad-libs, aggressive delivery, trap flow

**Boom Bap / Classic Hip-Hop**
- BPM: 85–100
- Drums: punchy vinyl-sampled kick, crisp snare, swung hi-hats, rim shots, boom bap groove
- Bass: deep round bass, walking bass lines
- Synth/keyboard: soul samples, dusty piano, Rhodes, organ stabs

**Lo-fi Hip-Hop / Chill Hop**
- BPM: 70–90
- Drums: swung vinyl-textured drums, lazy kick, soft snare, subtle hi-hats, tape saturation
- Bass: warm mellow bass, simple root notes
- keyboard: dusty piano, warm Rhodes, jazz chords, vinyl crackle

**Pop**
- BPM: 100–130
- Drums: clean punchy kick, tight snare, steady four-on-the-floor or 2&4 snare, crisp hi-hats
- Bass: clean melodic bass, follows chord roots
- Synth/guitar: bright synth pads, clean electric guitar, catchy melodic hooks
- Vocals: female/male, clear polished singing, harmonies, hooky chorus

**House / Dance**
- BPM: 120–130
- Drums: four-on-the-floor kick, open hi-hat on offbeats, clap on 2&4, driving groove
- Bass: deep house bass, filtered bassline, sidechain pump
- Synth: lush house chords, stabs, atmospheric pads, piano chords

**R&B / Soul**
- BPM: 60–100
- Drums: smooth groove, soft kick, snappy snare, brush hi-hats
- Bass: smooth melodic bass, syncopated, soulful
- keyboard: warm Rhodes, smooth chords, gospel organ
- Vocals: female/male, soulful singing, runs, harmonies, sensual delivery

**Jazz**
- BPM: 120–200 (swing feel)
- Drums: jazz ride cymbal, brushed snare, walking time feel, swing groove
- Bass: upright bass, walking bass lines
- keyboard: jazz piano comping, chord voicings, improvisation

**Rock / Alternative**
- BPM: 100–160
- Drums: powerful kick, cracking snare, driving rock hi-hats, crash cymbals, rock groove
- bass: distorted bass guitar, follows guitar riffs
- guitar: crunchy electric guitar, power chords, distortion, riffs

**Afrobeats / Afropop**
- BPM: 95–115
- Drums: afro percussion, talking drum, shaker, cross-stick snare, bouncy kick pattern
- bass: warm bass, syncopated groove
- Vocals: male/female, melodic African-influenced singing, call and response

---

## ACTION: Full Multi-Track Song
Use when user asks for a full song or beat with 2+ instruments.

\`\`\`action
GENERATE_SONG
global_caption: dark trap, male vocals, 808 sub bass, trap hi-hats, minor key, 140 bpm
bpm: 140
duration: 180
drums: 808 kick long decay, hard snare, trap hi-hat rolls 32nd notes, open hi-hat, rim shots
bass: 808 sub bass portamento slides, heavy distorted low end, pitch bends
synth: dark minor key pad, ominous bells, haunting atmosphere
vocals: male, autotune, melodic trap flow, aggressive delivery
lyrics: [intro-short] ; [verse] On my wrist the ice glow. Moving through the night slow. ; [chorus] Trap life never change. Money never strange. ; [outro-short]
\`\`\`

### Rules
- global_caption: comma-separated genre tags describing the full song
- bpm: match the genre's typical range
- duration: seconds — **use these defaults based on request:**
  - "full song" or "song" → 180
  - "short song" or "quick" → 60
  - "beat" or "loop" → 30
  - "long song" or user specifies minutes → convert to seconds (e.g. 3 min = 180)
  - max 270
- Track lines: \`trackname: specific comma-separated production tags\` — BE SPECIFIC to the genre, not generic
- Valid track names: drums, bass, guitar, keyboard, percussion, strings, synth, brass, woodwinds, backing_vocals, vocals
- lyrics: ONLY when user wants vocals. Omit entirely for instrumentals.

---

## ACTION: Single Track
Use only for one instrument or a quick test.

\`\`\`action
GENERATE_MUSIC
prompt: dark trap, 808 kick long decay, trap hi-hat rolls, hard snare, 140 bpm
duration: 30
\`\`\`

---

## Lyrics Format
- Sections separated by semicolons ;
- Instrumental: [intro-short] [intro-medium] [inst-short] [inst-medium] [outro-short] [outro-medium]
- Vocal: [verse] [chorus] [bridge]  — sentences end with period
- Example: [intro-short] ; [verse] Line one. Line two. ; [chorus] Hook line. ; [outro-short]
- If user provided lyrics, use them — fit them to the structure, don't rewrite them

---

## Critical Rules
- ALWAYS match genre DNA — trap must sound like trap, not pop
- Use SPECIFIC production terms: "808 kick with long decay" not just "kick drum"
- Include BPM that matches the genre (trap=140, pop=120, boom bap=90, house=128)
- Duration: "full song" = 180s minimum, never use 30s for a full song request
- Always explain what you're generating BEFORE the action block
- Keep responses concise`;
}

interface ParsedTrackEntry {
  name: TrackName;
  description: string;
}

interface ParsedSongAction {
  type: 'generate_song';
  globalCaption: string;
  bpm: number;
  duration: number;
  lyrics?: string;
  tracks: ParsedTrackEntry[];
}

interface ParsedMusicAction {
  type: 'generate_music';
  prompt: string;
  duration: number;
  lyrics?: string;
}

type ParsedAction = ParsedSongAction | ParsedMusicAction;

function parseActions(text: string): { cleanText: string; actions: ParsedAction[] } {
  const actions: ParsedAction[] = [];
  const KNOWN_TRACKS = new Set<string>(LEGO_TRACK_ORDER);

  const cleanText = text.replace(/```action\n([\s\S]*?)```/g, (_match, body: string) => {
    const lines = body.trim().split('\n');
    const type = lines[0]?.trim();

    const get = (key: string) => {
      const line = lines.find((l) => l.startsWith(`${key}:`));
      return line ? line.slice(key.length + 1).trim() : undefined;
    };

    if (type === 'GENERATE_SONG') {
      const globalCaption = get('global_caption') ?? '';
      const bpm = parseInt(get('bpm') ?? '120', 10) || 120;
      const duration = parseInt(get('duration') ?? '30', 10) || 30;
      const lyrics = get('lyrics');

      // Parse per-track lines
      const tracks: ParsedTrackEntry[] = [];
      for (const line of lines.slice(1)) {
        const colonIdx = line.indexOf(':');
        if (colonIdx < 0) continue;
        const key = line.slice(0, colonIdx).trim().toLowerCase();
        const val = line.slice(colonIdx + 1).trim();
        if (KNOWN_TRACKS.has(key) && val) {
          tracks.push({ name: key as TrackName, description: val });
        }
      }

      // Sort tracks in LEGO generation order
      tracks.sort(
        (a, b) => LEGO_TRACK_ORDER.indexOf(a.name) - LEGO_TRACK_ORDER.indexOf(b.name),
      );

      if (tracks.length > 0) {
        actions.push({ type: 'generate_song', globalCaption, bpm, duration, lyrics, tracks });
      }
    } else if (type === 'GENERATE_MUSIC') {
      const prompt = get('prompt') ?? '';
      const duration = parseInt(get('duration') ?? '30', 10) || 30;
      const lyrics = get('lyrics');
      if (prompt) {
        actions.push({ type: 'generate_music', prompt, duration, lyrics });
      }
    }

    return ''; // remove block from displayed text
  }).trim();

  return { cleanText, actions };
}

async function executeActions(actions: ParsedAction[]): Promise<void> {
  for (const action of actions) {
    if (action.type === 'generate_song') {
      const projectStore = useProjectStore.getState();
      const genStore = useGenerationStore.getState();

      if (genStore.isGenerating) {
        console.warn('[llmChat] Already generating — skipping LEGO batch');
        continue;
      }

      // Clamp duration — long clips OOM on RTX 3060 (11.6 GB, model uses ~8 GB)
      const duration = Math.min(action.duration, MAX_DURATION_SECONDS);

      // Create one stems track + clip per requested instrument
      const batchTracks: Array<{ clipId: string; localDescription: string; lyrics?: string }> = [];

      for (const trackEntry of action.tracks) {
        const info = TRACK_CATALOG[trackEntry.name];
        const track = projectStore.addTrack(trackEntry.name, 'stems', {
          displayName: info.displayName,
          order: info.defaultOrder,
          color: info.color,
        });

        const isVocal = VOCAL_TRACKS.has(trackEntry.name);
        const clip = projectStore.addClip(track.id, {
          startTime: 0,
          duration,
          prompt: trackEntry.description,
          globalCaption: action.globalCaption,
          lyrics: isVocal ? (action.lyrics ?? '') : '',
          source: 'generated',
        });

        batchTracks.push({
          clipId: clip.id,
          localDescription: trackEntry.description,
          ...(isVocal && action.lyrics ? { lyrics: action.lyrics } : {}),
        });
      }

      // Set BPM on the generation form so the API receives the right value
      genStore.setGenerationBpm(action.bpm);

      // Small delay to let state settle
      await new Promise((r) => setTimeout(r, 150));

      // Dynamic import to avoid circular dependency (uiStore → llmChatService → generationPipeline → uiStore)
      const { generateBatch } = await import('./generationPipeline');

      // Use silence mode: all tracks generate in parallel from silence.
      // Each track uses the shared seed + globalCaption for musical coherence.
      // Context mode uploads large cumulative blobs and risks OOM on 3060.
      await generateBatch({
        mode: 'silence',
        globalCaption: action.globalCaption,
        tracks: batchTracks,
        sharedSeed: Math.floor(Math.random() * 2 ** 31),
      });

    } else if (action.type === 'generate_music') {
      // Single-track fallback
      const projectStore = useProjectStore.getState();
      const genStore = useGenerationStore.getState();

      let track = projectStore.project?.tracks.find((t) => t.trackType === 'stems');
      if (!track) {
        track = projectStore.addTrack('custom', 'stems', { displayName: 'AI Generated' });
      }

      genStore.setGenerationPrompt(action.prompt);
      genStore.setGenerationLengthSeconds(action.duration);
      genStore.setGenerationTargetTrack(track.id);
      if (action.lyrics) {
        genStore.setGenerationLyrics(action.lyrics);
      }

      await new Promise((r) => setTimeout(r, 100));
      genStore.submitGenerationRequest();
    }
  }
}

export async function* streamLLMResponse(
  question: string,
  dawSummary: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
): AsyncGenerator<{ chunk: string; actions?: ParsedAction[] }> {
  const provider = getActiveProvider();

  if (!provider) {
    yield { chunk: '__FALLBACK__' };
    return;
  }

  const messages = [
    ...conversationHistory.slice(-8),
    { role: 'user' as const, content: question },
  ];

  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${provider.apiKey}`,
      'HTTP-Referer': 'https://ace-step-daw',
      'X-Title': 'ACE-Step DAW',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: buildSystemPrompt(dawSummary) },
        ...messages,
      ],
      stream: true,
      max_tokens: 1024,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`LLM API error ${response.status}: ${err}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') {
        const { cleanText, actions } = parseActions(fullText);
        if (actions.length > 0) {
          await executeActions(actions);
          const actionMsg = actions
            .map((a) => {
              if (a.type === 'generate_song') {
                const trackList = a.tracks.map((t) => t.name).join(', ');
                const clampedDur = Math.min(a.duration, MAX_DURATION_SECONDS);
                const clamped = clampedDur < a.duration ? ` (capped at ${clampedDur}s)` : '';
                return `\n\n🎵 *Generating ${a.tracks.length} tracks (${trackList}) — ${clampedDur}s each${clamped}*`;
              }
              return `\n\n🎵 *Generating: "${a.prompt}" (${a.duration}s)*`;
            })
            .join('');
          yield { chunk: actionMsg, actions };
        }
        return;
      }
      try {
        const json = JSON.parse(data);
        const chunk: string = json.choices?.[0]?.delta?.content ?? '';
        if (chunk) {
          fullText += chunk;
          // Don't stream tokens that are inside an action block
          const inActionBlock =
            (fullText.match(/```action/g) ?? []).length >
            (fullText.match(/```action[\s\S]*?```/g) ?? []).length;
          if (!inActionBlock) {
            yield { chunk };
          }
        }
      } catch {
        // ignore parse errors on partial chunks
      }
    }
  }
}
