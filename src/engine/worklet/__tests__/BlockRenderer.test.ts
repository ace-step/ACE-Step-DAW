import { describe, it, expect } from 'vitest';
import { BlockRenderer } from '../BlockRenderer';
import type { ScheduledEvent } from '../BlockRenderer';

describe('BlockRenderer', () => {
  const SAMPLE_RATE = 48000;

  it('has correct initial state', () => {
    const br = new BlockRenderer(SAMPLE_RATE);
    expect(br.position).toBe(0);
    expect(br.isPlaying).toBe(false);
    expect(br.bpm).toBe(120);
  });

  it('play sets isPlaying and position', () => {
    const br = new BlockRenderer(SAMPLE_RATE);
    br.play(1000);
    expect(br.isPlaying).toBe(true);
    expect(br.position).toBe(1000);
  });

  it('stop sets isPlaying to false', () => {
    const br = new BlockRenderer(SAMPLE_RATE);
    br.play();
    br.stop();
    expect(br.isPlaying).toBe(false);
  });

  it('nextBlock advances position by blockSize when playing', () => {
    const br = new BlockRenderer(SAMPLE_RATE);
    br.play(0);

    const block = br.nextBlock(128);
    expect(block.startSample).toBe(0);
    expect(block.endSample).toBe(128);
    expect(br.position).toBe(128);

    const block2 = br.nextBlock(128);
    expect(block2.startSample).toBe(128);
    expect(block2.endSample).toBe(256);
    expect(br.position).toBe(256);
  });

  it('nextBlock does not advance position when stopped', () => {
    const br = new BlockRenderer(SAMPLE_RATE);
    br.stop();
    br.nextBlock(128);
    expect(br.position).toBe(0);
  });

  it('splits events into correct blocks', () => {
    const br = new BlockRenderer(SAMPLE_RATE);
    br.play(0);

    br.scheduleEvents([
      { sampleTime: 50, type: 'noteOn', data: { pitch: 60 } },
      { sampleTime: 130, type: 'noteOn', data: { pitch: 64 } },
      { sampleTime: 200, type: 'noteOff', data: { pitch: 60 } },
    ]);

    // Block 0: [0, 128) — should contain event at sample 50
    const block1 = br.nextBlock(128);
    expect(block1.events).toHaveLength(1);
    expect(block1.events[0].sampleTime).toBe(50);

    // Block 1: [128, 256) — should contain events at 130 and 200
    const block2 = br.nextBlock(128);
    expect(block2.events).toHaveLength(2);
    expect(block2.events[0].sampleTime).toBe(130);
    expect(block2.events[1].sampleTime).toBe(200);
  });

  it('events at block boundary go to later block', () => {
    const br = new BlockRenderer(SAMPLE_RATE);
    br.play(0);

    br.scheduleEvent({ sampleTime: 128, type: 'test', data: null });

    // Block [0, 128) — event at 128 should NOT be included
    const block1 = br.nextBlock(128);
    expect(block1.events).toHaveLength(0);

    // Block [128, 256) — event at 128 should be included
    const block2 = br.nextBlock(128);
    expect(block2.events).toHaveLength(1);
    expect(block2.events[0].sampleTime).toBe(128);
  });

  it('clearEvents removes all scheduled events', () => {
    const br = new BlockRenderer(SAMPLE_RATE);
    br.scheduleEvent({ sampleTime: 10, type: 'test', data: null });
    br.clearEvents();
    br.play(0);
    const block = br.nextBlock(128);
    expect(block.events).toHaveLength(0);
  });

  it('seek changes position without affecting play state', () => {
    const br = new BlockRenderer(SAMPLE_RATE);
    br.play(0);
    br.seek(10000);
    expect(br.position).toBe(10000);
    expect(br.isPlaying).toBe(true);
  });

  it('beatsToSamples converts correctly', () => {
    const br = new BlockRenderer(SAMPLE_RATE);
    br.setTempo(120);
    // 1 beat at 120 BPM = 0.5 seconds = 24000 samples
    expect(br.beatsToSamples(1)).toBe(24000);
    // 4 beats = 2 seconds = 96000 samples
    expect(br.beatsToSamples(4)).toBe(96000);
  });

  it('samplesToBeats converts correctly', () => {
    const br = new BlockRenderer(SAMPLE_RATE);
    br.setTempo(120);
    // 24000 samples at 120 BPM = 1 beat
    expect(br.samplesToBeats(24000)).toBeCloseTo(1, 5);
  });

  it('getTransportState returns current state', () => {
    const br = new BlockRenderer(SAMPLE_RATE);
    br.play(500);
    br.setTempo(140);

    const state = br.getTransportState();
    expect(state.positionSamples).toBe(500);
    expect(state.isPlaying).toBe(true);
    expect(state.bpm).toBe(140);
    expect(state.sampleRate).toBe(SAMPLE_RATE);
  });

  it('events are consumed and not returned again', () => {
    const br = new BlockRenderer(SAMPLE_RATE);
    br.play(0);
    br.scheduleEvent({ sampleTime: 10, type: 'test', data: null });

    const block1 = br.nextBlock(128);
    expect(block1.events).toHaveLength(1);

    // Same block range but event already consumed
    br.seek(0);
    br.play(0);
    const block2 = br.nextBlock(128);
    expect(block2.events).toHaveLength(0);
  });

  it('stopped nextBlock does not consume events', () => {
    const br = new BlockRenderer(SAMPLE_RATE);
    br.scheduleEvent({ sampleTime: 10, type: 'test', data: null });
    br.stop();
    br.nextBlock(128); // should NOT consume the event
    br.play(0);
    const block = br.nextBlock(128);
    expect(block.events).toHaveLength(1);
    expect(block.events[0].type).toBe('test');
  });

  it('scheduleEvent maintains sorted order', () => {
    const br = new BlockRenderer(SAMPLE_RATE);
    br.scheduleEvent({ sampleTime: 300, type: 'c', data: null });
    br.scheduleEvent({ sampleTime: 100, type: 'a', data: null });
    br.scheduleEvent({ sampleTime: 200, type: 'b', data: null });

    br.play(0);
    const block = br.nextBlock(400);
    expect(block.events.map(e => e.type)).toEqual(['a', 'b', 'c']);
  });
});
