//! LFO (Low Frequency Oscillator) — modulation source for chorus/flanger/phaser.
//!
//! Provides multiple waveforms with tempo sync support and stereo phase offset.

use core::f64::consts::PI;

/// LFO waveform shapes.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum LfoWaveform {
    Sine,
    Triangle,
    Square,
    Sawtooth,
    SampleAndHold,
}

/// Low-frequency oscillator for modulation effects.
#[derive(Debug, Clone)]
pub struct Lfo {
    phase: f64,
    phase_inc: f64,
    waveform: LfoWaveform,
    sample_rate: f64,
    // For sample-and-hold
    sh_value: f64,
    sh_last_phase: f64,
}

impl Lfo {
    /// Create a new LFO.
    ///
    /// - `rate_hz`: oscillation rate (0.01–20 Hz)
    /// - `waveform`: shape of the modulation signal
    /// - `sample_rate`: audio sample rate
    pub fn new(rate_hz: f64, waveform: LfoWaveform, sample_rate: f64) -> Self {
        Self {
            phase: 0.0,
            phase_inc: rate_hz / sample_rate,
            waveform,
            sample_rate,
            sh_value: 0.0,
            sh_last_phase: 0.0,
        }
    }

    pub fn set_rate(&mut self, rate_hz: f64) {
        self.phase_inc = rate_hz / self.sample_rate;
    }

    pub fn set_waveform(&mut self, waveform: LfoWaveform) {
        self.waveform = waveform;
    }

    /// Get the next LFO sample (range: -1.0 to +1.0).
    #[inline]
    pub fn next(&mut self) -> f64 {
        let value = self.evaluate(self.phase);
        self.phase += self.phase_inc;
        if self.phase >= 1.0 {
            self.phase -= 1.0;
        }
        value
    }

    /// Get the next sample with a phase offset (for stereo spread).
    /// `offset` is in range 0.0–1.0 (0.25 = 90°).
    #[inline]
    pub fn next_with_offset(&mut self, offset: f64) -> (f64, f64) {
        let center = self.evaluate(self.phase);
        let offset_phase = (self.phase + offset) % 1.0;
        let offset_val = self.evaluate(offset_phase);
        self.phase += self.phase_inc;
        if self.phase >= 1.0 {
            self.phase -= 1.0;
        }
        (center, offset_val)
    }

    #[inline]
    fn evaluate(&mut self, phase: f64) -> f64 {
        match self.waveform {
            LfoWaveform::Sine => (phase * 2.0 * PI).sin(),
            LfoWaveform::Triangle => {
                if phase < 0.25 {
                    phase * 4.0
                } else if phase < 0.75 {
                    2.0 - phase * 4.0
                } else {
                    phase * 4.0 - 4.0
                }
            }
            LfoWaveform::Square => {
                if phase < 0.5 {
                    1.0
                } else {
                    -1.0
                }
            }
            LfoWaveform::Sawtooth => 2.0 * phase - 1.0,
            LfoWaveform::SampleAndHold => {
                // Change value once per cycle
                if phase < self.sh_last_phase {
                    // Phase wrapped around — generate new random value
                    // Simple deterministic "random" using phase accumulation
                    self.sh_value = ((self.sh_value * 1.618033988749895 + 0.37) % 1.0) * 2.0 - 1.0;
                }
                self.sh_last_phase = phase;
                self.sh_value
            }
        }
    }

    pub fn reset(&mut self) {
        self.phase = 0.0;
        self.sh_value = 0.0;
        self.sh_last_phase = 0.0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SR: f64 = 48000.0;

    #[test]
    fn sine_range() {
        let mut lfo = Lfo::new(1.0, LfoWaveform::Sine, SR);
        let mut min = f64::MAX;
        let mut max = f64::MIN;
        for _ in 0..48000 {
            let v = lfo.next();
            min = min.min(v);
            max = max.max(v);
        }
        assert!(min >= -1.01 && max <= 1.01, "Sine range: {min}..{max}");
        assert!(min < -0.99, "Sine should reach -1: min={min}");
        assert!(max > 0.99, "Sine should reach +1: max={max}");
    }

    #[test]
    fn triangle_range() {
        let mut lfo = Lfo::new(1.0, LfoWaveform::Triangle, SR);
        let mut min = f64::MAX;
        let mut max = f64::MIN;
        for _ in 0..48000 {
            let v = lfo.next();
            min = min.min(v);
            max = max.max(v);
        }
        assert!(min >= -1.01 && max <= 1.01, "Tri range: {min}..{max}");
    }

    #[test]
    fn stereo_offset_different() {
        let mut lfo = Lfo::new(1.0, LfoWaveform::Sine, SR);
        let (center, offset) = lfo.next_with_offset(0.25); // 90° offset
        // At phase 0: sin(0) = 0, sin(π/2) = 1
        assert!((center).abs() < 0.01, "Center at phase 0: {center}");
        assert!((offset - 1.0).abs() < 0.01, "90° offset at phase 0: {offset}");
    }

    #[test]
    fn rate_change() {
        let mut lfo = Lfo::new(1.0, LfoWaveform::Sine, SR);
        lfo.set_rate(10.0);
        // After 4800 samples (0.1s), a 10Hz LFO should complete 1 cycle
        for _ in 0..4800 {
            lfo.next();
        }
        // Phase should be back near 0
        assert!(lfo.phase < 0.02, "10Hz LFO after 0.1s: phase={}", lfo.phase);
    }
}
