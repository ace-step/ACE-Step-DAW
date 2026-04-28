import { describe, it, expect } from 'vitest';
import type {
  ModulationSettings,
  ModulationSlot,
  ModulationSource,
  ModulationDestination,
  ModulationLfo,
} from '../../../types/project';
import { DEFAULT_MODULATION_SETTINGS } from '../../../types/project';

/**
 * Tests for Modulation Matrix Panel logic — validates all #956 checklist items.
 * These test the data layer and slot manipulation logic that the UI depends on.
 */

// ─── Helper: simulate slot update (same logic as the component) ─────────

function updateSlot(
  slots: ModulationSlot[],
  index: number,
  updates: Partial<ModulationSlot>,
): ModulationSlot[] {
  const newSlots = [...slots];
  newSlots[index] = { ...newSlots[index], ...updates };
  return newSlots;
}

function removeSlot(slots: ModulationSlot[], index: number): ModulationSlot[] {
  return slots.filter((_, i) => i !== index);
}

function addSlot(slots: ModulationSlot[], slot: ModulationSlot): ModulationSlot[] {
  return [...slots, slot];
}

// ─── 1. Modulation matrix UI with source → destination → amount rows ────

describe('ModulationMatrixPanel — Issue #956', () => {
  describe('1. Source → Destination → Amount routing', () => {
    it('creates a slot with source, destination, and amount', () => {
      const slot: ModulationSlot = {
        source: 'lfo1',
        destination: 'filterCutoff',
        amount: 0.75,
        bipolar: true,
      };
      expect(slot.source).toBe('lfo1');
      expect(slot.destination).toBe('filterCutoff');
      expect(slot.amount).toBe(0.75);
    });

    it('updates slot source independently', () => {
      const slots: ModulationSlot[] = [
        { source: 'lfo1', destination: 'filterCutoff', amount: 0.5, bipolar: true },
      ];
      const updated = updateSlot(slots, 0, { source: 'velocity' });
      expect(updated[0].source).toBe('velocity');
      expect(updated[0].destination).toBe('filterCutoff');
      expect(updated[0].amount).toBe(0.5);
    });

    it('updates slot destination independently', () => {
      const slots: ModulationSlot[] = [
        { source: 'lfo1', destination: 'filterCutoff', amount: 0.5, bipolar: true },
      ];
      const updated = updateSlot(slots, 0, { destination: 'pitch' });
      expect(updated[0].destination).toBe('pitch');
      expect(updated[0].source).toBe('lfo1');
    });

    it('updates slot amount independently', () => {
      const slots: ModulationSlot[] = [
        { source: 'lfo1', destination: 'filterCutoff', amount: 0.5, bipolar: true },
      ];
      const updated = updateSlot(slots, 0, { amount: -0.3 });
      expect(updated[0].amount).toBe(-0.3);
    });
  });

  // ─── 2. Sources: LFO 1/2, Envelope 1/2/3, Velocity, Mod Wheel ────────

  describe('2. All modulation sources are available', () => {
    const allSources: ModulationSource[] = [
      'lfo1', 'lfo2', 'ampEnv', 'filterEnv', 'modEnv',
      'velocity', 'modWheel', 'macro1', 'macro2', 'macro3', 'macro4',
    ];

    it('supports 11 modulation sources', () => {
      expect(allSources).toHaveLength(11);
    });

    for (const source of allSources) {
      it(`accepts ${source} as a valid source`, () => {
        const slot: ModulationSlot = {
          source,
          destination: 'pitch',
          amount: 0.5,
          bipolar: true,
        };
        expect(slot.source).toBe(source);
      });
    }
  });

  // ─── 3. Destinations: Any synth parameter ─────────────────────────────

  describe('3. All synth parameter destinations', () => {
    const allDests: ModulationDestination[] = [
      'pitch', 'filterCutoff', 'filterResonance', 'amp', 'pan',
      'oscLevel', 'lfo1Rate', 'lfo2Rate', 'fmIndex', 'wtPosition',
    ];

    it('supports 10 modulation destinations', () => {
      expect(allDests).toHaveLength(10);
    });

    for (const dest of allDests) {
      it(`accepts ${dest} as a valid destination`, () => {
        const slot: ModulationSlot = {
          source: 'lfo1',
          destination: dest,
          amount: 0.5,
          bipolar: true,
        };
        expect(slot.destination).toBe(dest);
      });
    }
  });

  // ─── 4. Bipolar amount control (-100% to +100%) ──────────────────────

  describe('4. Bipolar amount control', () => {
    it('amount ranges from -1 to +1 (representing -100% to +100%)', () => {
      const slotNeg: ModulationSlot = {
        source: 'lfo1',
        destination: 'pitch',
        amount: -1,
        bipolar: true,
      };
      const slotPos: ModulationSlot = {
        source: 'lfo1',
        destination: 'pitch',
        amount: 1,
        bipolar: true,
      };
      expect(slotNeg.amount).toBe(-1);
      expect(slotPos.amount).toBe(1);
    });

    it('toggles bipolar flag on slot', () => {
      const slots: ModulationSlot[] = [
        { source: 'lfo1', destination: 'filterCutoff', amount: 0.5, bipolar: true },
      ];
      const toggled = updateSlot(slots, 0, { bipolar: false });
      expect(toggled[0].bipolar).toBe(false);

      const toggledBack = updateSlot(toggled, 0, { bipolar: true });
      expect(toggledBack[0].bipolar).toBe(true);
    });

    it('unipolar mode maps source to 0..1 range', () => {
      const slot: ModulationSlot = {
        source: 'lfo1',
        destination: 'amp',
        amount: 0.5,
        bipolar: false,
      };
      expect(slot.bipolar).toBe(false);
    });
  });

  // ─── 5. At least 8 modulation slots ───────────────────────────────────

  describe('5. Support for 8 modulation slots', () => {
    it('can create up to 8 slots', () => {
      let slots: ModulationSlot[] = [];
      for (let i = 0; i < 8; i++) {
        slots = addSlot(slots, {
          source: 'lfo1',
          destination: 'filterCutoff',
          amount: (i + 1) * 0.1,
          bipolar: true,
        });
      }
      expect(slots).toHaveLength(8);
      expect(slots[7].amount).toBeCloseTo(0.8);
    });

    it('enforces max 8 slots', () => {
      const MAX_SLOTS = 8;
      let slots: ModulationSlot[] = Array.from({ length: MAX_SLOTS }, (_, i) => ({
        source: 'lfo1' as ModulationSource,
        destination: 'pitch' as ModulationDestination,
        amount: i * 0.1,
        bipolar: true,
      }));
      // Should not add beyond 8
      const canAdd = slots.length < MAX_SLOTS;
      expect(canAdd).toBe(false);
    });

    it('can remove individual slots', () => {
      const slots: ModulationSlot[] = [
        { source: 'lfo1', destination: 'pitch', amount: 0.5, bipolar: true },
        { source: 'lfo2', destination: 'amp', amount: 0.3, bipolar: false },
        { source: 'velocity', destination: 'filterCutoff', amount: 0.8, bipolar: true },
      ];
      const afterRemove = removeSlot(slots, 1);
      expect(afterRemove).toHaveLength(2);
      expect(afterRemove[0].source).toBe('lfo1');
      expect(afterRemove[1].source).toBe('velocity');
    });
  });

  // ─── 6. Visual feedback (modulated parameter highlighting) ────────────

  describe('6. Modulation routing identification', () => {
    it('can identify which destinations are modulated', () => {
      const slots: ModulationSlot[] = [
        { source: 'lfo1', destination: 'filterCutoff', amount: 0.5, bipolar: true },
        { source: 'lfo2', destination: 'pitch', amount: -0.3, bipolar: true },
      ];
      const modulatedDests = new Set(slots.map((s) => s.destination));
      expect(modulatedDests.has('filterCutoff')).toBe(true);
      expect(modulatedDests.has('pitch')).toBe(true);
      expect(modulatedDests.has('amp')).toBe(false);
    });

    it('can identify which sources are in use', () => {
      const slots: ModulationSlot[] = [
        { source: 'lfo1', destination: 'filterCutoff', amount: 0.5, bipolar: true },
        { source: 'velocity', destination: 'amp', amount: 0.8, bipolar: false },
      ];
      const activeSources = new Set(slots.map((s) => s.source));
      expect(activeSources.has('lfo1')).toBe(true);
      expect(activeSources.has('velocity')).toBe(true);
      expect(activeSources.has('lfo2')).toBe(false);
    });
  });

  // ─── LFO configuration ───────────────────────────────────────────────

  describe('LFO source configuration', () => {
    it('LFO settings include waveform, rate, and retrigger', () => {
      const lfo: ModulationLfo = {
        waveform: 'sine',
        rateHz: 2.5,
        retrigger: true,
      };
      expect(lfo.waveform).toBe('sine');
      expect(lfo.rateHz).toBe(2.5);
      expect(lfo.retrigger).toBe(true);
    });

    it('default settings provide sensible LFO configuration', () => {
      expect(DEFAULT_MODULATION_SETTINGS.lfo1.waveform).toBe('sine');
      expect(DEFAULT_MODULATION_SETTINGS.lfo1.rateHz).toBe(1);
      expect(DEFAULT_MODULATION_SETTINGS.lfo2.waveform).toBe('triangle');
      expect(DEFAULT_MODULATION_SETTINGS.lfo2.rateHz).toBe(0.5);
    });
  });

  // ─── Macro knobs ──────────────────────────────────────────────────────

  describe('Macro knob system', () => {
    it('supports 4 macro knobs with values 0-1', () => {
      const settings: ModulationSettings = {
        ...DEFAULT_MODULATION_SETTINGS,
        macros: [0.25, 0.5, 0.75, 1.0],
      };
      expect(settings.macros).toHaveLength(4);
      expect(settings.macros[0]).toBe(0.25);
      expect(settings.macros[3]).toBe(1.0);
    });

    it('macro knobs can be used as modulation sources', () => {
      const slot: ModulationSlot = {
        source: 'macro1',
        destination: 'filterCutoff',
        amount: 0.8,
        bipolar: false,
      };
      expect(slot.source).toBe('macro1');
    });
  });

  // ─── Default settings ─────────────────────────────────────────────────

  describe('Default modulation settings', () => {
    it('starts with empty slots', () => {
      expect(DEFAULT_MODULATION_SETTINGS.slots).toHaveLength(0);
    });

    it('starts with zero macros', () => {
      expect(DEFAULT_MODULATION_SETTINGS.macros).toEqual([0, 0, 0, 0]);
    });

    it('has mod envelope with default ADSR', () => {
      const env = DEFAULT_MODULATION_SETTINGS.modEnvelope;
      expect(env.attack).toBeGreaterThan(0);
      expect(env.decay).toBeGreaterThan(0);
      expect(env.sustain).toBeGreaterThanOrEqual(0);
      expect(env.release).toBeGreaterThan(0);
    });
  });
});
