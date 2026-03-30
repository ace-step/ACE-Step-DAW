import * as Tone from 'tone';
import type {
  AutomatableEffectTarget,
  TrackEffect,
  TrackEffectType,
  EQ3Params,
  ParametricEQParams,
  CompressorParams,
  ReverbParams,
  DelayParams,
  DistortionParams,
  FilterParams,
  ChorusParams,
  FlangerParams,
  PhaserParams,
  ConvolverParams,
  FactoryIRType,
} from '../types/project';
import { denormalizeEffectParamValue } from '../utils/effectAutomation';
import { useProjectStore } from '../store/projectStore';
import { SidechainFollower } from './sidechainFollower';
import { FACTORY_IR_PRESETS, generateImpulseResponse } from '../utils/factoryImpulseResponses';

type EffectNode = {
  id: string;
  type: TrackEffectType;
  node: Tone.ToneAudioNode;
  inputNode?: AudioNode;
  outputNode?: AudioNode;
  lfo?: Tone.LFO;
  parametricEqRuntime?: {
    input: Tone.Gain;
    output: Tone.Gain;
    filters: Tone.Filter[];
  };
  convolverRuntime?: {
    input: Tone.Gain;
    output: Tone.Gain;
    dryGain: Tone.Gain;
    wetGain: Tone.Gain;
    convolver: Tone.Convolver;
    preDelayNode: Tone.Gain;
  };
  dispose?: () => void;
};

function applyParametricEqFilters(
  input: Tone.Gain,
  output: Tone.Gain,
  filters: Tone.Filter[],
  params: ParametricEQParams,
) {
  try { input.disconnect(); } catch {}
  for (const filter of filters) {
    try { filter.disconnect(); } catch {}
  }

  params.bands.forEach((band, index) => {
    const filter = filters[index];
    if (!filter) return;
    filter.type = band.type;
    filter.frequency.value = band.frequency;
    filter.Q.value = band.q;
    filter.gain.value = band.gain;
  });

  const enabledFilters = filters.filter((_, index) => params.bands[index]?.enabled !== false);
  let previous: Tone.ToneAudioNode = input;
  for (const filter of enabledFilters) {
    previous.connect(filter);
    previous = filter;
  }
  previous.connect(output);
}

/**
 * Unwrap a Tone.js node to its underlying native AudioNode.
 * Tone.Effect subclasses (Reverb, Delay, etc.) have `.input` = Tone.Gain,
 * and Tone.Gain has `.input` = native GainNode.  We need to walk the chain
 * until we reach a real AudioNode that native `.connect()` can accept.
 *
 * A native AudioNode does NOT have a nested `.input`/`.output` object property
 * (its `.connect` is a native function, not a Tone.js method).
 */
function unwrapToNative(node: unknown, prop: 'input' | 'output'): AudioNode {
  let current = node;
  // Walk up to 3 levels deep (Tone.Effect → Tone.Gain → native GainNode)
  for (let i = 0; i < 3; i++) {
    if (!current || typeof current !== 'object') break;
    const next = (current as Record<string, unknown>)[prop];
    // If there's no deeper level or it's the same object, we've reached the native node
    if (!next || next === current || typeof next !== 'object') break;
    current = next;
  }
  return current as AudioNode;
}

function getEffectInput(effectNode: EffectNode): AudioNode {
  const raw = effectNode.inputNode ?? (effectNode.node as unknown as { input: unknown }).input;
  return unwrapToNative(raw, 'input');
}

function getEffectOutput(effectNode: EffectNode): AudioNode {
  const raw = effectNode.outputNode ?? (effectNode.node as unknown as { output: unknown }).output;
  return unwrapToNative(raw, 'output');
}

