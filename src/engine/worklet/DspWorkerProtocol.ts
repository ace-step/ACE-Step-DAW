/**
 * Typed command protocol for DSP Worker ↔ Main Thread communication.
 *
 * All messages between the main thread and the DSP Worker are typed
 * for safety and documentation.
 *
 * Part of Phase 5: Worker Thread DSP Rendering (#1130).
 */

// ---------------------------------------------------------------------------
// Main → Worker commands
// ---------------------------------------------------------------------------

export interface InitCommand {
  type: 'init';
  sampleRate: number;
  channels: number;
  bufferSize: number;
  /** SharedArrayBuffer for the audio ring buffer. */
  audioSab: SharedArrayBuffer;
  /** SharedArrayBuffer for the parameter buffer. */
  paramSab: SharedArrayBuffer;
}

export interface PlayCommand {
  type: 'play';
  fromSample: number;
  bpm: number;
}

export interface StopCommand {
  type: 'stop';
}

export interface SeekCommand {
  type: 'seek';
  toSample: number;
}

export interface AddTrackCommand {
  type: 'add-track';
  trackId: string;
  effects: EffectConfig[];
}

export interface RemoveTrackCommand {
  type: 'remove-track';
  trackId: string;
}

export interface UpdateEffectCommand {
  type: 'update-effect';
  trackId: string;
  effectIndex: number;
  params: Record<string, number>;
}

export interface NoteOnCommand {
  type: 'note-on';
  trackId: string;
  note: number;
  velocity: number;
  sampleTime: number;
}

export interface NoteOffCommand {
  type: 'note-off';
  trackId: string;
  note: number;
  sampleTime: number;
}

export interface EffectConfig {
  type: string;
  params: Record<string, number>;
  bypass?: boolean;
}

export type WorkerCommand =
  | InitCommand
  | PlayCommand
  | StopCommand
  | SeekCommand
  | AddTrackCommand
  | RemoveTrackCommand
  | UpdateEffectCommand
  | NoteOnCommand
  | NoteOffCommand;

// ---------------------------------------------------------------------------
// Worker → Main messages
// ---------------------------------------------------------------------------

export interface ReadyMessage {
  type: 'ready';
}

export interface ErrorMessage {
  type: 'error';
  message: string;
}

export interface PositionMessage {
  type: 'position';
  sample: number;
}

export interface CpuMessage {
  type: 'cpu';
  /** CPU usage as fraction [0, 1]. */
  usage: number;
  /** Render time per block in ms. */
  renderTimeMs: number;
}

export type WorkerMessage =
  | ReadyMessage
  | ErrorMessage
  | PositionMessage
  | CpuMessage;
