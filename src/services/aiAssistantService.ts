import type { AIChatContext } from '../utils/aiAssistantContext';
import type { InlineSuggestion } from '../types/suggestions';
import type { Project } from '../types/project';

const DEFAULT_STREAM_DELAY_MS = 18;

export function getAssistantSuggestions(context: AIChatContext): string[] {
  if (!context.hasProject) {
    return [
      'How do I start a new song in ACE-Step?',
      'What track should I add first for a lo-fi beat?',
      'Show me the most useful ACE-Step shortcuts.',
    ];
  }

  if (context.focusedTrack?.trackType === 'sequencer' || /drum/i.test(context.focusedTrack?.displayName ?? '')) {
    return [
      'How do I make this drum track punch harder?',
      'What compressor settings fit this drum track?',
      'How should I balance kick, snare, and hats?',
    ];
  }

  if (/vocal/i.test(context.focusedTrack?.displayName ?? '')) {
    return [
      'Suggest an effects chain for this vocal track.',
      'How can I keep this vocal clear in the mix?',
      'What reverb and delay settings fit this vocal?',
    ];
  }

  return [
    'How should I balance this mix?',
    'What should I work on next in this project?',
    'Show shortcuts for the panels I have open.',
  ];
}

export function generateAssistantResponse(question: string, context: AIChatContext): string {
  const q = question.toLowerCase();
  const intro = buildIntro(context);

  if (!context.hasProject) {
    return `${intro}\n\nStart by creating a project, then add one track with Cmd+Shift+I. Once the project exists, I can give track-specific advice, explain panels, and recommend settings based on your actual session.`;
  }

  if (q.includes('drum') && (q.includes('punch') || q.includes('hard') || q.includes('hit'))) {
    const focused = context.focusedTrack?.displayName ?? 'your drum track';
    return `${intro}\n\nFor ${focused}, start with transient-first cleanup before adding loudness.\n\n1. Keep the kick peak clear. Cut 200-350 Hz if it feels boxy, then add a small 3-5 kHz boost for click.\n2. Use compression with a medium attack so the transient survives. A practical starting point is threshold around -12 dB, ratio 4:1, attack 10-20 ms, release 60-120 ms.\n3. Keep reverb short or off on the main kick/snare path. Long tails soften impact.\n4. If the groove still feels flat, add light saturation after compression.\n\nInside ACE-Step, open the Mixer with X or the Effect Chain from the focused track and adjust compressor, EQ, and saturation in that order.`;
  }

  if (q.includes('compressor') || q.includes('compression')) {
    return `${intro}\n\nCompression is most useful when you decide what you want first: peak control, sustain, or glue.\n\n- Peak control: fast attack, medium release, moderate ratio.\n- Punch: slower attack so the transient gets through.\n- Glue on a bus: low ratio, 1-3 dB of gain reduction.\n\nFor this session, start with threshold low enough to see consistent gain reduction, then tune attack/release by ear against the groove at ${context.projectBpm ?? 'the current'} BPM.`;
  }

  if (q.includes('effect') && q.includes('vocal')) {
    return `${intro}\n\nA safe starting vocal chain is EQ -> compression -> de-ess if needed -> delay/reverb sends.\n\n- High-pass around 80-100 Hz.\n- Cut a little 200-350 Hz if the vocal sounds cloudy.\n- Use 3:1 compression with 3-6 dB of gain reduction.\n- Add short plate or room reverb with pre-delay so the vocal stays forward.\n- Use tempo-synced delay sparingly for depth.\n\nIf you focus the vocal track first, I can tailor the advice to its current effects and level.`;
  }

  if (q.includes('eq') || q.includes('equaliz')) {
    return `${intro}\n\nUse EQ to create separation, not to make every track sound big in solo.\n\n- Remove low-end rumble from non-bass parts.\n- Cut muddy low-mids before boosting highs.\n- Make kick and bass complement each other instead of boosting both in the same range.\n- Compare with the full mix playing, not only the isolated track.\n\nIf you tell me which track you are shaping, I can suggest likely problem ranges for that source.`;
  }

  if (q.includes('bpm') || q.includes('tempo')) {
    return `${intro}\n\nCommon tempo ranges:\n\n- Lo-fi hip hop: 70-90 BPM\n- Pop: 100-130 BPM\n- House: 120-130 BPM\n- Trap: 130-160 BPM with half-time feel\n- Drum and bass: 160-180 BPM\n\nYour project is currently at ${context.projectBpm ?? 'an unset'} BPM, so choose whether you want the song to feel more laid back or more driving before you move it.`;
  }

  if (q.includes('mix') || q.includes('balance')) {
    const trackCount = context.trackCount ?? 0;
    return `${intro}\n\nFor this ${trackCount}-track session, balance in this order:\n\n1. Set fader relationships before adding more processing.\n2. Keep kick, bass, lead vocal, or main hook as the anchor.\n3. Pan supporting parts away from the center to open space.\n4. Use EQ cuts to reduce masking before boosting presence.\n5. Check the mixer while the full arrangement plays, not clip-by-clip.\n\nIf you want, ask me for a per-track balance pass and I’ll prioritize the current arrangement.`;
  }

  if (q.includes('shortcut') || q.includes('keyboard')) {
    const panels = context.activePanels.length > 0 ? context.activePanels.join(', ') : 'no extra panels';
    return `${intro}\n\nUseful shortcuts for the current workspace:\n\n- Cmd+/ opens this assistant\n- X toggles Mixer\n- Y toggles Library\n- O toggles Loop Browser\n- B toggles Smart Controls\n- ? opens the full shortcuts dialog\n- Cmd+G opens batch generation\n- Cmd+Enter generates the selected clip\n\nRight now you have ${panels} open, so X, Y, O, and B are the quickest panel-navigation keys.`;
  }

  if (q.includes('generate') || (q.includes('ai') && q.includes('music'))) {
    return `${intro}\n\nFor ACE-Step generation, keep the prompt concrete: genre, motion, instrument role, and energy. Then generate against the right context.\n\n- Use Cmd+Enter for a selected clip.\n- Use Cmd+G for a broader batch pass.\n- Use context generation when you want a new part to match the existing arrangement.\n\nIf you tell me the role you need next, like bass, pad, or drums, I can help write the prompt.`;
  }

  return `${intro}\n\nI can answer production, arrangement, mixing, sound-design, and ACE-Step workflow questions. Try asking about the focused track, a specific effect chain, or how to improve the current arrangement based on the visible panels and project tempo.`;
}