function createNode(effect: TrackEffect): EffectNode {
  switch (effect.type) {
    case 'eq3': {
      const p = effect.params as EQ3Params;
      const node = new Tone.EQ3(p.low, p.mid, p.high);
      node.lowFrequency.value = p.lowFrequency;
      node.highFrequency.value = p.highFrequency;
      return { id: effect.id, type: effect.type, node };
    }
    case 'compressor': {
      const p = effect.params as CompressorParams;
      return {
        id: effect.id,
        type: effect.type,
        node: new Tone.Compressor({
          threshold: p.threshold,
          ratio: p.ratio,
          attack: p.attack,
          release: p.release,
          knee: p.knee,
        }),
      };
    }
    case 'parametricEq': {
      const p = effect.params as ParametricEQParams;
      const input = new Tone.Gain();
      const output = new Tone.Gain();
      const filters = p.bands.map(() => new Tone.Filter({ type: 'peaking', frequency: 1000, Q: 1 }));
      applyParametricEqFilters(input, output, filters, p);
      return {
        id: effect.id,
        type: effect.type,
        node: input,
        inputNode: (input as unknown as { input?: AudioNode }).input,
        outputNode: (output as unknown as { output?: AudioNode }).output,
        parametricEqRuntime: { input, output, filters },
        dispose: () => {
          input.dispose();
          output.dispose();
          filters.forEach((filter) => filter.dispose());
        },
      };
    }
    case 'reverb': {
      const p = effect.params as ReverbParams;
      return {
        id: effect.id,
        type: effect.type,
        node: new Tone.Reverb({ decay: p.decay, preDelay: p.preDelay, wet: p.wet }),
      };
    }
    case 'delay': {
      const p = effect.params as DelayParams;
      return {
        id: effect.id,
        type: effect.type,
        node: new Tone.FeedbackDelay({ delayTime: p.time, feedback: p.feedback, wet: p.wet }),
      };
    }
    case 'distortion': {
      const p = effect.params as DistortionParams;
      const amount =
        p.distortionType === 'overdrive' ? p.amount * 0.5 :
        p.distortionType === 'fuzz' ? Math.min(1, p.amount * 1.5) :
        p.amount;
      return {
        id: effect.id,
        type: effect.type,
        node: new Tone.Distortion({ distortion: amount, wet: p.wet }),
      };
    }
    case 'filter': {
      const p = effect.params as FilterParams;
      const node = new Tone.Filter({ frequency: p.frequency, type: p.filterType, Q: p.resonance });
      let lfo: Tone.LFO | undefined;
      if (p.lfoEnabled) {
        lfo = new Tone.LFO({
          frequency: p.lfoRate,
          min: Math.max(20, p.frequency * (1 - p.lfoDepth)),
          max: Math.min(20000, p.frequency * (1 + p.lfoDepth)),
        });
        lfo.connect(node.frequency);
        lfo.start();
      }
      return { id: effect.id, type: effect.type, node, lfo };
    }
    case 'chorus': {
      const p = effect.params as ChorusParams;
      const node = new Tone.Chorus({
        frequency: p.frequency,
        delayTime: p.delayTime,
        depth: p.depth,
        feedback: p.feedback,
        wet: p.wet,
      });
      node.start();
      return { id: effect.id, type: effect.type, node };
    }
    case 'flanger': {
      const p = effect.params as FlangerParams;
      const node = new Tone.FeedbackDelay({
        delayTime: p.delayTime / 1000,
        feedback: Math.abs(p.feedback),
        wet: p.wet,
      });
      const lfo = new Tone.LFO({
        frequency: p.frequency,
        min: 0.0005,
        max: Math.max(0.001, p.delayTime / 1000 * p.depth),
      });
      lfo.connect(node.delayTime);
      lfo.start();
      return { id: effect.id, type: effect.type, node, lfo };
    }
    case 'phaser': {
      const p = effect.params as PhaserParams;
      return {
        id: effect.id,
        type: effect.type,
        node: new Tone.Phaser({
          frequency: p.frequency,
          octaves: p.octaves,
          stages: p.stages,
          Q: p.Q,
          baseFrequency: p.baseFrequency,
          wet: p.wet,
        }),
      };
    }
    case 'convolver': {
      const p = effect.params as ConvolverParams;
      const input = new Tone.Gain();
      const output = new Tone.Gain();
      const dryGain = new Tone.Gain(1 - p.wet);
      const wetGain = new Tone.Gain(p.wet);
      const preDelayNode = new Tone.Gain();
      const convolver = new Tone.Convolver();

      if (p.irType !== 'custom') {
        const preset = FACTORY_IR_PRESETS[p.irType as FactoryIRType];
        if (preset) {
          try {
            const sampleRate = Tone.getContext?.()?.sampleRate ?? 44100;
            const irData = generateImpulseResponse(preset, sampleRate);
            const ctx = Tone.getContext?.();
            const audioBuffer = ctx?.createBuffer?.(1, irData.length, sampleRate);
            if (audioBuffer) {
              audioBuffer.copyToChannel(irData as Float32Array<ArrayBuffer>, 0);
              convolver.buffer = new Tone.ToneAudioBuffer(audioBuffer);
            }
          } catch {
            // IR loading may fail in test/non-audio contexts
          }
        }
      } else if (p.irUrl) {
        convolver.load(p.irUrl).catch(() => {});
      }

      input.connect(dryGain);
      input.connect(preDelayNode);
      preDelayNode.connect(convolver);
      convolver.connect(wetGain);
      dryGain.connect(output);
      wetGain.connect(output);

      return {
        id: effect.id,
        type: effect.type,
        node: input,
        inputNode: (input as unknown as { input?: AudioNode }).input,
        outputNode: (output as unknown as { output?: AudioNode }).output,
        convolverRuntime: { input, output, dryGain, wetGain, convolver, preDelayNode },
        dispose: () => {
          input.dispose();
          output.dispose();
          dryGain.dispose();
          wetGain.dispose();
          convolver.dispose();
          preDelayNode.dispose();
        },
      };
    }
    case 'gate': {
      // Gate/expander: use a GainNode controlled by an envelope follower
      // The actual gating is applied via requestAnimationFrame, similar to sidechain
      const p = effect.params as import('../types/project').GateParams;
      const input = new Tone.Gain(1);
      const output = new Tone.Gain(1);
      const gateGain = new Tone.Gain(1);
      const analyser = Tone.getContext().createAnalyser();
      analyser.fftSize = 256;

      input.connect(gateGain);
      gateGain.connect(output);
      // Tap the input for level detection
      const inputNative = unwrapToNative(input, 'output');
      inputNative.connect(analyser);

      // Gate state
      const gateState = {
        currentGain: 1,
        isOpen: true,
        holdCounter: 0,
        rafId: 0,
        params: { ...p },
      };

      const analyserBuffer = new Float32Array(analyser.fftSize);

      const tick = () => {
        analyser.getFloatTimeDomainData(analyserBuffer);
        // Compute RMS
        let sumSq = 0;
        for (let i = 0; i < analyserBuffer.length; i++) sumSq += analyserBuffer[i] * analyserBuffer[i];
        const rms = Math.sqrt(sumSq / analyserBuffer.length);
        const inputDb = rms > 0 ? 20 * Math.log10(rms) : -120;

        const sp = gateState.params;
        const openThreshold = sp.threshold;
        const closeThreshold = sp.threshold - sp.hysteresis;
        const dt = 1 / 60;

        if (inputDb >= openThreshold) {
          gateState.isOpen = true;
          gateState.holdCounter = sp.hold;
        } else if (inputDb < closeThreshold) {
          if (gateState.holdCounter > 0) {
            gateState.holdCounter = Math.max(0, gateState.holdCounter - dt);
          } else {
            gateState.isOpen = false;
          }
        }

        let targetGain: number;
        if (gateState.isOpen) {
          targetGain = 1;
        } else if (sp.mode === 'gate') {
          // Hard gate: range determines floor
          targetGain = Math.pow(10, sp.range / 20);
        } else {
          // Expander: ratio-based below threshold
          const belowDb = openThreshold - inputDb;
          const reductionDb = Math.min(belowDb * 0.5, Math.abs(sp.range));
          targetGain = Math.pow(10, -reductionDb / 20);
        }

        // Smooth gain with attack/release
        const coeff = targetGain > gateState.currentGain
          ? 1 - Math.exp(-dt / Math.max(0.0001, sp.attack))
          : 1 - Math.exp(-dt / Math.max(0.005, sp.release));
        gateState.currentGain += (targetGain - gateState.currentGain) * coeff;

        const nativeGateGain = unwrapToNative(gateGain, 'input') as GainNode;
        nativeGateGain.gain.value = gateState.currentGain;

        gateState.rafId = requestAnimationFrame(tick);
      };
      gateState.rafId = requestAnimationFrame(tick);

      return {
        id: effect.id,
        type: effect.type,
        node: input,
        inputNode: unwrapToNative(input, 'input'),
        outputNode: unwrapToNative(output, 'output'),
        dispose: () => {
          cancelAnimationFrame(gateState.rafId);
          input.dispose();
          output.dispose();
          gateGain.dispose();
          analyser.disconnect();
        },
        // Store state for parameter updates
        _gateState: gateState,
      } as EffectNode;
    }
    case 'deesser': {
      // De-esser: bandpass detection → level → gain reduction on main signal or band
      const p = effect.params as import('../types/project').DeEsserParams;
      const input = new Tone.Gain(1);
      const output = new Tone.Gain(1);
      const deessGain = new Tone.Gain(1);

      // Detection band
      const ctx = Tone.getContext().rawContext;
      const detectionFilter = ctx.createBiquadFilter();
      detectionFilter.type = 'bandpass';
      detectionFilter.frequency.value = p.frequency;
      detectionFilter.Q.value = p.bandwidth;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      const analyserBuffer = new Float32Array(analyser.fftSize);

      // Connect: input → deessGain → output (main path)
      //          input → detectionFilter → analyser (detection path)
      input.connect(deessGain);
      deessGain.connect(output);
      const inputNative = unwrapToNative(input, 'output');
      inputNative.connect(detectionFilter);
      detectionFilter.connect(analyser);

      const deesserState = {
        currentGain: 1,
        rafId: 0,
        params: { ...p },
      };

      const tick = () => {
        analyser.getFloatTimeDomainData(analyserBuffer);
        let sumSq = 0;
        for (let i = 0; i < analyserBuffer.length; i++) sumSq += analyserBuffer[i] * analyserBuffer[i];
        const rms = Math.sqrt(sumSq / analyserBuffer.length);
        const detectionDb = rms > 0 ? 20 * Math.log10(rms) : -120;

        const sp = deesserState.params;
        let targetGain = 1;
        if (detectionDb > sp.threshold) {
          const excessDb = detectionDb - sp.threshold;
          const reductionDb = Math.min(excessDb, sp.range);
          targetGain = Math.pow(10, -reductionDb / 20);
        }

        // Smooth
        const dt = 1 / 60;
        const coeff = targetGain < deesserState.currentGain
          ? 1 - Math.exp(-dt / 0.002) // fast attack
          : 1 - Math.exp(-dt / 0.05); // slow release
        deesserState.currentGain += (targetGain - deesserState.currentGain) * coeff;

        const nativeGain = unwrapToNative(deessGain, 'input') as GainNode;
        nativeGain.gain.value = deesserState.currentGain;

        deesserState.rafId = requestAnimationFrame(tick);
      };
      deesserState.rafId = requestAnimationFrame(tick);

      return {
        id: effect.id,
        type: effect.type,
        node: input,
        inputNode: unwrapToNative(input, 'input'),
        outputNode: unwrapToNative(output, 'output'),
        dispose: () => {
          cancelAnimationFrame(deesserState.rafId);
          input.dispose();
          output.dispose();
          deessGain.dispose();
          detectionFilter.disconnect();
          analyser.disconnect();
        },
        _deesserState: deesserState,
        _deesserFilter: detectionFilter,
      } as EffectNode;
    }
    case 'transientShaper': {
      // Transient shaper: dual envelope follower
      const p = effect.params as import('../types/project').TransientShaperParams;
      const input = new Tone.Gain(1);
      const output = new Tone.Gain(1);
      const dryGain = new Tone.Gain(1);
      const wetGain = new Tone.Gain(p.mix);
      const shaperGain = new Tone.Gain(1);
      const outputGain = new Tone.Gain(Math.pow(10, p.output / 20));

      const analyser = Tone.getContext().createAnalyser();
      analyser.fftSize = 256;
      const analyserBuffer = new Float32Array(analyser.fftSize);

      // Dry path
      input.connect(dryGain);
      dryGain.gain.value = 1 - p.mix;

      // Wet path: input → shaperGain → wetGain → output
      input.connect(shaperGain);
      shaperGain.connect(wetGain);

      dryGain.connect(outputGain);
      wetGain.connect(outputGain);
      outputGain.connect(output);

      // Tap input for envelope detection
      const inputNative = unwrapToNative(input, 'output');
      inputNative.connect(analyser);

      const transientState = {
        fastEnv: 0,
        slowEnv: 0,
        rafId: 0,
        params: { ...p },
      };

      const tick = () => {
        analyser.getFloatTimeDomainData(analyserBuffer);
        let peak = 0;
        for (let i = 0; i < analyserBuffer.length; i++) {
          const abs = Math.abs(analyserBuffer[i]);
          if (abs > peak) peak = abs;
        }

        const dt = 1 / 60;
        const sp = transientState.params;

        // Fast envelope: 0.3ms attack, 5ms release
        const fastAttack = 1 - Math.exp(-dt / 0.0003);
        const fastRelease = 1 - Math.exp(-dt / 0.005);
        const fastCoeff = peak > transientState.fastEnv ? fastAttack : fastRelease;
        transientState.fastEnv += (peak - transientState.fastEnv) * fastCoeff;

        // Slow envelope: 20ms attack, 200ms release
        const slowAttack = 1 - Math.exp(-dt / 0.02);
        const slowRelease = 1 - Math.exp(-dt / 0.2);
        const slowCoeff = peak > transientState.slowEnv ? slowAttack : slowRelease;
        transientState.slowEnv += (peak - transientState.slowEnv) * slowCoeff;

        // Transient = fast - slow (clamped to 0)
        const transient = Math.max(0, transientState.fastEnv - transientState.slowEnv);
        const body = transientState.slowEnv;

        // Apply shaping
        const attackMul = sp.attack / 100; // -1 to +1
        const sustainMul = sp.sustain / 100; // -1 to +1
        const gain = 1 + attackMul * transient * 4 + sustainMul * body * 2;
        const clampedGain = Math.max(0.01, Math.min(4, gain));

        const nativeGain = unwrapToNative(shaperGain, 'input') as GainNode;
        nativeGain.gain.value = clampedGain;

        transientState.rafId = requestAnimationFrame(tick);
      };
      transientState.rafId = requestAnimationFrame(tick);

      return {
        id: effect.id,
        type: effect.type,
        node: input,
        inputNode: unwrapToNative(input, 'input'),
        outputNode: unwrapToNative(output, 'output'),
        dispose: () => {
          cancelAnimationFrame(transientState.rafId);
          input.dispose();
          output.dispose();
          dryGain.dispose();
          wetGain.dispose();
          shaperGain.dispose();
          outputGain.dispose();
          analyser.disconnect();
        },
        _transientState: transientState,
        _transientDryGain: dryGain,
        _transientWetGain: wetGain,
        _transientOutputGain: outputGain,
      } as EffectNode;
    }
  }
}

