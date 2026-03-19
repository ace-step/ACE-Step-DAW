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
import { SidechainFollower } from './sidechainFollower';

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

function scKey(trackId: string, effectId: string): string {
  return `${trackId}:${effectId}`;
}

class EffectsEngine {
  private chains = new Map<string, EffectNode[]>();
  private sidechains = new Map<string, SidechainFollower>();

  rebuildChain(trackId: string, effects: TrackEffect[]) {
    this.disposeChain(trackId);
    const activeEffects = effects.filter((e) => e.enabled);
    const nodes = activeEffects.map(createNode);
    for (let i = 0; i < nodes.length - 1; i++) {
      nodes[i].node.connect(nodes[i + 1].node);
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
    const nodes = this.chains.get(trackId);
    if (!nodes?.length) return null;
    const toneNode = nodes[0].node as unknown as { input?: AudioNode };
    return toneNode.input ?? null;
  }

  getOutputNode(trackId: string): AudioNode | null {
    const nodes = this.chains.get(trackId);
    if (!nodes?.length) return null;

    // If the last node is a compressor with sidechain, return the follower's gainNode
    const lastNode = nodes[nodes.length - 1];
    if (lastNode.type === 'compressor') {
      const follower = this.sidechains.get(scKey(trackId, lastNode.id));
      if (follower) return follower.gainNode;
    }

    const toneNode = lastNode.node as unknown as { output?: AudioNode };
    return toneNode.output ?? null;
  }

  disposeChain(trackId: string) {
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
      node.node.dispose();
    }
    this.chains.delete(trackId);
  }

  dispose() {
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
