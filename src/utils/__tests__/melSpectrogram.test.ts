import { describe, it, expect } from 'vitest';
import {
  fft,
  hannWindow,
  createMelFilterbank,
  powerSpectrogram,
  magnitudeSpectrogram,
  computeMelSpectrogram,
  downsampleToMono,
  BEAT_THIS_MEL_OPTIONS,
} from '../melSpectrogram';

describe('fft', () => {
  it('transforms a DC signal to a single bin', () => {
    const n = 8;
    const real = new Float32Array(n).fill(1);
    const imag = new Float32Array(n).fill(0);
    fft(real, imag);
    expect(real[0]).toBeCloseTo(n, 5);
    for (let i = 1; i < n; i++) {
      expect(Math.abs(real[i])).toBeCloseTo(0, 5);
      expect(Math.abs(imag[i])).toBeCloseTo(0, 5);
    }
  });

  it('transforms a known sinusoid correctly', () => {
    const n = 64;
    const freq = 4;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      real[i] = Math.cos((2 * Math.PI * freq * i) / n);
    }
    fft(real, imag);
    expect(Math.sqrt(real[freq] ** 2 + imag[freq] ** 2)).toBeCloseTo(n / 2, 2);
    expect(Math.sqrt(real[n - freq] ** 2 + imag[n - freq] ** 2)).toBeCloseTo(n / 2, 2);
    for (let i = 1; i < n; i++) {
      if (i === freq || i === n - freq) continue;
      expect(Math.sqrt(real[i] ** 2 + imag[i] ** 2)).toBeCloseTo(0, 2);
    }
  });
});

describe('hannWindow', () => {
  it('returns correct length', () => {
    expect(hannWindow(256).length).toBe(256);
  });

  it('is zero at endpoints', () => {
    const w = hannWindow(64);
    expect(w[0]).toBeCloseTo(0, 5);
    expect(w[63]).toBeCloseTo(0, 5);
  });

  it('peaks at center', () => {
    const w = hannWindow(64);
    expect(w[32]).toBeCloseTo(1, 2);
  });
});