function scKey(trackId: string, effectId: string): string {
  return `${trackId}:${effectId}`;
}

class EffectsEngine {
  private chains = new Map<string, EffectNode[]>();
  private bypassedTracks = new Map<string, boolean>();
  private sidechains = new Map<string, SidechainFollower>();

  rebuildChain(trackId: string, effects: TrackEffect[], bypassed = false) {
    this.disposeChain(trackId);
    this.bypassedTracks.set(trackId, bypassed);
    const activeEffects = effects.filter((e) => e.enabled);
    const nodes = activeEffects.map(createNode);
    for (let i = 0; i < nodes.length - 1; i++) {
      getEffectOutput(nodes[i]).connect(getEffectInput(nodes[i + 1]));
    }
    this.chains.set(trackId, nodes);
  }

  updateEffectParams(
    trackId: string,
    effectId: string,
    params: TrackEffect['params'],
    effectType: TrackEffectType,
  ) {
    const nodes = this.chains.get(trackId);
    if (!nodes) return;
    const effectNode = nodes.find((n) => n.id === effectId);
    if (!effectNode) return;

    switch (effectType) {
      case 'eq3': {
        const p = params as EQ3Params;
        const eq = effectNode.node as Tone.EQ3;
        eq.low.value = p.low;
        eq.mid.value = p.mid;
        eq.high.value = p.high;
        eq.lowFrequency.value = p.lowFrequency;
        eq.highFrequency.value = p.highFrequency;
        break;
      }
      case 'parametricEq': {
        const p = params as ParametricEQParams;
        const runtime = effectNode.parametricEqRuntime;
        if (!runtime) break;
        applyParametricEqFilters(runtime.input, runtime.output, runtime.filters, p);
        break;
      }
      case 'compressor': {
        const p = params as CompressorParams;
        const comp = effectNode.node as Tone.Compressor;
        comp.threshold.value = p.threshold;
        comp.ratio.value = p.ratio;
        comp.attack.value = p.attack;
        comp.release.value = p.release;
        comp.knee.value = p.knee;
        this.updateSidechainParams(trackId, effectId, p);
        break;
      }
      case 'reverb': {
        const p = params as ReverbParams;
        const rev = effectNode.node as Tone.Reverb;
        rev.decay = p.decay;
        rev.preDelay = p.preDelay;
        rev.wet.value = p.wet;
        break;
      }
      case 'delay': {
        const p = params as DelayParams;
        const del = effectNode.node as Tone.FeedbackDelay;
        del.delayTime.value = p.time;
        del.feedback.value = p.feedback;
        del.wet.value = p.wet;
        break;
      }
      case 'distortion': {
        const p = params as DistortionParams;
        const dist = effectNode.node as Tone.Distortion;
        dist.distortion =
          p.distortionType === 'overdrive' ? p.amount * 0.5 :
          p.distortionType === 'fuzz' ? Math.min(1, p.amount * 1.5) :
          p.amount;
        dist.wet.value = p.wet;
        break;
      }
      case 'filter': {
        const p = params as FilterParams;
        const filt = effectNode.node as Tone.Filter;
        filt.frequency.value = p.frequency;
        filt.Q.value = p.resonance;
        filt.type = p.filterType;

        if (p.lfoEnabled && !effectNode.lfo) {
          const lfo = new Tone.LFO({
            frequency: p.lfoRate,
            min: Math.max(20, p.frequency * (1 - p.lfoDepth)),
            max: Math.min(20000, p.frequency * (1 + p.lfoDepth)),
          });
          lfo.connect(filt.frequency);
          lfo.start();
          effectNode.lfo = lfo;
        } else if (!p.lfoEnabled && effectNode.lfo) {
          effectNode.lfo.stop();
          effectNode.lfo.dispose();
          effectNode.lfo = undefined;
        } else if (p.lfoEnabled && effectNode.lfo) {
          effectNode.lfo.frequency.value = p.lfoRate;
          effectNode.lfo.min = Math.max(20, p.frequency * (1 - p.lfoDepth));
          effectNode.lfo.max = Math.min(20000, p.frequency * (1 + p.lfoDepth));
        }
        break;
      }
      case 'chorus': {
        const p = params as ChorusParams;
        const chorus = effectNode.node as Tone.Chorus;
        chorus.frequency.value = p.frequency;
        chorus.delayTime = p.delayTime;
        chorus.depth = p.depth;
        chorus.feedback.value = p.feedback;
        chorus.wet.value = p.wet;
        break;
      }
      case 'flanger': {
        const p = params as FlangerParams;
        const flanger = effectNode.node as Tone.FeedbackDelay;
        flanger.delayTime.value = p.delayTime / 1000;
        flanger.feedback.value = Math.abs(p.feedback);
        flanger.wet.value = p.wet;
        if (effectNode.lfo) {
          effectNode.lfo.frequency.value = p.frequency;
          effectNode.lfo.max = Math.max(0.001, p.delayTime / 1000 * p.depth);
        }
        break;
      }
      case 'phaser': {
        const p = params as PhaserParams;
        const phaser = effectNode.node as Tone.Phaser;
        phaser.frequency.value = p.frequency;
        phaser.octaves = p.octaves;
        phaser.Q.value = p.Q;
        phaser.baseFrequency = p.baseFrequency;
        phaser.wet.value = p.wet;
        break;
      }
      case 'convolver': {
        const p = params as ConvolverParams;
        const rt = effectNode.convolverRuntime;
        if (!rt) break;
        rt.wetGain.gain.value = p.wet;
        rt.dryGain.gain.value = 1 - p.wet;
        break;
      }
      case 'gate': {
        const p = params as import('../types/project').GateParams;
        const state = (effectNode as Record<string, unknown>)._gateState as { params: import('../types/project').GateParams } | undefined;
        if (state) Object.assign(state.params, p);
        break;
      }
      case 'deesser': {
        const p = params as import('../types/project').DeEsserParams;
        const state = (effectNode as Record<string, unknown>)._deesserState as { params: import('../types/project').DeEsserParams } | undefined;
        if (state) Object.assign(state.params, p);
        const filter = (effectNode as Record<string, unknown>)._deesserFilter as BiquadFilterNode | undefined;
        if (filter) {
          filter.frequency.value = p.frequency;
          filter.Q.value = p.bandwidth;
        }
        break;
      }
      case 'transientShaper': {
        const p = params as import('../types/project').TransientShaperParams;
        const state = (effectNode as Record<string, unknown>)._transientState as { params: import('../types/project').TransientShaperParams } | undefined;
        if (state) Object.assign(state.params, p);
        const dryGain = (effectNode as Record<string, unknown>)._transientDryGain as Tone.Gain | undefined;
        const wetGain = (effectNode as Record<string, unknown>)._transientWetGain as Tone.Gain | undefined;
        const outputGain = (effectNode as Record<string, unknown>)._transientOutputGain as Tone.Gain | undefined;
        if (dryGain) dryGain.gain.value = 1 - p.mix;
        if (wetGain) wetGain.gain.value = p.mix;
        if (outputGain) outputGain.gain.value = Math.pow(10, p.output / 20);
        break;
      }
    }
  }