export async function* streamAssistantResponse(
  question: string,
  context: AIChatContext,
  delayMs = DEFAULT_STREAM_DELAY_MS,
): AsyncGenerator<string> {
  const response = generateAssistantResponse(question, context);
  const chunks = chunkResponse(response);

  for (const chunk of chunks) {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    yield chunk;
  }
}

function buildIntro(context: AIChatContext): string {
  if (!context.hasProject) {
    return 'No project is loaded yet, so I can only give generic startup guidance.';
  }

  const parts = [
    `I’m looking at "${context.projectName}"`,
    context.projectBpm ? `running at ${context.projectBpm} BPM` : null,
    context.focusedTrack ? `with ${context.focusedTrack.displayName} in focus` : null,
  ].filter(Boolean);

  const panels = context.activePanels.length > 0
    ? ` Active panels: ${context.activePanels.join(', ')}.`
    : '';

  return `${parts.join(' ')}.${panels}`;
}

/**
 * Analyze the current arrangement and produce inline suggestions.
 * Suggestions are passive — they are displayed but never auto-applied.
 *
 * Accepts either a Project directly or falls back to AIChatContext for
 * basic project info.
 */
export function getArrangementSuggestions(
  context: AIChatContext,
  project?: Project | null,
): InlineSuggestion[] {
  if (!context.hasProject || !context.trackCount) return [];

  const suggestions: InlineSuggestion[] = [];
  let nextId = 1;
  const mkId = () => `sug-${nextId++}-${Date.now()}`;

  let latestClipEnd = 0;

  if (project) {
    // Directly inspect tracks and clips
    for (const track of project.tracks) {
      const trackClips = track.clips;
      if (trackClips.length === 0) {
        suggestions.push({
          id: mkId(),
          text: `${track.displayName ?? track.trackName} track is empty — try generating a clip to fill it`,
          time: 0,
          trackId: track.id,
          type: 'fill',
        });
      }
      for (const clip of trackClips) {
        const clipEnd = clip.startTime + clip.duration;
        if (clipEnd > latestClipEnd) latestClipEnd = clipEnd;
      }
    }
  } else {
    // Fall back to parsing summary
    const trackLines = context.summary.split('\n').filter((l) => l.startsWith('  - '));
    for (const line of trackLines) {
      const clipMatch = line.match(/(\d+)\s*clip/);
      const nameMatch = line.match(/^\s*-\s*(\S+)/);
      const clipCount = clipMatch ? parseInt(clipMatch[1], 10) : 0;
      const trackName = nameMatch ? nameMatch[1] : '';
      if (clipCount === 0 && trackName) {
        suggestions.push({
          id: mkId(),
          text: `${trackName} track is empty — try generating a clip to fill it`,
          time: 0,
          type: 'fill',
        });
      }
    }
  }

  // "What comes next?" suggestion at the end of the arrangement
  if (latestClipEnd > 0) {
    suggestions.push({
      id: mkId(),
      text: 'What should come next? Consider adding a new section or variation.',
      time: latestClipEnd,
      type: 'next',
    });
  } else if (context.trackCount > 0) {
    suggestions.push({
      id: mkId(),
      text: 'Start your arrangement — generate clips for your tracks.',
      time: 0,
      type: 'next',
    });
  }

  // Energy/arrangement suggestion if there are multiple clips
  if (latestClipEnd > 30) {
    suggestions.push({
      id: mkId(),
      text: 'Consider adding a build-up or transition around the midpoint.',
      time: Math.round(latestClipEnd / 2),
      type: 'arrangement',
    });
  }

  return suggestions;
}

function chunkResponse(response: string): string[] {
  const paragraphs = response.split('\n');
  const chunks: string[] = [];

  for (const paragraph of paragraphs) {
    if (paragraph === '') {
      chunks.push('\n');
      continue;
    }

    const words = paragraph.split(' ');
    for (let index = 0; index < words.length; index += 8) {
      const slice = words.slice(index, index + 8).join(' ');
      chunks.push(index + 8 < words.length ? `${slice} ` : slice);
    }
    chunks.push('\n');
  }

  if (chunks[chunks.length - 1] === '\n') {
    chunks.pop();
  }

  return chunks;
}
