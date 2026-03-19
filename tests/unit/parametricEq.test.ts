import { describe, expect, it } from 'vitest';
import {
  clampParametricEqFrequency,
  clampParametricEqGain,
  clampParametricEqQ,
  createDefaultParametricEqBands,
  createParametricEqBand,
  createSimpleParametricEqBands,
  frequencyToRatio,
  getBandControlLabel,
  getEqResponseAtFrequency,
  PARAMETRIC_EQ_MAX_FREQUENCY,
  PARAMETRIC_EQ_MAX_GAIN,
  PARAMETRIC_EQ_MAX_Q,
  PARAMETRIC_EQ_MIN_FREQUENCY,
  PARAMETRIC_EQ_MIN_GAIN,
  PARAMETRIC_EQ_MIN_Q,
  PARAMETRIC_EQ_SAMPLE_RATE,
  ratioToFrequency,
  spectrumBinToFrequency,
} from '../../src/utils/parametricEq';

describe('parametricEq utilities', () => {
  // ── Band creation ─────────────────────────────────────────────────────────

  it('creates four adjustable default bands', () => {
    const bands = createDefaultParametricEqBands();

    expect(bands).toHaveLength(4);
    expect(bands.every((band) => typeof band.id === 'string' && band.id.length > 0)).toBe(true);
    expect(bands.map((band) => band.type)).toEqual([
      'highpass',
      'peaking',
      'peaking',
      'highshelf',
    ]);
  });

  it('assigns unique ids to each default band', () => {
    const bands = createDefaultParametricEqBands();
    const ids = new Set(bands.map((b) => b.id));
    expect(ids.size).toBe(4);
  });

  it('creates a band with sensible defaults when no overrides given', () => {
    const band = createParametricEqBand();
    expect(band.enabled).toBe(true);
    expect(band.type).toBe('peaking');
    expect(band.frequency).toBe(1000);
    expect(band.gain).toBe(0);
    expect(band.q).toBe(1);
  });

  it('applies partial overrides to createParametricEqBand', () => {
    const band = createParametricEqBand({ type: 'notch', frequency: 5000, q: 8 });
    expect(band.type).toBe('notch');
    expect(band.frequency).toBe(5000);
    expect(band.q).toBe(8);
    expect(band.gain).toBe(0);
    expect(band.enabled).toBe(true);
  });

  it('maps simple mode bands to the legacy three-band EQ layout', () => {
    const bands = createSimpleParametricEqBands(6, -2, 4, 300, 5500);

    expect(bands).toHaveLength(4);
    expect(bands[0]).toMatchObject({ type: 'lowshelf', gain: 6, frequency: 300, enabled: true });
    expect(bands[1]).toMatchObject({ type: 'peaking', gain: -2, frequency: 1000, enabled: true });
    expect(bands[2]).toMatchObject({ type: 'highshelf', gain: 4, frequency: 5500, enabled: true });
    expect(bands[3]).toMatchObject({ enabled: false });
  });

  it('creates simple bands with default values when called without args', () => {
    const bands = createSimpleParametricEqBands();
    expect(bands[0]).toMatchObject({ gain: 0, frequency: 250 });
    expect(bands[1]).toMatchObject({ gain: 0, frequency: 1000 });
    expect(bands[2]).toMatchObject({ gain: 0, frequency: 4000 });
  });

  // ── Clamping ──────────────────────────────────────────────────────────────

  it('clamps frequency to the valid range', () => {
    expect(clampParametricEqFrequency(5)).toBe(PARAMETRIC_EQ_MIN_FREQUENCY);
    expect(clampParametricEqFrequency(50000)).toBe(PARAMETRIC_EQ_MAX_FREQUENCY);
    expect(clampParametricEqFrequency(1000)).toBe(1000);
  });

  it('clamps gain to ±18 dB', () => {
    expect(clampParametricEqGain(-30)).toBe(PARAMETRIC_EQ_MIN_GAIN);
    expect(clampParametricEqGain(25)).toBe(PARAMETRIC_EQ_MAX_GAIN);
    expect(clampParametricEqGain(6)).toBe(6);
  });

  it('clamps Q factor to 0.1–18', () => {
    expect(clampParametricEqQ(0)).toBe(PARAMETRIC_EQ_MIN_Q);
    expect(clampParametricEqQ(30)).toBe(PARAMETRIC_EQ_MAX_Q);
    expect(clampParametricEqQ(2.5)).toBe(2.5);
  });

  it('clamps out-of-range overrides in createParametricEqBand', () => {
    const band = createParametricEqBand({ frequency: 5, gain: -30, q: 0 });
    expect(band.frequency).toBe(PARAMETRIC_EQ_MIN_FREQUENCY);
    expect(band.gain).toBe(PARAMETRIC_EQ_MIN_GAIN);
    expect(band.q).toBe(PARAMETRIC_EQ_MIN_Q);
  });

  // ── Frequency ↔ ratio mapping ─────────────────────────────────────────────

  it('round-trips frequency positions across the log-scale display mapping', () => {
    const original = 2450;
    const ratio = frequencyToRatio(original);
    const mapped = ratioToFrequency(ratio);

    expect(mapped).toBeCloseTo(original, -1);
  });

  it('maps 20 Hz to ratio 0 and 20 kHz to ratio 1', () => {
    expect(frequencyToRatio(PARAMETRIC_EQ_MIN_FREQUENCY)).toBeCloseTo(0, 5);
    expect(frequencyToRatio(PARAMETRIC_EQ_MAX_FREQUENCY)).toBeCloseTo(1, 5);
  });

  it('clamps ratio input to [0,1] in ratioToFrequency', () => {
    expect(ratioToFrequency(-0.5)).toBe(PARAMETRIC_EQ_MIN_FREQUENCY);
    expect(ratioToFrequency(1.5)).toBe(PARAMETRIC_EQ_MAX_FREQUENCY);
  });

  it('round-trips multiple frequencies accurately', () => {
    for (const freq of [20, 100, 440, 1000, 5000, 12000, 20000]) {
      const mapped = ratioToFrequency(frequencyToRatio(freq));
      expect(mapped).toBeCloseTo(freq, -1);
    }
  });

  // ── EQ response calculations (all band types) ────────────────────────────

  it('boosts response near a peaking band center frequency', () => {
    const bands = createDefaultParametricEqBands();
    bands[1] = { ...bands[1], frequency: 1000, gain: 6, q: 1.2 };

    expect(getEqResponseAtFrequency(bands, 1000)).toBeGreaterThan(3);
    expect(getEqResponseAtFrequency(bands, 100)).toBeLessThan(2);
  });

  it('cuts response around a notch filter center', () => {
    const bands = createDefaultParametricEqBands();
    bands[1] = { ...bands[1], type: 'notch', frequency: 3000, gain: 0, q: 6 };

    expect(getEqResponseAtFrequency(bands, 3000)).toBeLessThan(-6);
  });

  it('low shelf boosts frequencies below the center', () => {
    const bands = [createParametricEqBand({ type: 'lowshelf', frequency: 500, gain: 10, q: 0.7 })];
    expect(getEqResponseAtFrequency(bands, 100)).toBeGreaterThan(5);
    expect(getEqResponseAtFrequency(bands, 10000)).toBeLessThan(2);
  });

  it('high shelf boosts frequencies above the center', () => {
    const bands = [createParametricEqBand({ type: 'highshelf', frequency: 4000, gain: 10, q: 0.7 })];
    expect(getEqResponseAtFrequency(bands, 15000)).toBeGreaterThan(5);
    expect(getEqResponseAtFrequency(bands, 100)).toBeLessThan(2);
  });

  it('highpass attenuates below the cutoff', () => {
    const bands = [createParametricEqBand({ type: 'highpass', frequency: 200, gain: 0, q: 1 })];
    expect(getEqResponseAtFrequency(bands, 20)).toBeLessThan(-6);
    expect(getEqResponseAtFrequency(bands, 2000)).toBeCloseTo(0, 0);
  });

  it('lowpass attenuates above the cutoff', () => {
    const bands = [createParametricEqBand({ type: 'lowpass', frequency: 2000, gain: 0, q: 1 })];
    expect(getEqResponseAtFrequency(bands, 15000)).toBeLessThan(-6);
    expect(getEqResponseAtFrequency(bands, 100)).toBeCloseTo(0, 0);
  });

  // ── Q factor behavior ────────────────────────────────────────────────────

  it('higher Q produces a narrower peak', () => {
    const wideQ = [createParametricEqBand({ type: 'peaking', frequency: 1000, gain: 12, q: 0.5 })];
    const narrowQ = [createParametricEqBand({ type: 'peaking', frequency: 1000, gain: 12, q: 8 })];

    // At center both should be similar
    const widePeak = getEqResponseAtFrequency(wideQ, 1000);
    const narrowPeak = getEqResponseAtFrequency(narrowQ, 1000);
    expect(Math.abs(widePeak - narrowPeak)).toBeLessThan(2);

    // 2 octaves away, wide Q should have more effect
    const wideOff = getEqResponseAtFrequency(wideQ, 4000);
    const narrowOff = getEqResponseAtFrequency(narrowQ, 4000);
    expect(wideOff).toBeGreaterThan(narrowOff);
  });

  // ── Disabled bands ────────────────────────────────────────────────────────

  it('disabled bands have no effect on the response', () => {
    const enabled = [createParametricEqBand({ type: 'peaking', frequency: 1000, gain: 12, q: 2 })];
    const disabled = [createParametricEqBand({ type: 'peaking', frequency: 1000, gain: 12, q: 2, enabled: false })];

    expect(getEqResponseAtFrequency(enabled, 1000)).toBeGreaterThan(6);
    expect(getEqResponseAtFrequency(disabled, 1000)).toBeCloseTo(0, 5);
  });

  // ── Multi-band interaction ────────────────────────────────────────────────

  it('stacks gains from multiple peaking bands at the same frequency', () => {
    const single = [createParametricEqBand({ type: 'peaking', frequency: 1000, gain: 6, q: 1.2 })];
    const double = [
      createParametricEqBand({ type: 'peaking', frequency: 1000, gain: 6, q: 1.2 }),
      createParametricEqBand({ type: 'peaking', frequency: 1000, gain: 6, q: 1.2 }),
    ];
    const singleResp = getEqResponseAtFrequency(single, 1000);
    const doubleResp = getEqResponseAtFrequency(double, 1000);
    expect(doubleResp).toBeGreaterThan(singleResp * 1.5);
  });

  it('flat response when all gains are zero', () => {
    const bands = createDefaultParametricEqBands();
    // Default bands have gain 0 except highpass at 40 Hz
    expect(getEqResponseAtFrequency(bands, 1000)).toBeCloseTo(0, 1);
    expect(getEqResponseAtFrequency(bands, 5000)).toBeCloseTo(0, 1);
  });

  // ── Band control labels ───────────────────────────────────────────────────

  it('returns human-readable labels for all band types', () => {
    expect(getBandControlLabel('peaking')).toBe('Peak');
    expect(getBandControlLabel('lowshelf')).toBe('Low Shelf');
    expect(getBandControlLabel('highshelf')).toBe('High Shelf');
    expect(getBandControlLabel('notch')).toBe('Notch');
    expect(getBandControlLabel('highpass')).toBe('High Pass');
    expect(getBandControlLabel('lowpass')).toBe('Low Pass');
  });

  // ── Spectrum bin to frequency mapping ──────────────────────────────────

  describe('spectrumBinToFrequency', () => {
    it('maps bin 0 to 0 Hz (DC)', () => {
      expect(spectrumBinToFrequency(0, 1024)).toBe(0);
    });

    it('maps the last bin to Nyquist frequency', () => {
      const nyquist = PARAMETRIC_EQ_SAMPLE_RATE / 2;
      expect(spectrumBinToFrequency(1024, 1024)).toBeCloseTo(nyquist, 0);
    });

    it('maps middle bin to quarter of sample rate', () => {
      // bin 512 of 1024 → freq = 512 * 48000 / 2048 = 12000 Hz
      expect(spectrumBinToFrequency(512, 1024)).toBeCloseTo(12000, 0);
    });

    it('respects custom sample rate', () => {
      expect(spectrumBinToFrequency(100, 1024, 44100)).toBeCloseTo(
        (100 * 44100) / 2048,
        0,
      );
    });
  });
});