  applyAutomationValue(
    trackId: string,
    effectId: string,
    target: AutomatableEffectTarget,
    normalized: number,
  ) {
    const nodes = this.chains.get(trackId);
    if (!nodes) return;
    const effectNode = nodes.find((node) => node.id === effectId && node.type === target.effectType);
    if (!effectNode) return;

    const value = denormalizeEffectParamValue(target.effectType, target.param, normalized);
    if (value === null) return;

    switch (target.effectType) {
      case 'eq3': {
        const eq = effectNode.node as Tone.EQ3;
        if (target.param === 'low') eq.low.value = value;
        if (target.param === 'mid') eq.mid.value = value;
        if (target.param === 'high') eq.high.value = value;
        if (target.param === 'lowFrequency') eq.lowFrequency.value = value;
        if (target.param === 'highFrequency') eq.highFrequency.value = value;
        break;
      }
      case 'compressor': {
        const comp = effectNode.node as Tone.Compressor;
        if (target.param === 'threshold') comp.threshold.value = value;
        if (target.param === 'ratio') comp.ratio.value = value;
        if (target.param === 'attack') comp.attack.value = value;
        if (target.param === 'release') comp.release.value = value;
        if (target.param === 'knee') comp.knee.value = value;
        break;
      }
      case 'reverb': {
        const rev = effectNode.node as Tone.Reverb;
        if (target.param === 'decay') rev.decay = value;
        if (target.param === 'preDelay') rev.preDelay = value;
        if (target.param === 'wet') rev.wet.value = value;
        break;
      }
      case 'delay': {
        const delay = effectNode.node as Tone.FeedbackDelay;
        if (target.param === 'time') delay.delayTime.value = value;
        if (target.param === 'feedback') delay.feedback.value = value;
        if (target.param === 'wet') delay.wet.value = value;
        break;
      }
      case 'distortion': {
        const dist = effectNode.node as Tone.Distortion;
        if (target.param === 'amount') {
          const effect = useProjectStore.getState().project?.tracks
            .find((track) => track.id === trackId)
            ?.effects?.find((trackEffect) => trackEffect.id === effectId && trackEffect.type === 'distortion');
          const distortionType = effect?.type === 'distortion' ? effect.params.distortionType : 'soft';
          dist.distortion =
            distortionType === 'overdrive' ? value * 0.5 :
            distortionType === 'fuzz' ? Math.min(1, value * 1.5) :
            value;
        }
        if (target.param === 'wet') dist.wet.value = value;
        break;
      }
      case 'filter': {
        const filter = effectNode.node as Tone.Filter;
        if (target.param === 'frequency') {
          const currentFrequency = Number(filter.frequency.value);
          filter.frequency.value = value;
          if (effectNode.lfo) {
            const depth = currentFrequency > 0
              ? Math.max(0, Math.min(1, (effectNode.lfo.max - currentFrequency) / currentFrequency))
              : 0;
            effectNode.lfo.min = Math.max(20, value * (1 - depth));
            effectNode.lfo.max = Math.min(20000, value * (1 + depth));
          }
        }
        if (target.param === 'resonance') filter.Q.value = value;
        if (target.param === 'lfoRate' && effectNode.lfo) effectNode.lfo.frequency.value = value;
        if (target.param === 'lfoDepth' && effectNode.lfo) {
          const freq = Number(filter.frequency.value);
          effectNode.lfo.min = Math.max(20, freq * (1 - value));
          effectNode.lfo.max = Math.min(20000, freq * (1 + value));
        }
        break;
      }
      case 'chorus': {
        const chorus = effectNode.node as Tone.Chorus;
        if (target.param === 'frequency') chorus.frequency.value = value;
        if (target.param === 'delayTime') chorus.delayTime = value;
        if (target.param === 'depth') chorus.depth = value;
        if (target.param === 'feedback') chorus.feedback.value = value;
        if (target.param === 'wet') chorus.wet.value = value;
        break;
      }
      case 'flanger': {
        const flanger = effectNode.node as Tone.FeedbackDelay;
        if (target.param === 'frequency' && effectNode.lfo) effectNode.lfo.frequency.value = value;
        if (target.param === 'delayTime') flanger.delayTime.value = value / 1000;
        if (target.param === 'depth' && effectNode.lfo) {
          const delayMs = Number(flanger.delayTime.value) * 1000;
          effectNode.lfo.max = Math.max(0.001, delayMs / 1000 * value);
        }
        if (target.param === 'feedback') flanger.feedback.value = Math.abs(value);
        if (target.param === 'wet') flanger.wet.value = value;
        break;
      }
      case 'phaser': {
        const phaser = effectNode.node as Tone.Phaser;
        if (target.param === 'frequency') phaser.frequency.value = value;
        if (target.param === 'octaves') phaser.octaves = value;
        if (target.param === 'Q') phaser.Q.value = value;
        if (target.param === 'baseFrequency') phaser.baseFrequency = value;
        if (target.param === 'wet') phaser.wet.value = value;
        break;
      }
      case 'convolver': {
        const rt = effectNode.convolverRuntime;
        if (!rt) break;
        if (target.param === 'wet') {
          rt.wetGain.gain.value = value;
          rt.dryGain.gain.value = 1 - value;
        }
        break;
      }
      case 'gate': {
        const state = (effectNode as Record<string, unknown>)._gateState as { params: Record<string, number | string> } | undefined;
        if (state) (state.params as Record<string, number>)[target.param] = value;
        break;
      }
      case 'deesser': {
        const state = (effectNode as Record<string, unknown>)._deesserState as { params: Record<string, number | string | boolean> } | undefined;
        if (state) (state.params as Record<string, number>)[target.param] = value;
        const filter = (effectNode as Record<string, unknown>)._deesserFilter as BiquadFilterNode | undefined;
        if (filter) {
          if (target.param === 'frequency') filter.frequency.value = value;
          if (target.param === 'bandwidth') filter.Q.value = value;
        }
        break;
      }
      case 'transientShaper': {
        const state = (effectNode as Record<string, unknown>)._transientState as { params: Record<string, number> } | undefined;
        if (state) state.params[target.param] = value;
        if (target.param === 'mix') {
          const dryGain = (effectNode as Record<string, unknown>)._transientDryGain as Tone.Gain | undefined;
          const wetGain = (effectNode as Record<string, unknown>)._transientWetGain as Tone.Gain | undefined;
          if (dryGain) dryGain.gain.value = 1 - value;
          if (wetGain) wetGain.gain.value = value;
        }
        if (target.param === 'output') {
          const outputGain = (effectNode as Record<string, unknown>)._transientOutputGain as Tone.Gain | undefined;
          if (outputGain) outputGain.gain.value = Math.pow(10, value / 20);
        }
        break;
      }
    }
  }