describe('createMelFilterbank', () => {
  it('returns correct shape', () => {
    const filters = createMelFilterbank(2048, 128, 22050, 30, 11000);
    expect(filters.length).toBe(128);
    expect(filters[0].length).toBe(1025);
  });

  it('filters are non-negative', () => {
    const filters = createMelFilterbank(2048, 40, 22050, 0, 8000);
    for (const f of filters) {
      for (let i = 0; i < f.length; i++) {
        expect(f[i]).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('each filter has at least one non-zero value', () => {
    const filters = createMelFilterbank(2048, 40, 22050, 0, 8000);
    for (const f of filters) {
      const max = Math.max(...f);
      expect(max).toBeGreaterThan(0);
    }
  });
});

describe('powerSpectrogram', () => {
  it('returns correct number of frames', () => {
    const nFft = 512;
    const hopLength = 256;
    const samples = new Float32Array(4096);
    const frames = powerSpectrogram(samples, nFft, hopLength);
    const expected = Math.floor((4096 - nFft) / hopLength) + 1;
    expect(frames.length).toBe(expected);
  });

  it('frame length is nFft/2 + 1', () => {
    const nFft = 512;
    const samples = new Float32Array(1024);
    const frames = powerSpectrogram(samples, nFft, 256);
    expect(frames[0].length).toBe(nFft / 2 + 1);
  });

  it('values are non-negative (power)', () => {
    const samples = new Float32Array(2048);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    const frames = powerSpectrogram(samples, 512, 256);
    for (const f of frames) {
      for (let i = 0; i < f.length; i++) {
        expect(f[i]).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('magnitudeSpectrogram', () => {
  it('returns correct shape', () => {
    const nFft = 512;
    const samples = new Float32Array(2048);
    const frames = magnitudeSpectrogram(samples, nFft, 256);
    expect(frames[0].length).toBe(nFft / 2 + 1);
  });

  it('magnitude values are sqrt of power values', () => {
    const samples = new Float32Array(2048);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.sin(2 * Math.PI * 440 * i / 22050);
    const power = powerSpectrogram(samples, 512, 256);
    const mag = magnitudeSpectrogram(samples, 512, 256);
    for (let f = 0; f < power.length; f++) {
      for (let k = 0; k < power[f].length; k++) {
        expect(mag[f][k]).toBeCloseTo(Math.sqrt(power[f][k]), 3);
      }
    }
  });
});

describe('computeMelSpectrogram', () => {
  it('returns correct shape for given input', () => {
    const samples = new Float32Array(22050);
    const melFrames = computeMelSpectrogram(samples, {
      sampleRate: 22050,
      nFft: 2048,
      hopLength: 512,
      nMels: 80,
      fMin: 30,
      fMax: 8000,
    });
    const expectedFrames = Math.floor((22050 - 2048) / 512) + 1;
    expect(melFrames.length).toBe(expectedFrames);
    expect(melFrames[0].length).toBe(80);
  });

  it('silent input produces very low dB values in db mode', () => {
    const samples = new Float32Array(4096);
    const melFrames = computeMelSpectrogram(samples, {
      sampleRate: 22050,
      nFft: 2048,
      hopLength: 512,
      nMels: 40,
      fMin: 0,
      fMax: 8000,
      logScale: 'db',
    });
    for (const frame of melFrames) {
      for (let i = 0; i < frame.length; i++) {
        expect(frame[i]).toBeLessThan(-50);
      }
    }
  });

  it('log1p mode produces non-negative values', () => {
    const samples = new Float32Array(22050);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.sin(2 * Math.PI * 440 * i / 22050);
    }
    const melFrames = computeMelSpectrogram(samples, {
      ...BEAT_THIS_MEL_OPTIONS,
      logScale: 'log1p',
      log1pMultiplier: 1000,
    });
    for (const frame of melFrames) {
      for (let i = 0; i < frame.length; i++) {
        expect(frame[i]).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('Beat This! preset uses nFft=1024 and produces expected range', () => {
    const samples = new Float32Array(22050);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.sin(2 * Math.PI * 440 * i / 22050) * 0.5;
    }
    const melFrames = computeMelSpectrogram(samples, BEAT_THIS_MEL_OPTIONS);
    expect(melFrames[0].length).toBe(128);
    // log1p(1000 * mel) should produce values roughly in [0, 10] range for normal audio
    let maxVal = -Infinity;
    for (const frame of melFrames) {
      for (let i = 0; i < frame.length; i++) {
        if (frame[i] > maxVal) maxVal = frame[i];
      }
    }
    expect(maxVal).toBeGreaterThan(0);
    expect(maxVal).toBeLessThan(15);
  });
});

describe('downsampleToMono', () => {
  it('mixes stereo to mono by averaging channels', () => {
    const length = 100;
    const ch0 = new Float32Array(length).fill(0.5);
    const ch1 = new Float32Array(length).fill(-0.5);
    const fakeBuffer = {
      numberOfChannels: 2,
      length,
      sampleRate: 22050,
      getChannelData: (ch: number) => (ch === 0 ? ch0 : ch1),
    } as unknown as AudioBuffer;

    const mono = downsampleToMono(fakeBuffer, 22050);
    expect(mono.length).toBe(length);
    for (let i = 0; i < mono.length; i++) {
      expect(mono[i]).toBeCloseTo(0, 5);
    }
  });

  it('resamples to lower sample rate', () => {
    const length = 44100;
    const ch0 = new Float32Array(length);
    for (let i = 0; i < length; i++) ch0[i] = Math.sin(2 * Math.PI * 440 * i / 44100);
    const fakeBuffer = {
      numberOfChannels: 1,
      length,
      sampleRate: 44100,
      getChannelData: () => ch0,
    } as unknown as AudioBuffer;

    const mono = downsampleToMono(fakeBuffer, 22050);
    expect(mono.length).toBe(22050);
  });
});
