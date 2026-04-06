/** Parsed SFZ region with all supported opcodes. */
export interface SfzRegion {
  sample: string;
  lokey: number;
  hikey: number;
  lovel: number;
  hivel: number;
  pitchKeycenter: number;
  volume?: number;
  pan?: number;
  tune?: number;
}

export interface SfzParseResult {
  regions: SfzRegion[];
}

const NOTE_NAMES: Record<string, number> = {
  c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11,
};

/** Parse a note name like "c4", "f#3", "eb5" to a MIDI note number. */
function parseNoteOrNumber(value: string): number {
  const num = Number(value);
  if (!Number.isNaN(num)) return num;

  const match = value.toLowerCase().match(/^([a-g])(#|b)?(-?\d+)$/);
  if (!match) return 60;

  const [, letter, accidental, octaveStr] = match;
  const base = NOTE_NAMES[letter] ?? 0;
  const offset = accidental === '#' ? 1 : accidental === 'b' ? -1 : 0;
  const octave = Number(octaveStr);
  return (octave + 1) * 12 + base + offset;
}

type OpcodeMap = Record<string, string>;

function parseOpcodes(text: string): OpcodeMap {
  const opcodes: OpcodeMap = {};
  // Match key=value pairs. Value can contain non-space chars.
  const re = /(\w+)=(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    opcodes[m[1]] = m[2];
  }
  return opcodes;
}

function regionFromOpcodes(opcodes: OpcodeMap, groupDefaults: OpcodeMap): SfzRegion {
  const merged = { ...groupDefaults, ...opcodes };

  const region: SfzRegion = {
    sample: merged.sample ?? '',
    lokey: parseNoteOrNumber(merged.lokey ?? '0'),
    hikey: parseNoteOrNumber(merged.hikey ?? '127'),
    lovel: Number(merged.lovel ?? 0),
    hivel: Number(merged.hivel ?? 127),
    pitchKeycenter: parseNoteOrNumber(merged.pitch_keycenter ?? '60'),
  };

  if (merged.volume !== undefined) region.volume = Number(merged.volume);
  if (merged.pan !== undefined) region.pan = Number(merged.pan);
  if (merged.tune !== undefined) region.tune = Number(merged.tune);

  return region;
}

/** Parse SFZ format text into structured regions. */
export function parseSfz(sfzText: string): SfzParseResult {
  const regions: SfzRegion[] = [];
  let groupDefaults: OpcodeMap = {};

  // Remove comments and split into lines
  const lines = sfzText
    .split('\n')
    .map((l) => l.replace(/(?:\/\/|;).*$/, '').trim())
    .filter(Boolean);

  // Reassemble into a single stream and split by headers
  const stream = lines.join(' ');

  // Split by <header> tags
  const headerRe = /<(group|region|global|control|master)>/gi;
  const sections: { type: string; content: string }[] = [];
  let lastIdx = 0;
  let lastType = '';
  let match: RegExpExecArray | null;

  while ((match = headerRe.exec(stream)) !== null) {
    if (lastType) {
      sections.push({ type: lastType, content: stream.slice(lastIdx, match.index) });
    }
    lastType = match[1].toLowerCase();
    lastIdx = match.index + match[0].length;
  }
  if (lastType) {
    sections.push({ type: lastType, content: stream.slice(lastIdx) });
  }

  for (const section of sections) {
    const opcodes = parseOpcodes(section.content);

    if (section.type === 'group') {
      groupDefaults = opcodes;
    } else if (section.type === 'region') {
      if (opcodes.sample || groupDefaults.sample) {
        regions.push(regionFromOpcodes(opcodes, groupDefaults));
      }
    }
  }

  return { regions };
}