  /** Get compressor gain reduction for metering (0 = no reduction). */
  getCompressorReduction(trackId: string, effectId: string): number {
    const nodes = this.chains.get(trackId);
    if (!nodes) return 0;
    const effectNode = nodes.find((n) => n.id === effectId);
    if (!effectNode || effectNode.type !== 'compressor') return 0;
    return (effectNode.node as Tone.Compressor).reduction;
  }

  /** Get sidechain gain reduction in dB for metering. */
  getSidechainReduction(trackId: string, effectId: string): number {
    const follower = this.sidechains.get(scKey(trackId, effectId));
    return follower ? follower.reduction : 0;
  }

  /**
   * Connect a sidechain source to a compressor on a target track.
   * Inserts SidechainFollower.gainNode after the compressor in the chain.
   */
  connectSidechain(
    targetTrackId: string,
    effectId: string,
    sourceOutput: AudioNode,
    params: CompressorParams,
  ) {
    const key = scKey(targetTrackId, effectId);
    this.disconnectSidechain(targetTrackId, effectId);

    const ctx = sourceOutput.context as AudioContext;
    const follower = new SidechainFollower(ctx, sourceOutput, {
      threshold: params.threshold,
      ratio: params.ratio,
      attack: params.attack,
      release: params.release,
      knee: params.knee,
    });
    this.sidechains.set(key, follower);

    // Insert the gainNode into the chain after the compressor
    const nodes = this.chains.get(targetTrackId);
    if (!nodes) return;
    const compIdx = nodes.findIndex((n) => n.id === effectId && n.type === 'compressor');
    if (compIdx < 0) return;

    const compNode = nodes[compIdx];
    const nextNode = nodes[compIdx + 1];

    if (nextNode) {
      try { compNode.node.disconnect(nextNode.node); } catch { /* ok */ }
      const nextInput = (nextNode.node as unknown as { input?: AudioNode }).input
        ?? (nextNode.node as unknown as AudioNode);
      compNode.node.connect(follower.gainNode as unknown as AudioNode);
      (follower.gainNode as unknown as AudioNode).connect(nextInput);
    } else {
      compNode.node.connect(follower.gainNode as unknown as AudioNode);
    }
  }

