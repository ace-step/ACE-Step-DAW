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
import { SidechainFollower, type SidechainParams } from './sidechainFollower';

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
  /** Active sidechain followers keyed by `${targetTrackId}:${effectId}`. */
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
        // Keep sidechain follower params in sync
        const follower = this.sidechains.get(`${trackId}:${effectId}`);
        if (follower) {
          follower.updateParams({ threshold: p.threshold, ratio: p.ratio, attack: p.attack, release: p.release, knee: p.knee });
        }
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

  // ─── Sidechain Compression ───────────────────────────────────────────────

  /**
   * Set up sidechain compression: taps the source track's output, runs an
   * envelope follower, and inserts a gain-duck node after the compressor.
   */
  setupSidechain(
    targetTrackId: string,
    effectId: string,
    sourceOutput: AudioNode,
    ctx: AudioContext,
    params: CompressorParams,
  ) {
    this.removeSidechain(targetTrackId, effectId);

    const scParams: SidechainParams = {
      threshold: params.threshold,
      ratio: params.ratio,
      attack: params.attack,
      release: params.release,
      knee: params.knee,
    };

    const follower = new SidechainFollower(ctx, sourceOutput, scParams);

    // Insert follower.gainNode after the compressor in the effects chain
    const nodes = this.chains.get(targetTrackId);
    if (nodes) {
      const compIdx = nodes.findIndex((n) => n.id === effectId);
      if (compIdx >= 0) {
        const compOutput = (nodes[compIdx].node as unknown as { output?: AudioNode }).output;
        if (compOutput) {
          try { compOutput.disconnect(); } catch { /* ok */ }
          compOutput.connect(follower.gainNode);
          if (compIdx < nodes.length - 1) {
            const nextInput = (nodes[compIdx + 1].node as unknown as { input?: AudioNode }).input;
            if (nextInput) follower.gainNode.connect(nextInput);
          }
        }
      }
    }

    this.sidechains.set(`${targetTrackId}:${effectId}`, follower);
  }

  removeSidechain(targetTrackId: string, effectId: string) {
    const key = `${targetTrackId}:${effectId}`;
    const follower = this.sidechains.get(key);
    if (!follower) return;

    // Restore direct connection
    const nodes = this.chains.get(targetTrackId);
    if (nodes) {
      const compIdx = nodes.findIndex((n) => n.id === effectId);
      if (compIdx >= 0) {
        const compOutput = (nodes[compIdx].node as unknown as { output?: AudioNode }).output;
        if (compOutput) {
          try { compOutput.disconnect(); } catch { /* ok */ }
          if (compIdx < nodes.length - 1) {
            const nextInput = (nodes[compIdx + 1].node as unknown as { input?: AudioNode }).input;
            if (nextInput) compOutput.connect(nextInput);
          }
        }
      }
    }

    follower.dispose();
    this.sidechains.delete(key);
  }

  hasSidechain(targetTrackId: string, effectId: string): boolean {
    return this.sidechains.has(`${targetTrackId}:${effectId}`);
  }

  /** Get sidechain gain reduction in dB (for metering, returns negative value). */
  getSidechainReduction(targetTrackId: string, effectId: string): number {
    const follower = this.sidechains.get(`${targetTrackId}:${effectId}`);
    if (!follower) return 0;
    return -follower.reduction;
  }

  /** Get compressor gain reduction for metering (includes sidechain). */
  getCompressorReduction(trackId: string, effectId: string): number {
    const nodes = this.chains.get(trackId);
    if (!nodes) return 0;
    const effectNode = nodes.find((n) => n.id === effectId);
    if (!effectNode || effectNode.type !== 'compressor') return 0;
    const compReduction = (effectNode.node as Tone.Compressor).reduction;
    const scReduction = this.getSidechainReduction(trackId, effectId);
    return compReduction + scReduction;
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
    const toneNode = nodes[nodes.length - 1].node as unknown as { output?: AudioNode };
    return toneNode.output ?? null;
  }

  disposeChain(trackId: string) {
    // Remove any sidechains for this track
    for (const [key, follower] of this.sidechains.entries()) {
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
