/**
 * Bit Crusher — Example WAP effect plugin.
 *
 * Reduces bit depth and sample rate for lo-fi digital distortion.
 * Uses AudioWorklet for custom DSP processing.
 */
import type {
  WAPPlugin,
  PluginAudioNode,
  PluginParamDescriptor,
  PluginParamValue,
  PluginParamValues,
  PluginFactory,
} from '../types/plugin';

/** AudioWorklet processor code as a string (inlined to avoid separate file loading). */
const WORKLET_CODE = `
class BitCrusherProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'bitDepth', defaultValue: 8, minValue: 1, maxValue: 16, automationRate: 'k-rate' },
      { name: 'sampleRateReduction', defaultValue: 1, minValue: 1, maxValue: 40, automationRate: 'k-rate' },
      { name: 'wet', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }

  _held = new Float32Array(2);
  _counter = 0;

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input.length) return true;

    const bitDepth = parameters.bitDepth[0];
    const reduction = Math.max(1, Math.floor(parameters.sampleRateReduction[0]));
    const wet = parameters.wet[0];

    const levels = Math.pow(2, bitDepth);

    for (let ch = 0; ch < output.length; ch++) {
      const inp = input[ch] || input[0];
      const out = output[ch];
      for (let i = 0; i < out.length; i++) {
        if (this._counter % reduction === 0) {
          this._held[ch] = Math.round(inp[i] * levels) / levels;
        }
        out[i] = inp[i] * (1 - wet) + this._held[ch] * wet;
        if (ch === output.length - 1) this._counter++;
      }
    }
    return true;
  }
}

registerProcessor('bit-crusher-processor', BitCrusherProcessor);
`;

class BitCrusherPlugin implements WAPPlugin {
  readonly name = 'Bit Crusher';
  readonly pluginType = 'effect' as const;
  readonly version = '1.0.0';
  readonly author = 'ACE-Step';
  readonly description = 'Lo-fi bit depth and sample rate reduction effect';

  private workletNode: AudioWorkletNode | null = null;
  private inputGain: GainNode | null = null;
  private outputGain: GainNode | null = null;
  private params: PluginParamValues = {
    bitDepth: 8,
    sampleRateReduction: 1,
    wet: 1,
  };

  getParameterDescriptors(): PluginParamDescriptor[] {
    return [
      {
        id: 'bitDepth',
        name: 'Bit Depth',
        type: 'float',
        min: 1,
        max: 16,
        defaultValue: 8,
        step: 1,
      },
      {
        id: 'sampleRateReduction',
        name: 'Sample Rate ÷',
        type: 'float',
        min: 1,
        max: 40,
        defaultValue: 1,
        step: 1,
      },
      {
        id: 'wet',
        name: 'Dry/Wet',
        type: 'float',
        min: 0,
        max: 1,
        defaultValue: 1,
      },
    ];
  }

  createAudioNode(ctx: AudioContext): PluginAudioNode {
    this.inputGain = ctx.createGain();
    this.outputGain = ctx.createGain();

    // Try to use AudioWorklet, fall back to ScriptProcessor if unavailable
    try {
      const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      ctx.audioWorklet.addModule(url).then(() => {
        URL.revokeObjectURL(url);
        if (!this.inputGain || !this.outputGain) return;
        this.workletNode = new AudioWorkletNode(ctx, 'bit-crusher-processor');
        this.inputGain.connect(this.workletNode);
        this.workletNode.connect(this.outputGain);
        // Apply current params
        this._syncWorkletParams();
      }).catch(() => {
        // Worklet failed — use passthrough
        this._setupPassthrough();
      });
    } catch {
      this._setupPassthrough();
    }

    // Initially connect direct passthrough (worklet will splice in when ready)
    this.inputGain.connect(this.outputGain);

    return {
      inputNode: this.inputGain,
      outputNode: this.outputGain,
    };
  }

  private _setupPassthrough() {
    if (this.inputGain && this.outputGain) {
      try { this.inputGain.disconnect(); } catch { /* ok */ }
      this.inputGain.connect(this.outputGain);
    }
  }

  private _syncWorkletParams() {
    if (!this.workletNode) return;
    for (const [key, value] of Object.entries(this.params)) {
      const param = this.workletNode.parameters.get(key);
      if (param) param.value = Number(value);
    }
  }

  setParameter(paramId: string, value: PluginParamValue): void {
    this.params[paramId] = value;
    if (this.workletNode) {
      const param = this.workletNode.parameters.get(paramId);
      if (param) param.value = Number(value);
    }
  }

  getParameter(paramId: string): PluginParamValue | undefined {
    return this.params[paramId];
  }

  getParameters(): PluginParamValues {
    return { ...this.params };
  }

  dispose(): void {
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.inputGain) {
      this.inputGain.disconnect();
      this.inputGain = null;
    }
    if (this.outputGain) {
      this.outputGain.disconnect();
      this.outputGain = null;
    }
  }
}

export const createBitCrusherPlugin: PluginFactory = () => new BitCrusherPlugin();