  disconnectSidechain(targetTrackId: string, effectId: string) {
    const key = scKey(targetTrackId, effectId);
    const follower = this.sidechains.get(key);
    if (follower) {
      follower.dispose();
      this.sidechains.delete(key);
    }
  }

  updateSidechainParams(targetTrackId: string, effectId: string, params: CompressorParams) {
    const key = scKey(targetTrackId, effectId);
    const follower = this.sidechains.get(key);
    if (follower) {
      follower.updateParams({
        threshold: params.threshold,
        ratio: params.ratio,
        attack: params.attack,
        release: params.release,
        knee: params.knee,
      });
    }
  }

  getChain(trackId: string): EffectNode[] {
    return this.chains.get(trackId) ?? [];
  }

  getInputNode(trackId: string): AudioNode | null {
    if (this.bypassedTracks.get(trackId)) return null;
    const nodes = this.chains.get(trackId);
    if (!nodes?.length) return null;
    return getEffectInput(nodes[0]) ?? null;
  }

  getOutputNode(trackId: string): AudioNode | null {
    if (this.bypassedTracks.get(trackId)) return null;
    const nodes = this.chains.get(trackId);
    if (!nodes?.length) return null;

    // If the last node is a compressor with sidechain, return the follower's gainNode
    const lastNode = nodes[nodes.length - 1];
    if (lastNode.type === 'compressor') {
      const follower = this.sidechains.get(scKey(trackId, lastNode.id));
      if (follower) return follower.gainNode;
    }

    return getEffectOutput(lastNode) ?? null;
  }

  disposeChain(trackId: string) {
    this.bypassedTracks.delete(trackId);
    // Dispose all sidechains for this track
    for (const [key, follower] of this.sidechains) {
      if (key.startsWith(`${trackId}:`)) {
        follower.dispose();
        this.sidechains.delete(key);
      }
    }
    const nodes = this.chains.get(trackId);
    if (!nodes) return;
    for (const node of nodes) {
      if (node.lfo) { node.lfo.stop(); node.lfo.dispose(); }
      if (node.dispose) node.dispose();
      else node.node.dispose();
    }
    this.chains.delete(trackId);
  }

  dispose() {
    this.bypassedTracks.clear();
    for (const follower of this.sidechains.values()) {
      follower.dispose();
    }
    this.sidechains.clear();
    for (const trackId of this.chains.keys()) {
      this.disposeChain(trackId);
    }
  }
}

export const effectsEngine = new EffectsEngine();
