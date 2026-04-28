declare module 'signalsmith-stretch' {
  interface StretchNode extends AudioNode {
    inputTime: number;
    schedule(opts: {
      output?: number;
      active?: boolean;
      input?: number;
      rate?: number;
      semitones?: number;
      tonalityHz?: number;
      formantSemitones?: number;
      formantCompensation?: boolean;
      formantBaseHz?: number;
      loopStart?: number;
      loopEnd?: number;
    }): void;
    start(when?: number): void;
    stop(when?: number): void;
    addBuffers(buffers: Float32Array[]): Promise<number>;
    dropBuffers(toSeconds?: number): Promise<{ start: number; end: number }>;
    latency(): number;
    configure(opts: {
      blockMs?: number;
      intervalMs?: number;
      splitComputation?: boolean;
      preset?: 'default' | 'cheaper';
    }): void;
    setUpdateInterval(seconds: number, callback?: () => void): void;
  }

  function SignalsmithStretch(
    audioContext: AudioContext | BaseAudioContext,
    channelOptions?: {
      outputChannelCount?: number[];
      numberOfInputs?: number;
      numberOfOutputs?: number;
    },
  ): Promise<StretchNode>;

  export default SignalsmithStretch;
}
