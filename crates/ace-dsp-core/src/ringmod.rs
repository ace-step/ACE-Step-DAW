//! Ring Modulator — multiplies audio signal by a carrier oscillator.
//!
//! Creates inharmonic, metallic, bell-like tones by multiplying the input
//! with a carrier wave. The output contains sum and difference frequencies
//! of the input and carrier, producing distinctly non-musical timbres.
//!
//! Parameters:
//! - `freq_hz`: carrier frequency (1–5000 Hz)
//! - `mix`: wet/dry blend (0.0–1.0)
//! - `shape`: carrier waveform (Sine, Square, Saw)

use core::f32::consts::TAU;

/// Carrier waveform shape.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum RingModShape {
    Sine,
    Square,
    Saw,
}

/// Ring modulator processor.
pub struct RingMod {
    phase: f32,
    phase_inc: f32,
    mix: f32,
    shape: RingModShape,
    sample_rate: f32,
}

impl RingMod {
    /// Create a new ring modulator.
    ///
    /// - `sample_rate`: audio sample rate
    /// - `freq_hz`: carrier frequency (1–5000 Hz)
    /// - `mix`: wet/dry (0.0–1.0)
    /// - `shape`: carrier waveform
    pub fn new(sample_rate: f32, freq_hz: f32, mix: f32, shape: RingModShape) -> Self {
        Self {
            phase: 0.0,
            phase_inc: freq_hz.clamp(1.0, 5000.0) / sample_rate,
            mix: mix.clamp(0.0, 1.0),
            shape,
            sample_rate,
        }
    }

    /// Set carrier frequency.
    pub fn set_frequency(&mut self, freq_hz: f32) {
        self.phase_inc = freq_hz.clamp(1.0, 5000.0) / self.sample_rate;
    }

    /// Set wet/dry mix (0.0–1.0).
    pub fn set_mix(&mut self, mix: f32) {
        self.mix = mix.clamp(0.0, 1.0);
    }

    /// Set carrier shape.
    pub fn set_shape(&mut self, shape: RingModShape) {
        self.shape = shape;
    }

    /// Get current shape.
    pub fn shape(&self) -> RingModShape {
        self.shape
    }

    /// Generate one carrier sample and advance phase.
    #[inline]
    fn carrier(&mut self) -> f32 {
        let val = match self.shape {
            RingModShape::Sine => (self.phase * TAU).sin(),
            RingModShape::Square => {
                if self.phase < 0.5 { 1.0 } else { -1.0 }
            }
            RingModShape::Saw => 2.0 * self.phase - 1.0,
        };

        self.phase += self.phase_inc;
        if self.phase >= 1.0 {
            self.phase -= 1.0;
        }

        val
    }

    /// Process a single sample.
    #[inline]
    pub fn process_sample(&mut self, input: f32) -> f32 {
        let carrier = self.carrier();
        let wet = input * carrier;
        input * (1.0 - self.mix) + wet * self.mix
    }

    /// Process a buffer in-place.
    pub fn process_buffer(&mut self, buffer: &mut [f32]) {
        for sample in buffer.iter_mut() {
            *sample = self.process_sample(*sample);
        }
    }

    /// Reset oscillator phase.
    pub fn reset(&mut self) {
        self.phase = 0.0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_creation() {
        let rm = RingMod::new(44100.0, 440.0, 1.0, RingModShape::Sine);
        assert_eq!(rm.shape(), RingModShape::Sine);
    }

    #[test]
    fn test_zero_mix_passthrough() {
        let mut rm = RingMod::new(44100.0, 440.0, 0.0, RingModShape::Sine);
        let mut buf = [0.5_f32; 128];
        rm.process_buffer(&mut buf);
        for &s in &buf {
            assert!((s - 0.5).abs() < 0.001, "Dry: {s}");
        }
    }

    #[test]
    fn test_silence_passthrough() {
        let mut rm = RingMod::new(44100.0, 440.0, 1.0, RingModShape::Sine);
        let mut buf = [0.0_f32; 128];
        rm.process_buffer(&mut buf);
        for &s in &buf {
            assert!(s.abs() < 1e-10, "Silence: {s}");
        }
    }

    #[test]
    fn test_sine_ring_mod_creates_sidebands() {
        // Ring mod of 440Hz carrier × 440Hz input should produce DC + 880Hz
        let mut rm = RingMod::new(44100.0, 440.0, 1.0, RingModShape::Sine);
        let mut energy = 0.0_f32;
        for i in 0..4410 {
            let input = (i as f32 * 440.0 * TAU / 44100.0).sin();
            let out = rm.process_sample(input);
            energy += out * out;
        }
        assert!(energy > 10.0, "Should have energy: {energy}");
    }

    #[test]
    fn test_square_carrier() {
        let mut rm = RingMod::new(44100.0, 100.0, 1.0, RingModShape::Square);
        // Square carrier alternates sign, so output should alternate polarity
        let out1 = rm.process_sample(1.0);
        // First sample: phase=0, square=1.0, so out=1.0
        assert!((out1 - 1.0).abs() < 0.01, "Square first: {out1}");
    }

    #[test]
    fn test_saw_carrier() {
        let mut rm = RingMod::new(44100.0, 100.0, 1.0, RingModShape::Saw);
        let out = rm.process_sample(1.0);
        // Saw starts at -1.0 (2*0 - 1)
        assert!((out - -1.0).abs() < 0.01, "Saw first: {out}");
    }

    #[test]
    fn test_output_bounded() {
        let mut rm = RingMod::new(44100.0, 440.0, 1.0, RingModShape::Sine);
        let mut max_out = 0.0_f32;
        for i in 0..44100 {
            let input = (i as f32 * 220.0 * TAU / 44100.0).sin();
            let out = rm.process_sample(input);
            max_out = max_out.max(out.abs());
        }
        // Input ≤ 1, carrier ≤ 1, so output ≤ 1
        assert!(max_out <= 1.01, "Bounded: {max_out}");
    }

    #[test]
    fn test_parameter_setters() {
        let mut rm = RingMod::new(44100.0, 440.0, 0.5, RingModShape::Sine);
        rm.set_frequency(880.0);
        rm.set_mix(0.8);
        rm.set_shape(RingModShape::Square);
        assert_eq!(rm.shape(), RingModShape::Square);
    }

    #[test]
    fn test_frequency_clamping() {
        let rm = RingMod::new(44100.0, 10000.0, 1.0, RingModShape::Sine);
        assert!((rm.phase_inc - 5000.0 / 44100.0).abs() < 0.001);
    }

    #[test]
    fn test_reset() {
        let mut rm = RingMod::new(44100.0, 440.0, 1.0, RingModShape::Sine);
        for _ in 0..1000 {
            rm.process_sample(1.0);
        }
        rm.reset();
        assert_eq!(rm.phase, 0.0);
    }

    #[test]
    fn test_mix_blend() {
        let mut rm = RingMod::new(44100.0, 440.0, 0.5, RingModShape::Sine);
        // First sample: carrier sin(0) = 0, so wet = 0, dry = 0.5 * 0.5 = 0.25
        let out = rm.process_sample(0.5);
        assert!((out - 0.25).abs() < 0.01, "Mix blend: {out}");
    }
}
