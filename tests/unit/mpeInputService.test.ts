import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseMidiMessage,
  MpeConfigDetector,
  MPE_CC_SLIDE,
} from '../../src/engine/dsp/core/mpe';

/**
 * Tests for MPE input routing logic.
 *
 * Since the actual mpeInputService.ts depends on Web MIDI API (navigator.requestMIDIAccess),
 * we test the pure routing logic via parseMidiMessage + MpeConfigDetector which are the
 * core of the input service. Integration tests with actual MIDI would be E2E.
 */

describe('MPE input routing', () => {
  describe('MIDI message routing by type', () => {
    it('routes Note On to onNoteOn callback', () => {
      const onNoteOn = vi.fn();
      const msg = parseMidiMessage(new Uint8Array([0x92, 60, 100]));
      if (msg?.type === 'noteOn') {
        onNoteOn(msg.data1, msg.data2 / 127, msg.channel);
      }
      expect(onNoteOn).toHaveBeenCalledWith(60, expect.closeTo(100 / 127, 3), 2);
    });

    it('routes Note Off to onNoteOff callback', () => {
      const onNoteOff = vi.fn();
      const msg = parseMidiMessage(new Uint8Array([0x82, 60, 64]));
      if (msg?.type === 'noteOff') {
        onNoteOff(msg.data1, msg.channel);
      }
      expect(onNoteOff).toHaveBeenCalledWith(60, 2);
    });

    it('routes Pitch Bend to onPitchBend callback', () => {
      const onPitchBend = vi.fn();
      const msg = parseMidiMessage(new Uint8Array([0xe1, 0, 64])); // center bend
      if (msg?.type === 'pitchBend') {
        onPitchBend(msg.channel, msg.data2);
      }
      expect(onPitchBend).toHaveBeenCalledWith(1, 8192);
    });

    it('routes CC74 (slide) to onSlide callback', () => {
      const onSlide = vi.fn();
      const msg = parseMidiMessage(new Uint8Array([0xb3, MPE_CC_SLIDE, 100]));
      if (msg?.type === 'cc' && msg.data1 === MPE_CC_SLIDE) {
        onSlide(msg.channel, msg.data2);
      }
      expect(onSlide).toHaveBeenCalledWith(3, 100);
    });

    it('routes Channel Pressure to onPressure callback', () => {
      const onPressure = vi.fn();
      const msg = parseMidiMessage(new Uint8Array([0xd4, 80]));
      if (msg?.type === 'channelPressure') {
        onPressure(msg.channel, msg.data1);
      }
      expect(onPressure).toHaveBeenCalledWith(4, 80);
    });
  });

  describe('MPE Configuration Message auto-detection', () => {
    let detector: MpeConfigDetector;

    beforeEach(() => {
      detector = new MpeConfigDetector();
    });

    it('enables MPE on receiving MCM on channel 0', () => {
      expect(detector.config.enabled).toBe(false);

      // Simulate receiving MCM via CC messages
      const msgs = [
        new Uint8Array([0xb0, 101, 0]),  // CC 101 = 0 on ch 0
        new Uint8Array([0xb0, 100, 6]),  // CC 100 = 6 on ch 0
        new Uint8Array([0xb0, 6, 15]),   // CC 6 = 15 on ch 0
      ];

      for (const raw of msgs) {
        const msg = parseMidiMessage(raw);
        if (msg?.type === 'cc') {
          detector.processCC(msg.channel, msg.data1, msg.data2);
        }
      }

      expect(detector.config.enabled).toBe(true);
      expect(detector.config.lowerZone?.memberChannelCount).toBe(15);
    });

    it('ignores non-MCM CC sequences', () => {
      // Random CCs on channel 0
      const msgs = [
        new Uint8Array([0xb0, 1, 64]),   // Mod wheel
        new Uint8Array([0xb0, 7, 100]),  // Volume
        new Uint8Array([0xb0, 74, 50]),  // CC74 (slide, but not MCM)
      ];

      for (const raw of msgs) {
        const msg = parseMidiMessage(raw);
        if (msg?.type === 'cc') {
          detector.processCC(msg.channel, msg.data1, msg.data2);
        }
      }

      expect(detector.config.enabled).toBe(false);
    });
  });

  describe('full MPE note lifecycle', () => {
    it('handles complete MPE note with expression', () => {
      const events: string[] = [];
      const detector = new MpeConfigDetector({
        enabled: true,
        lowerZone: { masterChannel: 0, memberChannelCount: 15 },
        upperZone: null,
      });

      // Simulate: Note On ch 1, pitch bend ch 1, slide ch 1, pressure ch 1, Note Off ch 1
      const rawMessages = [
        new Uint8Array([0x91, 60, 100]),    // Note On ch 1
        new Uint8Array([0xe1, 0, 80]),      // Pitch Bend ch 1
        new Uint8Array([0xb1, 74, 64]),     // CC74 (slide) ch 1
        new Uint8Array([0xd1, 90]),         // Channel Pressure ch 1
        new Uint8Array([0x81, 60, 64]),     // Note Off ch 1
      ];

      for (const raw of rawMessages) {
        const msg = parseMidiMessage(raw);
        if (!msg) continue;
        events.push(msg.type);
      }

      expect(events).toEqual(['noteOn', 'pitchBend', 'cc', 'channelPressure', 'noteOff']);
    });

    it('routes member and master channel messages correctly', () => {
      const memberPitchBends: number[] = [];
      const masterPitchBends: number[] = [];

      const config = {
        enabled: true,
        lowerZone: { masterChannel: 0, memberChannelCount: 15 },
        upperZone: null,
      };

      // Pitch bend on member channel (ch 3)
      const memberBend = parseMidiMessage(new Uint8Array([0xe3, 0, 80]));
      if (memberBend?.type === 'pitchBend') {
        const zone = getMpeZoneForChannel(config, memberBend.channel);
        expect(zone).toBe('lower');
        // ch 3 is a member channel, not the master
        if (zone && memberBend.channel !== 0) {
          memberPitchBends.push(memberBend.data2);
        }
      }

      // Pitch bend on master channel (ch 0)
      const masterBend = parseMidiMessage(new Uint8Array([0xe0, 0, 64]));
      if (masterBend?.type === 'pitchBend') {
        const zone = getMpeZoneForChannel(config, masterBend.channel);
        expect(zone).toBeNull(); // master channel is not a member
        masterPitchBends.push(masterBend.data2);
      }

      expect(memberPitchBends).toEqual([10240]); // 0 | (80 << 7)
      expect(masterPitchBends).toEqual([8192]);   // center
    });
  });
});

// Helper function import for completeness
import { getMpeZoneForChannel } from '../../src/engine/dsp/core/mpe';
