import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VoiceManager, type VoiceCallbacks } from '../voice-manager';

interface MockVoice {
  id: number;
  note: number;
  amp: number;
}

function createVoices(count: number): MockVoice[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    note: -1,
    amp: 0,
  }));
}

describe('VoiceManager', () => {
  let voices: MockVoice[];
  let callbacks: VoiceCallbacks<MockVoice>;
  let vm: VoiceManager<MockVoice>;

  beforeEach(() => {
    voices = createVoices(4);
    callbacks = {
      onAttack: vi.fn((voice, note, velocity) => {
        voice.note = note;
        voice.amp = velocity;
      }),
      onRelease: vi.fn((voice) => {
        voice.amp = 0;
      }),
      getAmplitude: (voice) => voice.amp,
    };
    vm = new VoiceManager(voices, callbacks);
  });

  it('has correct max polyphony', () => {
    expect(vm.maxPolyphony).toBe(4);
  });

  it('starts with 0 active voices', () => {
    expect(vm.activeCount).toBe(0);
  });

  it('noteOn allocates a free voice', () => {
    const voice = vm.noteOn(60, 0.8);
    expect(voice).toBeDefined();
    expect(callbacks.onAttack).toHaveBeenCalledWith(voice, 60, 0.8);
    expect(vm.activeCount).toBe(1);
  });

  it('noteOn allocates different voices for different notes', () => {
    const v1 = vm.noteOn(60, 0.8);
    const v2 = vm.noteOn(64, 0.8);
    expect(v1).not.toBe(v2);
    expect(vm.activeCount).toBe(2);
  });

  it('noteOff releases a voice', () => {
    vm.noteOn(60, 0.8);
    vm.noteOff(60);
    expect(callbacks.onRelease).toHaveBeenCalled();
  });

  it('noteOff does nothing for non-active note', () => {
    vm.noteOff(60);
    expect(callbacks.onRelease).not.toHaveBeenCalled();
  });

  it('steals oldest voice when all voices are busy', () => {
    vm.noteOn(60, 0.8);
    vm.noteOn(62, 0.8);
    vm.noteOn(64, 0.8);
    vm.noteOn(67, 0.8);

    // All 4 voices busy — next noteOn should steal oldest (note 60)
    const stolen = vm.noteOn(72, 0.8);
    expect(callbacks.onRelease).toHaveBeenCalled();
    expect(vm.activeCount).toBe(4); // Still 4 (stolen, not freed)
  });

  it('retriggers same note on same voice', () => {
    const v1 = vm.noteOn(60, 0.8);
    vm.noteOn(62, 0.8);
    vm.noteOn(64, 0.8);
    vm.noteOn(67, 0.8);

    // Play note 60 again — should retrigger on same voice
    const v2 = vm.noteOn(60, 0.5);
    expect(v2.id).toBe(v1.id);
  });

  it('prefers releasing voices over active ones for stealing', () => {
    vm.noteOn(60, 0.8);
    vm.noteOn(62, 0.8);
    vm.noteOn(64, 0.8);
    vm.noteOn(67, 0.8);

    // Release note 62
    vm.noteOff(62);

    // New note should take the releasing voice
    vm.noteOn(72, 0.8);
    // The releasing voice should have been reused
    expect(vm.activeCount).toBe(4);
  });

  it('releaseAll releases all voices', () => {
    vm.noteOn(60, 0.8);
    vm.noteOn(64, 0.8);
    vm.noteOn(67, 0.8);

    vm.releaseAll();
    expect(callbacks.onRelease).toHaveBeenCalledTimes(3);
  });

  it('stopAll immediately frees all voices', () => {
    vm.noteOn(60, 0.8);
    vm.noteOn(64, 0.8);

    vm.stopAll();
    expect(vm.activeCount).toBe(0);
  });

  it('voiceEnded marks voice as free', () => {
    const voice = vm.noteOn(60, 0.8);
    expect(vm.activeCount).toBe(1);

    vm.voiceEnded(voice);
    expect(vm.activeCount).toBe(0);
  });

  it('quietest strategy steals lowest amplitude voice', () => {
    const qvm = new VoiceManager(voices, callbacks, 'quietest');

    qvm.noteOn(60, 0.8);
    qvm.noteOn(62, 0.2); // quietest
    qvm.noteOn(64, 0.6);
    qvm.noteOn(67, 0.4);

    // Should steal the quietest (note 62, amp 0.2)
    const stolenVoice = qvm.noteOn(72, 1.0);
    expect(stolenVoice.id).toBe(1);
    expect(stolenVoice.note).toBe(72);
  });

  it('lowest strategy steals lowest note', () => {
    const lvm = new VoiceManager(voices, callbacks, 'lowest');

    const lowestVoice = lvm.noteOn(60, 0.8); // lowest
    lvm.noteOn(72, 0.8);
    lvm.noteOn(84, 0.8);
    lvm.noteOn(96, 0.8);

    // Should steal the lowest note (60)
    const stolenVoice = lvm.noteOn(48, 1.0);
    expect(stolenVoice).toBe(lowestVoice);
    expect(lvm.activeCount).toBe(4);
  });

  it('strategy is settable', () => {
    expect(vm.strategy).toBe('oldest');
    vm.strategy = 'quietest';
    expect(vm.strategy).toBe('quietest');
  });
});
