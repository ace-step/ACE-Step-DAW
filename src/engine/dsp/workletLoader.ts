/**
 * AudioWorklet loader with ScriptProcessorNode fallback.
 *
 * Tries to register and create an AudioWorkletNode. If AudioWorklet is
 * unavailable (older Safari, insecure context) or fails to load, returns
 * a "not available" result so the caller keeps its existing fallback node.
 */

import { createDebugLogger } from '../../utils/debugLogger';

const log = createDebugLogger('dsp:worklet-loader');

const registeredWorklets = new WeakMap<AudioContext, Set<string>>();

/**
 * Ensure a worklet module is registered on the given AudioContext.
 * No-ops if already registered for this context + URL combination.
 */
async function ensureWorkletRegistered(ctx: AudioContext, url: string): Promise<boolean> {
  let contextWorklets = registeredWorklets.get(ctx);
  if (!contextWorklets) {
    contextWorklets = new Set<string>();
    registeredWorklets.set(ctx, contextWorklets);
  }

  if (contextWorklets.has(url)) return true;

  try {
    await ctx.audioWorklet.addModule(url);
    contextWorklets.add(url);
    return true;
  } catch (err) {
    log.warn(`Failed to register worklet ${url}:`, err);
    return false;
  }
}

export interface WorkletNodeResult {
  /** The AudioWorkletNode, or null if worklet is unavailable. */
  node: AudioWorkletNode | null;
  /** MessagePort for sending parameter updates (null if worklet unavailable). */
  port: MessagePort | null;
  /** Whether this is using the modern AudioWorklet path. */
  isWorklet: boolean;
}

/**
 * Try to create an AudioWorkletNode. Returns null node if unavailable.
 * Callers are responsible for keeping their own ScriptProcessorNode fallback.
 *
 * @param ctx - AudioContext
 * @param workletUrl - URL of the worklet processor file (e.g., '/reverb-worklet-processor.js')
 * @param processorName - Name registered via registerProcessor() in the worklet file
 * @param channels - Number of input/output channels
 * @param processorOptions - Options passed to the AudioWorkletProcessor constructor
 */
export async function tryCreateWorkletNode(
  ctx: AudioContext,
  workletUrl: string,
  processorName: string,
  channels: number,
  processorOptions: Record<string, unknown>,
): Promise<WorkletNodeResult> {
  if (typeof AudioWorkletNode !== 'undefined' && ctx.audioWorklet) {
    const registered = await ensureWorkletRegistered(ctx, workletUrl);
    if (registered) {
      try {
        const node = new AudioWorkletNode(ctx, processorName, {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          channelCount: channels,
          channelCountMode: 'explicit',
          outputChannelCount: [channels],
          processorOptions: { sampleRate: ctx.sampleRate, ...processorOptions },
        });
        log.info(`Created AudioWorkletNode: ${processorName}`);
        return { node, port: node.port, isWorklet: true };
      } catch (err) {
        log.warn(`AudioWorkletNode creation failed for ${processorName}, falling back:`, err);
      }
    }
  }

  return { node: null, port: null, isWorklet: false };
}
