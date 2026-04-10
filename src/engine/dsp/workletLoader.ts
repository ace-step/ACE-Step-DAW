/**
 * AudioWorklet loader — worklet-only creation.
 *
 * Tries to register and create an AudioWorkletNode. Returns null if
 * AudioWorklet is unavailable (older Safari, insecure context), module
 * registration fails, or AudioWorkletNode construction throws.
 * Callers are responsible for keeping their own ScriptProcessorNode
 * fallback already wired into the audio graph.
 */

import { createDebugLogger } from '../../utils/debugLogger';

const log = createDebugLogger('dsp:worklet-loader');

const registeredWorklets = new WeakMap<AudioContext, Set<string>>();

/**
 * Ensure a worklet module is registered on the given AudioContext.
 * No-ops if already registered for this context + URL combination.
 */
async function ensureWorkletRegistered(ctx: AudioContext, url: string): Promise<boolean> {
  let contextSet = registeredWorklets.get(ctx);
  if (contextSet?.has(url)) return true;
  try {
    await ctx.audioWorklet.addModule(url);
    if (!contextSet) {
      contextSet = new Set();
      registeredWorklets.set(ctx, contextSet);
    }
    contextSet.add(url);
    return true;
  } catch (err) {
    log.warn(`Failed to register worklet ${url}:`, err);
    return false;
  }
}

export interface DspNodeResult {
  /** The AudioWorkletNode (createDspNode returns null if worklet unavailable). */
  node: AudioWorkletNode;
  /** MessagePort for sending parameter updates to the worklet processor. */
  port: MessagePort;
}

/**
 * Try to create an AudioWorkletNode. Returns null if AudioWorklet is
 * unavailable so callers can keep their existing ScriptProcessorNode.
 *
 * @param ctx - AudioContext
 * @param workletUrl - URL of the worklet processor file (e.g., '/reverb-worklet-processor.js')
 * @param processorName - Name registered via registerProcessor() in the worklet file
 * @param channels - Number of input/output channels
 * @param processorOptions - Options passed to the AudioWorkletProcessor constructor
 */
export async function createDspNode(
  ctx: AudioContext,
  workletUrl: string,
  processorName: string,
  channels: number,
  processorOptions: Record<string, unknown>,
): Promise<DspNodeResult | null> {
  // Try AudioWorklet first
  if (typeof AudioWorkletNode !== 'undefined' && ctx.audioWorklet) {
    const registered = await ensureWorkletRegistered(ctx, workletUrl);
    if (registered) {
      try {
        const node = new AudioWorkletNode(ctx, processorName, {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          channelCount: channels,
          outputChannelCount: [channels],
          channelCountMode: 'explicit',
          processorOptions: { sampleRate: ctx.sampleRate, ...processorOptions },
        });
        log.info(`Created AudioWorkletNode: ${processorName}`);
        return { node, port: node.port };
      } catch (err) {
        log.warn(`AudioWorkletNode creation failed for ${processorName}, caller will use existing fallback:`, err);
      }
    }
  }

  // AudioWorklet unavailable — return null so callers can keep their existing fallback
  log.info(`AudioWorklet unavailable for ${processorName}, caller should use existing fallback`);
  return null;
}
