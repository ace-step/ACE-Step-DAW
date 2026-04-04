import { getDSPFactory } from './dsp/ToneAdapter';
import type {
  IDSPNode,
  IDSPGain,
  IDSPFilter,
  IDSPConvolver,
  IDSPLFO,
  IDSPEQ3,
  IDSPCompressor,
  IDSPReverb,
  IDSPDelay,
  IDSPDistortion,
  IDSPChorus,
  IDSPPhaser,
} from './dsp/interfaces';
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
  node: IDSPNode;
  inputNode?: AudioNode;
  outputNode?: AudioNode;
  lfo?: IDSPLFO;
  parametricEqRuntime?: {
    input: IDSPGain;
    output: IDSPGain;
    filters: IDSPFilter[];
  };
  convolverRuntime?: {
    input: IDSPGain;
    output: IDSPGain;
    dryGain: IDSPGain;
    wetGain: IDSPGain;
    convolver: IDSPConvolver;
    preDelayNode: IDSPGain;
  };
  dispose?: () => void;
};

function applyParametricEqFilters(
  input: IDSPGain,
  output: IDSPGain,
  filters: IDSPFilter[],
  params: ParametricEQParams,
) {
  try { input.disconnect(); } catch {}
  for (const filter of filters) {
    try { filter.disconnect(); } catch {}
  }

  params.bands.forEach((band, index) => {
    const filter = filters[index];
    if (!filter) return;
    const nativeType = band.type === 'tiltshelf' ? 'peaking' : band.type;
    filter.type = nativeType as BiquadFilterType;
    filter.frequency.value = band.frequency;
    filter.Q.value = band.q;
    filter.gain.value = band.gain;
  });

  const enabledFilters = filters.filter((_, index) => params.bands[index]?.enabled !== false);
  let previous: IDSPNode = input;
  for (const filter of enabledFilters) {
    previous.connect(filter);
    previous = filter;
  }
  previous.connect(output);
}

function getEffectInput(effectNode: EffectNode): AudioNode {
  return effectNode.inputNode ?? effectNode.node.inputNode;
}

function getEffectOutput(effectNode: EffectNode): AudioNode {
  return effectNode.outputNode ?? effectNode.node.outputNode;
}

