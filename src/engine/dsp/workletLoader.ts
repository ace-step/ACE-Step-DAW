/**
 * AudioWorklet loader — attempts to create an AudioWorkletNode.
 *
 * Returns the node + port on success, or null if AudioWorklet is
 * unavailable (older Safari, insecure context) or fails to load.
 * Callers are responsible for maintaining their own ScriptProcessorNode
 * fallback — this module does not create fallback nodes.
 */

import { createDebugLogger } from '../../utils/debugLogger';

const log = createDebugLogger('dsp:worklet-loader');

const registeredWorklets = new WeakMap<BaseAudioContext, Set<string>>();

/**
 * Ensure a worklet module is registered on the given AudioContext.
 * No-ops if already registered for this context + URL combination.
 */
async function ensureWorkletRegistered(ctx: AudioContext, url: string): Promise<boolean> {
  let ctxSet = registeredWorklets.get(ctx);
  if (ctxSet?.has(url)) return true;
  try {
    await ctx.audioWorklet.addModule(url);
    if (!ctxSet) { ctxSet = new Set(); registeredWorklets.set(ctx, ctxSet); }
    ctxSet.add(url);
    return true;
  } catch (err) {
    log.warn(`Failed to register worklet ${url}:`, err);
    return false;
  }
}

export interface DspWorkletResult {
  /** The AudioWorkletNode. */
  node: AudioWorkletNode;
  /** MessagePort for sending parameter updates to the worklet processor. */
  port: MessagePort;
}

/**
 * Try to create an AudioWorkletNode. Returns the node + port on success,
 * or null if AudioWorklet is unavailable or creation fails.
 *
 * Callers should keep their existing ScriptProcessorNode wired as fallback
 * and only swap to the worklet node when this returns non-null.
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
): Promise<DspWorkletResult | null> {
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
        log.warn(`AudioWorkletNode creation failed for ${processorName}, falling back:`, err);
      }
    }
  }

  log.info(`AudioWorklet unavailable for ${processorName} — caller should keep existing ScriptProcessor`);
  return null;
}
