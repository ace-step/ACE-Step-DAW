/**
 * Types for AI chord suggestion system (ChordSeqAI integration).
 *
 * Tier 1: Client-side ONNX inference for next-chord prediction.
 */

/** A chord in the suggestion vocabulary. */
export interface ChordToken {
  /** Unique token index (0-based). */
  index: number;
  /** Primary display label, e.g. "Cmaj7", "Em", "F#m/A". */
  label: string;
  /** Root note as MIDI pitch class (0=C, 1=C#, ..., 11=B). */
  root: number;
  /** MIDI pitches relative to octave 4 (middle C = 60). */
  midiNotes: number[];
}

/** A suggestion returned by the model: a chord with its probability. */
export interface ChordSuggestion {
  token: ChordToken;
  /** Probability 0-1 from softmax output. */
  probability: number;
}

/** Genre conditioning options for conditional models. */
export type ChordGenre =
  | 'Rock' | 'Folk' | 'Pop' | 'Soundtrack' | 'R&B'
  | 'Country' | 'Jazz' | 'Experimental' | 'Religious' | 'Reggae'
  | 'Hip Hop' | 'Electronic' | 'Comedy' | 'Metal' | 'Blues'
  | 'World Music' | 'Disco' | 'Classical' | 'New Age' | 'Darkwave';

/** Decade conditioning options. */
export type ChordDecade = '1950' | '1960' | '1970' | '1980' | '1990' | '2000' | '2010' | '2020';

export const CHORD_GENRES: ChordGenre[] = [
  'Rock', 'Folk', 'Pop', 'Soundtrack', 'R&B',
  'Country', 'Jazz', 'Experimental', 'Religious', 'Reggae',
  'Hip Hop', 'Electronic', 'Comedy', 'Metal', 'Blues',
  'World Music', 'Disco', 'Classical', 'New Age', 'Darkwave',
];

export const CHORD_DECADES: ChordDecade[] = [
  '1950', '1960', '1970', '1980', '1990', '2000', '2010', '2020',
];

/** Available ChordSeqAI model variants. */
export type ChordModelVariant =
  | 'rnn'
  | 'transformer-s'
  | 'transformer-m'
  | 'transformer-l'
  | 'conditional-s'
  | 'conditional-m'
  | 'conditional-l';

export interface ChordModelMeta {
  id: ChordModelVariant;
  name: string;
  sizeBytes: number;
  /** Relative URL to the ONNX file. */
  url: string;
  /** Whether this model supports genre/decade conditioning. */
  conditional: boolean;
  /** IndexedDB cache key. */
  cacheKey: string;
}

/** Status of the chord suggestion service. */
export type ChordSuggestionStatus =
  | 'idle'
  | 'loading-model'
  | 'predicting'
  | 'ready'
  | 'error';

/** Style conditioning vector for conditional models. */
export interface ChordStyleCondition {
  /** Genre weights (20 values, summing to ~1 if set). */
  genres: Partial<Record<ChordGenre, number>>;
  /** Decade weights (8 values, summing to ~1 if set). */
  decades: Partial<Record<ChordDecade, number>>;
}

/** Messages sent to the chord worker. */
export type ChordWorkerRequest =
  | { type: 'load-model'; modelUrl: string; modelBytes?: ArrayBuffer }
  | { type: 'predict'; sequence: number[]; style?: ChordStyleCondition; topK?: number };

/** Messages received from the chord worker. */
export type ChordWorkerResponse =
  | { type: 'model-loaded' }
  | { type: 'prediction'; suggestions: Array<{ tokenIndex: number; probability: number }> }
  | { type: 'progress'; percent: number; message: string }
  | { type: 'error'; error: string };