function createNode(effect: TrackEffect): EffectNode {
  const factory = getDSPFactory();

  switch (effect.type) {
    case 'eq3': {
      const p = effect.params as EQ3Params;
      const node = factory.createEQ3({
        low: p.low, mid: p.mid, high: p.high,
        lowFrequency: p.lowFrequency, highFrequency: p.highFrequency,
      });
      return { id: effect.id, type: effect.type, node };
    }
    case 'compressor': {
      const p = effect.params as CompressorParams;
      return {
        id: effect.id,
        type: effect.type,
        node: factory.createCompressor({
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
      const input = factory.createGain();
      const output = factory.createGain();
      const filters = p.bands.map(() => factory.createFilter({ type: 'peaking', frequency: 1000, Q: 1 }));
      applyParametricEqFilters(input, output, filters, p);
      return {
        id: effect.id,
        type: effect.type,
        node: input,
        inputNode: input.inputNode,
        outputNode: output.outputNode,
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
        node: factory.createReverb({ decay: p.decay, preDelay: p.preDelay, wet: p.wet }),
      };
    }
    case 'delay': {
      const p = effect.params as DelayParams;
      return {
        id: effect.id,
        type: effect.type,
        node: factory.createDelay({ delayTime: p.time, feedback: p.feedback, wet: p.wet }),
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
        node: factory.createDistortion({ distortion: amount, wet: p.wet }),
      };
    }
    case 'filter': {
      const p = effect.params as FilterParams;
      const node = factory.createFilter({ frequency: p.frequency, type: p.filterType, Q: p.resonance });
      let lfo: IDSPLFO | undefined;
      if (p.lfoEnabled) {
        lfo = factory.createLFO({
          frequency: p.lfoRate,
          min: Math.max(20, p.frequency * (1 - p.lfoDepth)),
          max: Math.min(20000, p.frequency * (1 + p.lfoDepth)),
        });
        lfo.connectParam(node.frequency);
        lfo.start();
      }
      return { id: effect.id, type: effect.type, node, lfo };
    }
    case 'chorus': {
      const p = effect.params as ChorusParams;
      const node = factory.createChorus({
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
      const node = factory.createDelay({
        delayTime: p.delayTime / 1000,
        feedback: Math.abs(p.feedback),
        wet: p.wet,
      });
      const lfo = factory.createLFO({
        frequency: p.frequency,
        min: 0.0005,
        max: Math.max(0.001, p.delayTime / 1000 * p.depth),
      });
      lfo.connectParam(node.delayTime);
      lfo.start();
      return { id: effect.id, type: effect.type, node, lfo };
    }
    case 'phaser': {
      const p = effect.params as PhaserParams;
      return {
        id: effect.id,
        type: effect.type,
        node: factory.createPhaser({
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
      const input = factory.createGain();
      const output = factory.createGain();
      const dryGain = factory.createGain({ gain: 1 - p.wet });
      const wetGain = factory.createGain({ gain: p.wet });
      const preDelayNode = factory.createGain();
      const convolver = factory.createConvolver();

      if (p.irType !== 'custom') {
        const preset = FACTORY_IR_PRESETS[p.irType as FactoryIRType];
        if (preset) {
          try {
            const sampleRate = factory.sampleRate ?? 44100;
            const irData = generateImpulseResponse(preset, sampleRate);
            const ctx = factory.getContext();
            const audioBuffer = ctx.createBuffer(1, irData.length, sampleRate);
            if (audioBuffer) {
              audioBuffer.copyToChannel(irData as Float32Array<ArrayBuffer>, 0);
              convolver.buffer = audioBuffer;
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
        inputNode: input.inputNode,
        outputNode: output.outputNode,
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
      const input = factory.createGain();
      const output = factory.createGain();
      const gateGain = factory.createGain();
      const analyser = factory.getContext().createAnalyser();
      analyser.fftSize = 256;

      input.connect(gateGain);
      gateGain.connect(output);
      // Tap the input for level detection
      input.outputNode.connect(analyser);

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

        gateGain.gain.value = gateState.currentGain;

        gateState.rafId = requestAnimationFrame(tick);
      };
      gateState.rafId = requestAnimationFrame(tick);

      return {
        id: effect.id,
        type: effect.type,
        node: input,
        inputNode: input.inputNode,
        outputNode: output.outputNode,
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
      const input = factory.createGain();
      const output = factory.createGain();
      const deessGain = factory.createGain();

      // Detection band
      const ctx = factory.getContext();
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
      input.outputNode.connect(detectionFilter);
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

        deessGain.gain.value = deesserState.currentGain;

        deesserState.rafId = requestAnimationFrame(tick);
      };
      deesserState.rafId = requestAnimationFrame(tick);

      return {
        id: effect.id,
        type: effect.type,
        node: input,
        inputNode: input.inputNode,
        outputNode: output.outputNode,
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
      const input = factory.createGain();
      const output = factory.createGain();
      const dryGain = factory.createGain();
      const wetGain = factory.createGain({ gain: p.mix });
      const shaperGain = factory.createGain();
      const outputGain = factory.createGain({ gain: Math.pow(10, p.output / 20) });

      const analyser = factory.getContext().createAnalyser();
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
      input.outputNode.connect(analyser);

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

        shaperGain.gain.value = clampedGain;

        transientState.rafId = requestAnimationFrame(tick);
      };
      transientState.rafId = requestAnimationFrame(tick);

      return {
        id: effect.id,
        type: effect.type,
        node: input,
        inputNode: input.inputNode,
        outputNode: output.outputNode,
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
    case 'limiter': {
      // Brickwall limiter with lookahead, gain staging, and configurable release
      const p = effect.params as import('../types/project').LimiterParams;
      const input = factory.createGain({ gain: Math.pow(10, p.gain / 20) }); // input gain stage
      const output = factory.createGain();
      const limiterGain = factory.createGain();
      const ceilingGain = factory.createGain({ gain: Math.pow(10, p.ceiling / 20) });

      const analyser = factory.getContext().createAnalyser();
      analyser.fftSize = 256;
      const analyserBuffer = new Float32Array(analyser.fftSize);

      input.connect(limiterGain);
      limiterGain.connect(ceilingGain);
      ceilingGain.connect(output);
      input.outputNode.connect(analyser);

      const limiterState = {
        currentGain: 1,
        rafId: 0,
        params: { ...p },
        reduction: 0,
      };

      const tick = () => {
        analyser.getFloatTimeDomainData(analyserBuffer);
        let peak = 0;
        for (let i = 0; i < analyserBuffer.length; i++) {
          const abs = Math.abs(analyserBuffer[i]);
          if (abs > peak) peak = abs;
        }

        const sp = limiterState.params;
        const ceilingLinear = Math.pow(10, sp.ceiling / 20);
        const inputGainLinear = Math.pow(10, sp.gain / 20);
        const peakAfterGain = peak * inputGainLinear;

        let targetGain = 1;
        if (peakAfterGain > ceilingLinear && peakAfterGain > 0) {
          targetGain = ceilingLinear / peakAfterGain;
        }

        const dt = 1 / 60;
        // Fast attack for limiting, configurable release
        const coeff = targetGain < limiterState.currentGain
          ? 1 - Math.exp(-dt / 0.0005) // near-instant attack
          : 1 - Math.exp(-dt / Math.max(0.001, sp.release));
        limiterState.currentGain += (targetGain - limiterState.currentGain) * coeff;
        limiterState.reduction = 20 * Math.log10(Math.max(0.0001, limiterState.currentGain));

        limiterGain.gain.value = limiterState.currentGain;

        limiterState.rafId = requestAnimationFrame(tick);
      };
      limiterState.rafId = requestAnimationFrame(tick);

      return {
        id: effect.id,
        type: effect.type,
        node: input,
        inputNode: input.inputNode,
        outputNode: output.outputNode,
        dispose: () => {
          cancelAnimationFrame(limiterState.rafId);
          input.dispose();
          output.dispose();
          limiterGain.dispose();
          ceilingGain.dispose();
          analyser.disconnect();
        },
        _limiterState: limiterState,
        _limiterInputGain: input,
        _limiterCeilingGain: ceilingGain,
      } as EffectNode;
    }
    case 'saturation': {
      // Analog-modeled saturation with multiple character types
      const p = effect.params as import('../types/project').SaturationParams;
      const inputGain = factory.createGain({ gain: Math.pow(10, p.inputGain / 20) });
      const output = factory.createGain();
      const dryGain = factory.createGain({ gain: 1 - p.mix });
      const wetGain = factory.createGain({ gain: p.mix });
      const outputGain = factory.createGain({ gain: Math.pow(10, p.outputGain / 20) });

      // Waveshaper for saturation (native WaveShaperNode)
      const waveshaper = factory.getContext().createWaveShaper();
      const curveLen = 4096;
      const curve = new Float32Array(curveLen);
      for (let i = 0; i < curveLen; i++) {
        const x = (i / (curveLen - 1)) * 2 - 1;
        curve[i] = applySaturationCurve(x, p.drive, p.saturationType, p.harmonicMix);
      }
      waveshaper.curve = curve;

      inputGain.connect(dryGain);
      inputGain.connectNative(waveshaper);
      waveshaper.connect(wetGain.inputNode);
      dryGain.connect(outputGain);
      wetGain.connect(outputGain);
      outputGain.connect(output);

      return {
        id: effect.id,
        type: effect.type,
        node: inputGain,
        inputNode: inputGain.inputNode,
        outputNode: output.outputNode,
        dispose: () => {
          inputGain.dispose();
          output.dispose();
          dryGain.dispose();
          wetGain.dispose();
          outputGain.dispose();
          waveshaper.disconnect();
        },
        _saturationWaveshaper: waveshaper,
        _saturationDryGain: dryGain,
        _saturationWetGain: wetGain,
        _saturationInputGain: inputGain,
        _saturationOutputGain: outputGain,
      } as EffectNode;
    }
    case 'algorithmicReverb': {
      const p = effect.params as import('../types/project').AlgorithmicReverbParams;
      // Use reverb DSP with additional filtering for damping/cut
      const input = factory.createGain();
      const output = factory.createGain();
      const dryGain = factory.createGain({ gain: 1 - p.mix });
      const wetGain = factory.createGain({ gain: p.mix });

      const reverb = factory.createReverb({ decay: p.decay, preDelay: p.preDelay / 1000, wet: 1 });

      // Damping: low-pass filter on reverb output
      const dampingFilter = factory.createFilter({
        type: 'lowpass',
        frequency: 20000 - p.damping * 18000, // damping 0=bright, 1=dark
        Q: 0.5,
      });

      // Low/high cut on reverb input
      const lowCut = factory.createFilter({ type: 'highpass', frequency: p.lowCut, Q: 0.7 });
      const highCut = factory.createFilter({ type: 'lowpass', frequency: p.highCut, Q: 0.7 });

      // Dry path
      input.connect(dryGain);
      dryGain.connect(output);

      // Wet path: input → lowCut → highCut → reverb → dampingFilter → wetGain → output
      input.connect(lowCut);
      lowCut.connect(highCut);
      highCut.connect(reverb);
      reverb.connect(dampingFilter);
      dampingFilter.connect(wetGain);
      wetGain.connect(output);

      return {
        id: effect.id,
        type: effect.type,
        node: input,
        inputNode: input.inputNode,
        outputNode: output.outputNode,
        dispose: () => {
          input.dispose(); output.dispose();
          dryGain.dispose(); wetGain.dispose();
          reverb.dispose(); dampingFilter.dispose();
          lowCut.dispose(); highCut.dispose();
        },
        _algoReverbReverb: reverb,
        _algoReverbDryGain: dryGain,
        _algoReverbWetGain: wetGain,
        _algoReverbDamping: dampingFilter,
        _algoReverbLowCut: lowCut,
        _algoReverbHighCut: highCut,
      } as EffectNode;
    }
    case 'noiseReduction': {
      // Simple noise gate with high-frequency emphasis
      const p = effect.params as import('../types/project').NoiseGateReductionParams;
      const input = factory.createGain();
      const output = factory.createGain();
      const nrGain = factory.createGain();

      const analyser = factory.getContext().createAnalyser();
      analyser.fftSize = 256;
      const analyserBuffer = new Float32Array(analyser.fftSize);

      input.connect(nrGain);
      nrGain.connect(output);
      input.outputNode.connect(analyser);

      const nrState = {
        currentGain: 1,
        rafId: 0,
        params: { ...p },
      };

      const tick = () => {
        analyser.getFloatTimeDomainData(analyserBuffer);
        let sumSq = 0;
        for (let i = 0; i < analyserBuffer.length; i++) sumSq += analyserBuffer[i] * analyserBuffer[i];
        const rms = Math.sqrt(sumSq / analyserBuffer.length);
        const inputDb = rms > 0 ? 20 * Math.log10(rms) : -120;

        const sp = nrState.params;
        let targetGain = 1;
        if (inputDb < sp.threshold) {
          // Below threshold: reduce by amount
          targetGain = 1 - sp.amount;
        }

        const dt = 1 / 60;
        const speed = sp.mode === 'fast' ? 0.005 : 0.05;
        const coeff = targetGain < nrState.currentGain
          ? 1 - Math.exp(-dt / speed)
          : 1 - Math.exp(-dt / (speed * 4));
        nrState.currentGain += (targetGain - nrState.currentGain) * coeff;

        nrGain.gain.value = nrState.currentGain;

        nrState.rafId = requestAnimationFrame(tick);
      };
      nrState.rafId = requestAnimationFrame(tick);

      return {
        id: effect.id,
        type: effect.type,
        node: input,
        inputNode: input.inputNode,
        outputNode: output.outputNode,
        dispose: () => {
          cancelAnimationFrame(nrState.rafId);
          input.dispose(); output.dispose(); nrGain.dispose();
          analyser.disconnect();
        },
        _nrState: nrState,
      } as EffectNode;
    }
    case 'stereoImager': {
      // Stereo width via M/S matrix: width controls side level relative to mid
      const p = effect.params as import('../types/project').StereoImagerParams;
      const input = factory.createGain();
      const output = factory.createGain();

      // Use channel splitter/merger for M/S processing
      const ctx = factory.getContext();
      const splitter = ctx.createChannelSplitter(2);
      const merger = ctx.createChannelMerger(2);

      // Simplified L/R width matrix:
      // L_out = L*(1+w)/2 + R*(1-w)/2
      // R_out = R*(1+w)/2 + L*(1-w)/2
      const llGain = ctx.createGain();
      const lrGain = ctx.createGain();
      const rlGain = ctx.createGain();
      const rrGain = ctx.createGain();

      const w = Math.max(0, Math.min(2, p.width));
      llGain.gain.value = (1 + w) / 2;
      lrGain.gain.value = (1 - w) / 2;
      rlGain.gain.value = (1 - w) / 2;
      rrGain.gain.value = (1 + w) / 2;

      input.outputNode.connect(splitter);

      splitter.connect(llGain, 0);
      splitter.connect(lrGain, 1);
      splitter.connect(rlGain, 0);
      splitter.connect(rrGain, 1);

      llGain.connect(merger, 0, 0);
      lrGain.connect(merger, 0, 0);
      rlGain.connect(merger, 0, 1);
      rrGain.connect(merger, 0, 1);

      merger.connect(output.inputNode);

      return {
        id: effect.id,
        type: effect.type,
        node: input,
        inputNode: input.inputNode,
        outputNode: output.outputNode,
        dispose: () => {
          input.dispose();
          output.dispose();
          splitter.disconnect();
          merger.disconnect();
          llGain.disconnect();
          lrGain.disconnect();
          rlGain.disconnect();
          rrGain.disconnect();
        },
        _stereoGains: { llGain, lrGain, rlGain, rrGain },
      } as EffectNode;
    }
  }
}

function applySaturationCurve(
  x: number,
  drive: number,
  type: import('../types/project').SaturationType,
  harmonicMix: number,
): number {
  const d = 1 + drive * 10; // drive multiplier
  const input = x * d;

  let odd: number; // odd harmonics (asymmetric)
  let even: number; // even harmonics (symmetric)

  switch (type) {
    case 'tape':
      // Soft saturation with gentle compression — tanh approximation
      odd = Math.tanh(input);
      even = Math.tanh(input * input) * Math.sign(input) * 0.5;
      break;
    case 'tube':
      // Asymmetric triode-style clipping
      odd = input > 0
        ? 1 - Math.exp(-input)
        : -Math.tanh(-input * 0.8);
      even = (1 - Math.exp(-Math.abs(input))) * Math.sign(input) * 0.3;
      break;
    case 'transistor':
      // Hard-knee transistor clipping
      odd = Math.max(-1, Math.min(1, input * 1.2)) * 0.9 + Math.tanh(input * 0.3) * 0.1;
      even = Math.tanh(input * input * 0.5) * Math.sign(input) * 0.4;
      break;
    case 'soft':
      // Gentle soft clip
      odd = input / (1 + Math.abs(input));
      even = 0;
      break;
    case 'hard':
    default:
      // Hard clip
      odd = Math.max(-1, Math.min(1, input));
      even = 0;
      break;
  }

  // Blend odd/even harmonics: -1 = pure odd, 0 = balanced, +1 = pure even
  const evenWeight = Math.max(0, harmonicMix);
  const oddWeight = 1 - evenWeight;
  const result = odd * oddWeight + even * evenWeight;

  return Math.max(-1, Math.min(1, result / d)); // normalize back
}

function scKey(trackId: string, effectId: string): string {
  return `${trackId}:${effectId}`;
}

class EffectsEngine {
  private chains = new Map<string, EffectNode[]>();
  private bypassedTracks = new Map<string, boolean>();
  private sidechains = new Map<string, SidechainFollower>();

  // WASM DSP integration
  private wasmNodes = new Map<string, import('../wasm/WasmDspEngine').WasmDspNode>();
  private _useWasm = false;
  private _wasmEngine: typeof import('../wasm/WasmDspEngine') | null = null;
  private _wasmMapper: typeof import('./wasmParamMapper') | null = null;

  /** Enable/disable WASM DSP routing. Called after WasmDspEngine.initialize() succeeds. */
  setUseWasm(enabled: boolean, wasmEngine?: typeof import('../wasm/WasmDspEngine'), mapper?: typeof import('./wasmParamMapper')) {
    this._useWasm = enabled;
    if (wasmEngine) this._wasmEngine = wasmEngine;
    if (mapper) this._wasmMapper = mapper;
  }

  rebuildChain(trackId: string, effects: TrackEffect[], bypassed = false) {
    this.disposeChain(trackId);
    this.bypassedTracks.set(trackId, bypassed);
    const activeEffects = effects.filter((e) => e.enabled);
    if (activeEffects.length === 0) return;

    // Try WASM path: single AudioWorkletNode per track
    if (this._useWasm && this._wasmEngine && this._wasmMapper) {
      const { canUseWasmForChain, applyEffectsToWasmNode } = this._wasmMapper;
      if (canUseWasmForChain(activeEffects)) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const eng = this._wasmEngine as any;
          const ctx = getDSPFactory().getContext();
          const wasmNode = eng.createProcessor(ctx, trackId) as import('../wasm/WasmDspEngine').WasmDspNode;
          applyEffectsToWasmNode(wasmNode, activeEffects);
          this.wasmNodes.set(trackId, wasmNode);
          return;
        } catch (err) {
          console.warn(`[EffectsEngine] WASM chain failed for ${trackId}, falling back to Tone.js`, err);
        }
      }
    }

    // Tone.js path (unchanged)
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
    // WASM path: re-map the single changed effect
    const wasmNode = this.wasmNodes.get(trackId);
    if (wasmNode && this._wasmMapper) {
      const msg = this._wasmMapper.mapEffectToWasm(effectType, params as unknown as Record<string, unknown>);
      if (msg) wasmNode.audioNode.port.postMessage(msg);
      return;
    }

    const nodes = this.chains.get(trackId);
    if (!nodes) return;
    const effectNode = nodes.find((n) => n.id === effectId);
    if (!effectNode) return;

    switch (effectType) {
      case 'eq3': {
        const p = params as EQ3Params;
        const eq = effectNode.node as IDSPEQ3;
        eq.low = p.low;
        eq.mid = p.mid;
        eq.high = p.high;
        eq.lowFrequency = p.lowFrequency;
        eq.highFrequency = p.highFrequency;
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
        const comp = effectNode.node as IDSPCompressor;
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
        const rev = effectNode.node as IDSPReverb;
        rev.decay = p.decay;
        rev.preDelay = p.preDelay;
        rev.wet = p.wet;
        break;
      }
      case 'delay': {
        const p = params as DelayParams;
        const del = effectNode.node as IDSPDelay;
        del.delayTime.value = p.time;
        del.feedback = p.feedback;
        del.wet = p.wet;
        break;
      }
      case 'distortion': {
        const p = params as DistortionParams;
        const dist = effectNode.node as IDSPDistortion;
        dist.distortion =
          p.distortionType === 'overdrive' ? p.amount * 0.5 :
          p.distortionType === 'fuzz' ? Math.min(1, p.amount * 1.5) :
          p.amount;
        dist.wet = p.wet;
        break;
      }
      case 'filter': {
        const p = params as FilterParams;
        const filt = effectNode.node as IDSPFilter;
        filt.frequency.value = p.frequency;
        filt.Q.value = p.resonance;
        filt.type = p.filterType;

        if (p.lfoEnabled && !effectNode.lfo) {
          const lfo = getDSPFactory().createLFO({
            frequency: p.lfoRate,
            min: Math.max(20, p.frequency * (1 - p.lfoDepth)),
            max: Math.min(20000, p.frequency * (1 + p.lfoDepth)),
          });
          lfo.connectParam(filt.frequency);
          lfo.start();
          effectNode.lfo = lfo;
        } else if (!p.lfoEnabled && effectNode.lfo) {
          effectNode.lfo.stop();
          effectNode.lfo.dispose();
          effectNode.lfo = undefined;
        } else if (p.lfoEnabled && effectNode.lfo) {
          effectNode.lfo.frequency = p.lfoRate;
          effectNode.lfo.min = Math.max(20, p.frequency * (1 - p.lfoDepth));
          effectNode.lfo.max = Math.min(20000, p.frequency * (1 + p.lfoDepth));
        }
        break;
      }
      case 'chorus': {
        const p = params as ChorusParams;
        const chorus = effectNode.node as IDSPChorus;
        chorus.frequency = p.frequency;
        chorus.delayTime = p.delayTime;
        chorus.depth = p.depth;
        chorus.feedback = p.feedback;
        chorus.wet = p.wet;
        break;
      }
      case 'flanger': {
        const p = params as FlangerParams;
        const flanger = effectNode.node as IDSPDelay;
        flanger.delayTime.value = p.delayTime / 1000;
        flanger.feedback = Math.abs(p.feedback);
        flanger.wet = p.wet;
        if (effectNode.lfo) {
          effectNode.lfo.frequency = p.frequency;
          effectNode.lfo.max = Math.max(0.001, p.delayTime / 1000 * p.depth);
        }
        break;
      }
      case 'phaser': {
        const p = params as PhaserParams;
        const phaser = effectNode.node as IDSPPhaser;
        phaser.frequency = p.frequency;
        phaser.octaves = p.octaves;
        phaser.Q = p.Q;
        phaser.baseFrequency = p.baseFrequency;
        phaser.wet = p.wet;
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
        const dryGain = (effectNode as Record<string, unknown>)._transientDryGain as IDSPGain | undefined;
        const wetGain = (effectNode as Record<string, unknown>)._transientWetGain as IDSPGain | undefined;
        const outputGain = (effectNode as Record<string, unknown>)._transientOutputGain as IDSPGain | undefined;
        if (dryGain) dryGain.gain.value = 1 - p.mix;
        if (wetGain) wetGain.gain.value = p.mix;
        if (outputGain) outputGain.gain.value = Math.pow(10, p.output / 20);
        break;
      }
      case 'limiter': {
        const p = params as import('../types/project').LimiterParams;
        const state = (effectNode as Record<string, unknown>)._limiterState as { params: import('../types/project').LimiterParams } | undefined;
        if (state) Object.assign(state.params, p);
        const ig = (effectNode as Record<string, unknown>)._limiterInputGain as IDSPGain | undefined;
        const cg = (effectNode as Record<string, unknown>)._limiterCeilingGain as IDSPGain | undefined;
        if (ig) ig.gain.value = Math.pow(10, p.gain / 20);
        if (cg) cg.gain.value = Math.pow(10, p.ceiling / 20);
        break;
      }
      case 'saturation': {
        const p = params as import('../types/project').SaturationParams;
        const ws = (effectNode as Record<string, unknown>)._saturationWaveshaper as WaveShaperNode | undefined;
        if (ws) {
          const curve = new Float32Array(4096);
          for (let i = 0; i < 4096; i++) {
            const x = (i / 4095) * 2 - 1;
            curve[i] = applySaturationCurve(x, p.drive, p.saturationType, p.harmonicMix);
          }
          ws.curve = curve;
        }
        const dg = (effectNode as Record<string, unknown>)._saturationDryGain as IDSPGain | undefined;
        const wg = (effectNode as Record<string, unknown>)._saturationWetGain as IDSPGain | undefined;
        const ig = (effectNode as Record<string, unknown>)._saturationInputGain as IDSPGain | undefined;
        const og = (effectNode as Record<string, unknown>)._saturationOutputGain as IDSPGain | undefined;
        if (dg) dg.gain.value = 1 - p.mix;
        if (wg) wg.gain.value = p.mix;
        if (ig) ig.gain.value = Math.pow(10, p.inputGain / 20);
        if (og) og.gain.value = Math.pow(10, p.outputGain / 20);
        break;
      }
      case 'stereoImager': {
        const p = params as import('../types/project').StereoImagerParams;
        const gains = (effectNode as Record<string, unknown>)._stereoGains as {
          llGain: GainNode; lrGain: GainNode; rlGain: GainNode; rrGain: GainNode;
        } | undefined;
        if (gains) {
          const w = Math.max(0, Math.min(2, p.width));
          gains.llGain.gain.value = (1 + w) / 2;
          gains.lrGain.gain.value = (1 - w) / 2;
          gains.rlGain.gain.value = (1 - w) / 2;
          gains.rrGain.gain.value = (1 + w) / 2;
        }
        break;
      }
      case 'algorithmicReverb': {
        const p = params as import('../types/project').AlgorithmicReverbParams;
        const rev = (effectNode as Record<string, unknown>)._algoReverbReverb as IDSPReverb | undefined;
        const dg = (effectNode as Record<string, unknown>)._algoReverbDryGain as IDSPGain | undefined;
        const wg = (effectNode as Record<string, unknown>)._algoReverbWetGain as IDSPGain | undefined;
        const df = (effectNode as Record<string, unknown>)._algoReverbDamping as IDSPFilter | undefined;
        const lc = (effectNode as Record<string, unknown>)._algoReverbLowCut as IDSPFilter | undefined;
        const hc = (effectNode as Record<string, unknown>)._algoReverbHighCut as IDSPFilter | undefined;
        if (rev) { rev.decay = p.decay; rev.preDelay = p.preDelay / 1000; }
        if (dg) dg.gain.value = 1 - p.mix;
        if (wg) wg.gain.value = p.mix;
        if (df) df.frequency.value = 20000 - p.damping * 18000;
        if (lc) lc.frequency.value = p.lowCut;
        if (hc) hc.frequency.value = p.highCut;
        break;
      }
      case 'noiseReduction': {
        const p = params as import('../types/project').NoiseGateReductionParams;
        const state = (effectNode as Record<string, unknown>)._nrState as { params: import('../types/project').NoiseGateReductionParams } | undefined;
        if (state) Object.assign(state.params, p);
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
        const eq = effectNode.node as IDSPEQ3;
        if (target.param === 'low') eq.low = value;
        if (target.param === 'mid') eq.mid = value;
        if (target.param === 'high') eq.high = value;
        if (target.param === 'lowFrequency') eq.lowFrequency = value;
        if (target.param === 'highFrequency') eq.highFrequency = value;
        break;
      }
      case 'compressor': {
        const comp = effectNode.node as IDSPCompressor;
        if (target.param === 'threshold') comp.threshold.value = value;
        if (target.param === 'ratio') comp.ratio.value = value;
        if (target.param === 'attack') comp.attack.value = value;
        if (target.param === 'release') comp.release.value = value;
        if (target.param === 'knee') comp.knee.value = value;
        break;
      }
      case 'reverb': {
        const rev = effectNode.node as IDSPReverb;
        if (target.param === 'decay') rev.decay = value;
        if (target.param === 'preDelay') rev.preDelay = value;
        if (target.param === 'wet') rev.wet = value;
        break;
      }
      case 'delay': {
        const delay = effectNode.node as IDSPDelay;
        if (target.param === 'time') delay.delayTime.value = value;
        if (target.param === 'feedback') delay.feedback = value;
        if (target.param === 'wet') delay.wet = value;
        break;
      }
      case 'distortion': {
        const dist = effectNode.node as IDSPDistortion;
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
        if (target.param === 'wet') dist.wet = value;
        break;
      }
      case 'filter': {
        const filter = effectNode.node as IDSPFilter;
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
        if (target.param === 'lfoRate' && effectNode.lfo) effectNode.lfo.frequency = value;
        if (target.param === 'lfoDepth' && effectNode.lfo) {
          const freq = Number(filter.frequency.value);
          effectNode.lfo.min = Math.max(20, freq * (1 - value));
          effectNode.lfo.max = Math.min(20000, freq * (1 + value));
        }
        break;
      }
      case 'chorus': {
        const chorus = effectNode.node as IDSPChorus;
        if (target.param === 'frequency') chorus.frequency = value;
        if (target.param === 'delayTime') chorus.delayTime = value;
        if (target.param === 'depth') chorus.depth = value;
        if (target.param === 'feedback') chorus.feedback = value;
        if (target.param === 'wet') chorus.wet = value;
        break;
      }
      case 'flanger': {
        const flanger = effectNode.node as IDSPDelay;
        if (target.param === 'frequency' && effectNode.lfo) effectNode.lfo.frequency = value;
        if (target.param === 'delayTime') flanger.delayTime.value = value / 1000;
        if (target.param === 'depth' && effectNode.lfo) {
          const delayMs = Number(flanger.delayTime.value) * 1000;
          effectNode.lfo.max = Math.max(0.001, delayMs / 1000 * value);
        }
        if (target.param === 'feedback') flanger.feedback = Math.abs(value);
        if (target.param === 'wet') flanger.wet = value;
        break;
      }
      case 'phaser': {
        const phaser = effectNode.node as IDSPPhaser;
        if (target.param === 'frequency') phaser.frequency = value;
        if (target.param === 'octaves') phaser.octaves = value;
        if (target.param === 'Q') phaser.Q = value;
        if (target.param === 'baseFrequency') phaser.baseFrequency = value;
        if (target.param === 'wet') phaser.wet = value;
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
          const dryGain = (effectNode as Record<string, unknown>)._transientDryGain as IDSPGain | undefined;
          const wetGain = (effectNode as Record<string, unknown>)._transientWetGain as IDSPGain | undefined;
          if (dryGain) dryGain.gain.value = 1 - value;
          if (wetGain) wetGain.gain.value = value;
        }
        if (target.param === 'output') {
          const outputGain = (effectNode as Record<string, unknown>)._transientOutputGain as IDSPGain | undefined;
          if (outputGain) outputGain.gain.value = Math.pow(10, value / 20);
        }
        break;
      }
      case 'limiter': {
        const state = (effectNode as Record<string, unknown>)._limiterState as { params: Record<string, number | string> } | undefined;
        if (state) (state.params as Record<string, number>)[target.param] = value;
        if (target.param === 'gain') {
          const ig = (effectNode as Record<string, unknown>)._limiterInputGain as IDSPGain | undefined;
          if (ig) ig.gain.value = Math.pow(10, value / 20);
        }
        if (target.param === 'ceiling') {
          const cg = (effectNode as Record<string, unknown>)._limiterCeilingGain as IDSPGain | undefined;
          if (cg) cg.gain.value = Math.pow(10, value / 20);
        }
        break;
      }
      case 'saturation': {
        if (target.param === 'mix') {
          const dg = (effectNode as Record<string, unknown>)._saturationDryGain as IDSPGain | undefined;
          const wg = (effectNode as Record<string, unknown>)._saturationWetGain as IDSPGain | undefined;
          if (dg) dg.gain.value = 1 - value;
          if (wg) wg.gain.value = value;
        }
        if (target.param === 'inputGain') {
          const ig = (effectNode as Record<string, unknown>)._saturationInputGain as IDSPGain | undefined;
          if (ig) ig.gain.value = Math.pow(10, value / 20);
        }
        if (target.param === 'outputGain') {
          const og = (effectNode as Record<string, unknown>)._saturationOutputGain as IDSPGain | undefined;
          if (og) og.gain.value = Math.pow(10, value / 20);
        }
        break;
      }
      case 'stereoImager': {
        if (target.param === 'width') {
          const gains = (effectNode as Record<string, unknown>)._stereoGains as {
            llGain: GainNode; lrGain: GainNode; rlGain: GainNode; rrGain: GainNode;
          } | undefined;
          if (gains) {
            const w = Math.max(0, Math.min(2, value));
            gains.llGain.gain.value = (1 + w) / 2;
            gains.lrGain.gain.value = (1 - w) / 2;
            gains.rlGain.gain.value = (1 - w) / 2;
            gains.rrGain.gain.value = (1 + w) / 2;
          }
        }
        break;
      }
      case 'algorithmicReverb': {
        if (target.param === 'mix') {
          const dg = (effectNode as Record<string, unknown>)._algoReverbDryGain as IDSPGain | undefined;
          const wg = (effectNode as Record<string, unknown>)._algoReverbWetGain as IDSPGain | undefined;
          if (dg) dg.gain.value = 1 - value;
          if (wg) wg.gain.value = value;
        }
        if (target.param === 'damping') {
          const df = (effectNode as Record<string, unknown>)._algoReverbDamping as IDSPFilter | undefined;
          if (df) df.frequency.value = 20000 - value * 18000;
        }
        if (target.param === 'decay') {
          const rev = (effectNode as Record<string, unknown>)._algoReverbReverb as IDSPReverb | undefined;
          if (rev) rev.decay = value;
        }
        break;
      }
      case 'noiseReduction': {
        const state = (effectNode as Record<string, unknown>)._nrState as { params: Record<string, number | string> } | undefined;
        if (state) (state.params as Record<string, number>)[target.param] = value;
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
    return (effectNode.node as IDSPCompressor & { reduction?: number }).reduction ?? 0;
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
      const nextInput = nextNode.node.inputNode;
      compNode.node.connectNative(follower.gainNode as unknown as AudioNode);
      (follower.gainNode as unknown as AudioNode).connect(nextInput);
    } else {
      compNode.node.connectNative(follower.gainNode as unknown as AudioNode);
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
    // WASM path: AudioWorkletNode is both input and output
    const wasmNode = this.wasmNodes.get(trackId);
    if (wasmNode) return wasmNode.audioNode;
    const nodes = this.chains.get(trackId);
    if (!nodes?.length) return null;
    return getEffectInput(nodes[0]) ?? null;
  }

  getOutputNode(trackId: string): AudioNode | null {
    if (this.bypassedTracks.get(trackId)) return null;
    // WASM path
    const wasmNode = this.wasmNodes.get(trackId);
    if (wasmNode) return wasmNode.audioNode;
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
    // Dispose WASM node if present
    const wasmNode = this.wasmNodes.get(trackId);
    if (wasmNode) {
      try { wasmNode.audioNode.disconnect(); } catch { /* already disconnected */ }
      try { wasmNode.audioNode.port.close(); } catch { /* already closed */ }
      this.wasmNodes.delete(trackId);
    }
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
    // Dispose all WASM nodes
    for (const wasmNode of this.wasmNodes.values()) {
      try { wasmNode.audioNode.disconnect(); } catch { /* ok */ }
      try { wasmNode.audioNode.port.close(); } catch { /* ok */ }
    }
    this.wasmNodes.clear();
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

/**
 * Initialize WASM DSP and wire it into the effects engine.
 * Call once after AudioContext is available. Safe to call multiple times (idempotent).
 * Returns true if WASM is ready, false on fallback to Tone.js.
 */
export async function initWasmDsp(): Promise<boolean> {
  try {
    const wasmEngine = await import('../wasm/WasmDspEngine');
    const mapper = await import('./wasmParamMapper');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eng = wasmEngine as any;
    const ctx = getDSPFactory().getContext();
    await eng.initialize(ctx);
    effectsEngine.setUseWasm(true, eng, mapper);
    console.info('[WASM DSP] Initialized — effects will route through WASM when compatible');
    return true;
  } catch (err) {
    console.warn('[WASM DSP] Init failed, using Tone.js fallback:', err);
    effectsEngine.setUseWasm(false);
    return false;
  }
}
