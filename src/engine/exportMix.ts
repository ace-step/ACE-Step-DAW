import { audioBufferToWavBlob } from '../utils/wav';
import type { TrackEffect } from '../types/project';

export interface ExportClip {
  startTime: number;
  buffer: AudioBuffer;
  volume: number;
  pan?: number;
  effects?: TrackEffect[];
}

/**
 * Build a simple offline effect chain for export. Currently supports:
 * - eq3 → BiquadFilterNode (lowshelf + peaking + highshelf)
 * - compressor → DynamicsCompressorNode
 * - reverb → ConvolverNode (skipped in offline — too complex without IRs)
 * - delay → DelayNode with feedback
 * - distortion → WaveShaperNode
 * - filter → BiquadFilterNode
 */
function buildOfflineEffects(
  ctx: OfflineAudioContext,
  effects: TrackEffect[],
): { input: AudioNode; output: AudioNode } | null {
  const enabled = effects.filter((e) => e.enabled !== false);
  if (enabled.length === 0) return null;

  const nodes: AudioNode[] = [];

  for (const effect of enabled) {
    switch (effect.type) {
      case 'compressor': {
        const p = effect.params;
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = p.threshold ?? -24;
        comp.ratio.value = p.ratio ?? 4;
        comp.attack.value = p.attack ?? 0.003;
        comp.release.value = p.release ?? 0.25;
        comp.knee.value = p.knee ?? 30;
        nodes.push(comp);
        break;
      }
      case 'distortion': {
        const p = effect.params;
        const shaper = ctx.createWaveShaper();
        const amount = (p.amount ?? 0.5) * 100;
        const samples = 44100;
        const curve = new Float32Array(samples);
        for (let i = 0; i < samples; i++) {
          const x = (i * 2) / samples - 1;
          curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) /
            (Math.PI + amount * Math.abs(x));
        }
        shaper.curve = curve;
        shaper.oversample = '2x';
        nodes.push(shaper);
        break;
      }
      case 'filter': {
        const p = effect.params;
        const filter = ctx.createBiquadFilter();
        filter.type = (p.filterType as BiquadFilterType) ?? 'lowpass';
        filter.frequency.value = p.frequency ?? 1000;
        filter.Q.value = p.resonance ?? 1;
        nodes.push(filter);
        break;
      }
      case 'eq3': {
        const p = effect.params;
        const low = ctx.createBiquadFilter();
        low.type = 'lowshelf';
        low.frequency.value = p.lowFrequency ?? 250;
        low.gain.value = p.low ?? 0;
        nodes.push(low);
        const mid = ctx.createBiquadFilter();
        mid.type = 'peaking';
        mid.frequency.value = 1000;
        mid.Q.value = 1;
        mid.gain.value = p.mid ?? 0;
        nodes.push(mid);
        const high = ctx.createBiquadFilter();
        high.type = 'highshelf';
        high.frequency.value = p.highFrequency ?? 4000;
        high.gain.value = p.high ?? 0;
        nodes.push(high);
        break;
      }
      case 'delay': {
        const p = effect.params;
        const delay = ctx.createDelay(5);
        delay.delayTime.value = p.time ?? 0.25;
        const fbGain = ctx.createGain();
        fbGain.gain.value = p.feedback ?? 0.3;
        const wetGain = ctx.createGain();
        wetGain.gain.value = p.wet ?? 0.3;
        const dryGain = ctx.createGain();
        dryGain.gain.value = 1 - (p.wet ?? 0.3);
        // Dry path: input → dryGain → merge
        // Wet path: input → delay → wetGain → merge, delay → fbGain → delay
        const merge = ctx.createGain();
        const split = ctx.createGain();
        split.connect(dryGain);
        dryGain.connect(merge);
        split.connect(delay);
        delay.connect(wetGain);
        wetGain.connect(merge);
        delay.connect(fbGain);
        fbGain.connect(delay);
        nodes.push(split);
        nodes.push(merge); // merge is the "output" of this pair
        break;
      }
      // reverb skipped — would need impulse responses for offline context
    }
  }

  if (nodes.length === 0) return null;

  // Chain nodes: each node connects to the next
  // Special case: delay uses 2 nodes (split + merge)
  // For simplicity, just chain linearly
  for (let i = 0; i < nodes.length - 1; i++) {
    nodes[i].connect(nodes[i + 1] as AudioNode);
  }

  return { input: nodes[0], output: nodes[nodes.length - 1] };
}

export async function exportMixToWav(
  clips: ExportClip[],
  totalDuration: number,
  sampleRate: number = 48000,
): Promise<Blob> {
  const length = Math.ceil(totalDuration * sampleRate);
  const offlineCtx = new OfflineAudioContext(2, length, sampleRate);

  for (const clip of clips) {
    const source = offlineCtx.createBufferSource();
    source.buffer = clip.buffer;

    const gain = offlineCtx.createGain();
    gain.gain.value = clip.volume;

    // Build effect chain if effects are provided
    const fxChain = clip.effects ? buildOfflineEffects(offlineCtx, clip.effects) : null;

    // Apply stereo pan using a StereoPannerNode when pan is non-zero
    const pan = clip.pan ?? 0;
    let chainEnd: AudioNode;

    if (fxChain) {
      source.connect(fxChain.input);
      fxChain.output.connect(gain);
    } else {
      source.connect(gain);
    }

    if (pan !== 0) {
      const panner = offlineCtx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      gain.connect(panner);
      chainEnd = panner;
    } else {
      chainEnd = gain;
    }

    chainEnd.connect(offlineCtx.destination);
    source.start(clip.startTime);
  }

  const rendered = await offlineCtx.startRendering();
  return audioBufferToWavBlob(rendered);
}
