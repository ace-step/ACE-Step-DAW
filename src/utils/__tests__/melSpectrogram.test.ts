import { describe, it, expect } from 'vitest';
import {
  fft,
  hannWindow,
  createMelFilterbank,
  powerSpectrogram,
  computeMelSpectrogram,
  downsampleToMono,
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
    const freq = 4; // 4 cycles in n samples → bin 4
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      real[i] = Math.cos((2 * Math.PI * freq * i) / n);
    }
    fft(real, imag);
    // Bin `freq` and bin `n - freq` should have magnitude n/2
    expect(Math.sqrt(real[freq] ** 2 + imag[freq] ** 2)).toBeCloseTo(n / 2, 2);
    expect(Math.sqrt(real[n - freq] ** 2 + imag[n - freq] ** 2)).toBeCloseTo(n / 2, 2);
    // Other bins should be near zero
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
    expect(filters[0].length).toBe(1025); // nFft/2 + 1
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

describe('computeMelSpectrogram', () => {
  it('returns correct shape for given input', () => {
    const samples = new Float32Array(22050); // 1 second at 22050Hz
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

  it('silent input produces very low dB values', () => {
    const samples = new Float32Array(4096); // all zeros
    const melFrames = computeMelSpectrogram(samples, {
      sampleRate: 22050,
      nFft: 2048,
      hopLength: 512,
      nMels: 40,
      fMin: 0,
      fMax: 8000,
    });
    for (const frame of melFrames) {
      for (let i = 0; i < frame.length; i++) {
        expect(frame[i]).toBeLessThan(-50); // very quiet → negative dB
      }
    }
  });
});

describe('downsampleToMono', () => {
  it('mixes stereo to mono by averaging channels', () => {
    // Create a fake AudioBuffer-like with 2 channels
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
      expect(mono[i]).toBeCloseTo(0, 5); // (0.5 + -0.5) / 2 = 0
    }
  });

  it('resamples to lower sample rate', () => {
    const length = 44100; // 1 second at 44100
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
