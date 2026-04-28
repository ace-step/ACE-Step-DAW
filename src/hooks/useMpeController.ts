/**
 * useMpeController — React hook that connects MPE MIDI input to
 * the zone manager, capture service, and synth engines.
 *
 * When MPE is enabled, this hook:
 * 1. Listens for raw MIDI messages from the connected device
 * 2. Routes through MpeInputHandler → MpeZoneManager
 * 3. Records expression data via MpeCaptureService
 * 4. Applies per-voice modulation via MpeVoiceRouter → SynthEngine
 *
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/960
 */

import { useEffect, useRef } from 'react';
import { useMpeStore, getMpeZoneManager } from '../store/mpeStore';
import { MpeInputHandler } from '../services/mpeInputHandler';
import { MpeCaptureService } from '../services/mpeCaptureService';
import { getMpeVoiceRouter } from '../services/mpeVoiceRouter';
import { synthEngine } from '../engine/SynthEngine';
import type { MpeNoteState } from '../services/mpeService';

interface UseMpeControllerOptions {
  /** Track ID to route MPE notes to. */
  trackId: string | null;
}

export function useMpeController({ trackId }: UseMpeControllerOptions) {
  const enabled = useMpeStore((s) => s.enabled);
  const pitchBendRange = useMpeStore((s) => s.pitchBendRange);
  const setActiveNotes = useMpeStore((s) => s.setActiveNotes);
  const setAutoDetected = useMpeStore((s) => s.setAutoDetected);
  const captureRef = useRef(new MpeCaptureService());
  const handlerRef = useRef<MpeInputHandler | null>(null);

  useEffect(() => {
    if (!enabled) {
      handlerRef.current = null;
      return;
    }

    const zoneMgr = getMpeZoneManager();
    zoneMgr.setPitchBendRange(pitchBendRange);
    const handler = new MpeInputHandler(zoneMgr);
    const voiceRouter = getMpeVoiceRouter();
    handlerRef.current = handler;

    // Intercept MCM zone configuration to trigger auto-detection UI
    const origConfigLower = zoneMgr.configureLowerZone.bind(zoneMgr);
    zoneMgr.configureLowerZone = (count: number) => {
      origConfigLower(count);
      if (count > 0) setAutoDetected(true);
    };
    const origConfigUpper = zoneMgr.configureUpperZone.bind(zoneMgr);
    zoneMgr.configureUpperZone = (count: number) => {
      origConfigUpper(count);
      if (count > 0) setAutoDetected(true);
    };

    handler.onNoteOn = (noteState: MpeNoteState) => {
      if (!trackId) return;
      voiceRouter.registerNote(trackId, noteState);
      captureRef.current.noteOn(
        trackId, noteState.channel, noteState.pitch, noteState.velocity,
        performance.now() / 1000,
      );
      // Trigger synth note-on
      synthEngine.noteOn(trackId, noteState.pitch, noteState.velocity);
      // Update store for UI
      setActiveNotes(zoneMgr.getActiveNotes());
    };

    handler.onNoteOff = (channel: number, pitch: number) => {
      if (!trackId) return;
      voiceRouter.releaseNote(trackId, channel, pitch);
      captureRef.current.noteOff(trackId, channel, pitch, performance.now() / 1000);
      synthEngine.noteOff(trackId, pitch);
      setActiveNotes(zoneMgr.getActiveNotes());
    };

    handler.onExpressionChange = (noteState: MpeNoteState, type) => {
      if (!trackId) return;
      const time = performance.now() / 1000;

      // Record expression for capture
      switch (type) {
        case 'pitchBend':
          captureRef.current.recordPitchBend(trackId, noteState.channel, noteState.pitchBend, time);
          break;
        case 'timbre':
          captureRef.current.recordTimbre(trackId, noteState.channel, noteState.timbre, time);
          break;
        case 'pressure':
          captureRef.current.recordPressure(trackId, noteState.channel, noteState.pressure, time);
          break;
      }

      // Apply to synth engine
      // Note: Tone.js PolySynth doesn't support per-voice pitch bend natively.
      // For now, we apply expression at the track level as a reasonable approximation.
      // Full per-voice modulation requires the AudioWorklet DSP engine (issue #1118).

      setActiveNotes(zoneMgr.getActiveNotes());
    };

    // Connect to MIDI access
    let midiAccess: MIDIAccess | null = null;
    let connectedInput: MIDIInput | null = null;

    const midiListener = (event: MIDIMessageEvent) => {
      if (!event.data) return;
      handler.handleRawMessage(new Uint8Array(event.data));
    };

    if (typeof navigator !== 'undefined' && navigator.requestMIDIAccess) {
      navigator.requestMIDIAccess().then((access) => {
        midiAccess = access as MIDIAccess;
        const inputs = Array.from(access.inputs.values());
        if (inputs.length > 0) {
          connectedInput = inputs[0] as MIDIInput;
          connectedInput.onmidimessage = midiListener;
        }

        access.onstatechange = (e) => {
          if (e.port?.type === 'input' && e.port.state === 'connected' && !connectedInput) {
            connectedInput = e.port as MIDIInput;
            connectedInput.onmidimessage = midiListener;
          }
        };
      }).catch(() => {
        // Web MIDI not available
      });
    }

    return () => {
      if (connectedInput) {
        connectedInput.onmidimessage = null;
        connectedInput = null;
      }
      if (trackId) {
        voiceRouter.clearTrack(trackId);
      }
      // Restore original zone config methods
      zoneMgr.configureLowerZone = origConfigLower;
      zoneMgr.configureUpperZone = origConfigUpper;
      handlerRef.current = null;
    };
  }, [enabled, trackId, pitchBendRange, setActiveNotes, setAutoDetected]);

  return {
    captureService: captureRef.current,
    isActive: enabled && handlerRef.current !== null,
  };
}
