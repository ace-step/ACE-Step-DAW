import * as Tone from 'tone';
import type {
  TrackEffect,
  TrackEffectType,
  EQ3Params,
  CompressorParams,
  ReverbParams,
  DelayParams,
  DistortionParams,
  FilterParams,
} from '../types/project';

type EffectNode = {
  id: string;
  type: TrackEffectType;
  node: Tone.ToneAudioNode;
  lfo?: Tone.LFO;
};

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
  }
}

class EffectsEngine {
  private chains = new Map<string, EffectNode[]>();

  rebuildChain(trackId: string, effects: TrackEffect[]) {
    this.disposeChain(trackId);
    const activeEffects = effects.filter((e) => e.enabled);
    const nodes = activeEffects.map(createNode);
    for (let i = 0; i < nodes.length - 1; i++) {
      nodes[i].node.connect(nodes[i + 1].node);
    }
    this.chains.set(trackId, nodes);
  }

  /**
   * Update a single effect's parameters in real-time (no full rebuild needed for most effects).
   */
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
      case 'compressor': {
        const p = params as CompressorParams;
        const comp = effectNode.node as Tone.Compressor;
        comp.threshold.value = p.threshold;
        comp.ratio.value = p.ratio;
        comp.attack.value = p.attack;
        comp.release.value = p.release;
        comp.knee.value = p.knee;
        break;
      }
      case 'reverb': {
        const p = params as ReverbParams;
        const rev = effectNode.node as Tone.Reverb;
        rev.decay = p.decay;
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

  getChain(trackId: string): EffectNode[] {
    return this.chains.get(trackId) ?? [];
  }

  /**
   * Returns the native AudioNode input of this track's effect chain, or null if empty.
   * Tone.js ToneAudioNode exposes `.input` which is a native AudioNode suitable for connect().
   */
  getInputNode(trackId: string): AudioNode | null {
    const nodes = this.chains.get(trackId);
    if (!nodes?.length) return null;
    const toneNode = nodes[0].node as unknown as { input?: AudioNode };
    return toneNode.input ?? null;
  }

  /**
   * Returns the native AudioNode output of this track's effect chain, or null if empty.
   * Tone.js ToneAudioNode exposes `.output` which is a native AudioNode suitable for connect().
   */
  getOutputNode(trackId: string): AudioNode | null {
    const nodes = this.chains.get(trackId);
    if (!nodes?.length) return null;
    const toneNode = nodes[nodes.length - 1].node as unknown as { output?: AudioNode };
    return toneNode.output ?? null;
  }

  disposeChain(trackId: string) {
    const nodes = this.chains.get(trackId);
    if (!nodes) return;
    for (const node of nodes) {
      if (node.lfo) { node.lfo.stop(); node.lfo.dispose(); }
      node.node.dispose();
    }
    this.chains.delete(trackId);
  }

  dispose() {
    for (const trackId of this.chains.keys()) {
      this.disposeChain(trackId);
    }
  }
}

export const effectsEngine = new EffectsEngine();
