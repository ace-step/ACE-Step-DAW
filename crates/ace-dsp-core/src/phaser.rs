//! Phaser — cascaded first-order allpass filters with LFO modulation.
//!
//! Creates the characteristic "swooshing" sound by sweeping notches
//! through the frequency spectrum. The LFO modulates the allpass filter
//! cutoff frequencies, and the output is mixed with the dry signal to
//! create comb-filter-like interference patterns.
//!
//! Parameters:
//! - `rate_hz`: LFO speed (0.05–10 Hz)
//! - `depth`: modulation depth (0.0–1.0)
//! - `feedback`: resonance / intensity (0.0–0.95)
//! - `stages`: number of allpass stages (2, 4, 6, 8, 10, 12)
//! - `mix`: wet/dry blend (0.0–1.0)

use core::f32::consts::TAU;

/// Maximum number of allpass stages.
const MAX_STAGES: usize = 12;

/// Frequency range for the allpass sweep (Hz).
const MIN_FREQ: f32 = 100.0;
const MAX_FREQ: f32 = 4000.0;

/// First-order allpass filter.
///
/// Transfer function: H(z) = (a + z^-1) / (1 + a * z^-1)
/// where a = (1 - w) / (1 + w), w = tan(π * fc / fs)
struct FirstOrderAllpass {
    a: f32,    // coefficient
    z1: f32,   // one-sample delay state
}

impl FirstOrderAllpass {
    fn new() -> Self {
        Self { a: 0.0, z1: 0.0 }
    }

    /// Update the allpass coefficient for a given cutoff frequency.
    #[inline]
    fn set_frequency(&mut self, freq: f32, sample_rate: f32) {
        let w = (core::f32::consts::PI * freq / sample_rate).tan();
        self.a = (1.0 - w) / (1.0 + w);
    }

    /// Process one sample through the allpass.
    #[inline]
    fn process(&mut self, input: f32) -> f32 {
        let output = self.a * input + self.z1;
        self.z1 = input - self.a * output;
        output
    }

    fn reset(&mut self) {
        self.z1 = 0.0;
    }
}

/// Phaser processor.
pub struct Phaser {
    stages: [FirstOrderAllpass; MAX_STAGES],
    num_stages: usize,
    lfo_phase: f32,
    lfo_inc: f32,
    sample_rate: f32,
    depth: f32,
    feedback: f32,
    mix: f32,
    fb_sample: f32,
}

impl Phaser {
    /// Create a new phaser.
    ///
    /// - `sample_rate`: audio sample rate
    /// - `rate_hz`: LFO rate (0.05–10 Hz)
    /// - `depth`: modulation depth (0.0–1.0)
    /// - `feedback`: resonance (0.0–0.95)
    /// - `stages`: number of allpass stages (clamped to 2–12, even)
    /// - `mix`: wet/dry (0.0–1.0)
    pub fn new(
        sample_rate: f32,
        rate_hz: f32,
        depth: f32,
        feedback: f32,
        stages: usize,
        mix: f32,
    ) -> Self {
        let num_stages = stages.clamp(2, MAX_STAGES);
        // Round to even for symmetric notch placement
        let num_stages = if num_stages % 2 != 0 { num_stages + 1 } else { num_stages };
        let num_stages = num_stages.min(MAX_STAGES);

        Self {
            stages: core::array::from_fn(|_| FirstOrderAllpass::new()),
            num_stages,
            lfo_phase: 0.0,
            lfo_inc: rate_hz.max(0.01) / sample_rate,
            sample_rate,
            depth: depth.clamp(0.0, 1.0),
            feedback: feedback.clamp(0.0, 0.95),
            mix: mix.clamp(0.0, 1.0),
            fb_sample: 0.0,
        }
    }

    /// Set LFO rate in Hz.
    pub fn set_rate(&mut self, rate_hz: f32) {
        self.lfo_inc = rate_hz.max(0.01) / self.sample_rate;
    }

    /// Set modulation depth (0.0–1.0).
    pub fn set_depth(&mut self, depth: f32) {
        self.depth = depth.clamp(0.0, 1.0);
    }

    /// Set feedback / resonance (0.0–0.95).
    pub fn set_feedback(&mut self, feedback: f32) {
        self.feedback = feedback.clamp(0.0, 0.95);
    }

    /// Set number of stages (2–12, even).
    pub fn set_stages(&mut self, stages: usize) {
        let s = stages.clamp(2, MAX_STAGES);
        self.num_stages = if s % 2 != 0 { (s + 1).min(MAX_STAGES) } else { s };
    }

    /// Set wet/dry mix (0.0–1.0).
    pub fn set_mix(&mut self, mix: f32) {
        self.mix = mix.clamp(0.0, 1.0);
    }

    /// Process a single sample.
    #[inline]
    pub fn process_sample(&mut self, input: f32) -> f32 {
        // LFO: sine wave mapped to frequency range
        let lfo = (self.lfo_phase * TAU).sin(); // -1..1
        self.lfo_phase += self.lfo_inc;
        if self.lfo_phase >= 1.0 {
            self.lfo_phase -= 1.0;
        }

        // Map LFO to allpass cutoff frequency (log scale)
        let min_log = MIN_FREQ.ln();
        let max_log = MAX_FREQ.ln();
        let lfo_01 = (lfo + 1.0) * 0.5; // 0..1
        let sweep = lfo_01 * self.depth;
        let freq = (min_log + sweep * (max_log - min_log)).exp();

        // Update all allpass filter frequencies
        for stage in &mut self.stages[..self.num_stages] {
            stage.set_frequency(freq, self.sample_rate);
        }

        // Process through cascade with feedback
        let mut x = input + self.fb_sample;
        for stage in &mut self.stages[..self.num_stages] {
            x = stage.process(x);
        }

        self.fb_sample = x * self.feedback;

        // Mix
        input * (1.0 - self.mix) + x * self.mix
    }

    /// Process a buffer in-place.
    pub fn process_buffer(&mut self, buffer: &mut [f32]) {
        for sample in buffer.iter_mut() {
            *sample = self.process_sample(*sample);
        }
    }

    /// Clear internal state.
    pub fn reset(&mut self) {
        for stage in &mut self.stages {
            stage.reset();
        }
        self.lfo_phase = 0.0;
        self.fb_sample = 0.0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_creation() {
        let ph = Phaser::new(44100.0, 1.0, 0.5, 0.3, 4, 0.5);
        assert_eq!(ph.num_stages, 4);
    }

    #[test]
    fn test_odd_stages_rounded_even() {
        let ph = Phaser::new(44100.0, 1.0, 0.5, 0.3, 5, 0.5);
        assert_eq!(ph.num_stages, 6); // 5 → 6
    }

    #[test]
    fn test_stages_clamped() {
        let ph = Phaser::new(44100.0, 1.0, 0.5, 0.3, 1, 0.5);
        assert_eq!(ph.num_stages, 2);
        let ph2 = Phaser::new(44100.0, 1.0, 0.5, 0.3, 20, 0.5);
        assert_eq!(ph2.num_stages, MAX_STAGES);
    }

    #[test]
    fn test_silence_passthrough() {
        let mut ph = Phaser::new(44100.0, 1.0, 0.5, 0.0, 4, 1.0);
        let mut buf = [0.0_f32; 512];
        ph.process_buffer(&mut buf);
        for s in &buf {
            assert!(s.abs() < 1e-10, "Silence: {s}");
        }
    }

    #[test]
    fn test_dry_passthrough() {
        let mut ph = Phaser::new(44100.0, 1.0, 0.5, 0.0, 4, 0.0);
        let mut buf = [0.5_f32; 128];
        ph.process_buffer(&mut buf);
        for &s in &buf {
            assert!((s - 0.5).abs() < 0.01, "Dry: {s}");
        }
    }

    #[test]
    fn test_phaser_modulates_signal() {
        // Feed a varying signal — compare phaser output vs fixed allpass
        let mut ph = Phaser::new(44100.0, 2.0, 1.0, 0.7, 6, 1.0);
        let mut no_ph = Phaser::new(44100.0, 0.01, 0.0, 0.0, 6, 1.0);

        let mut diff_sum = 0.0_f32;
        for i in 0..8820 {
            // Sine wave input at 440 Hz
            let input = (i as f32 * 440.0 * core::f32::consts::TAU / 44100.0).sin() * 0.5;
            let out_ph = ph.process_sample(input);
            let out_no = no_ph.process_sample(input);
            diff_sum += (out_ph - out_no).abs();
        }

        assert!(
            diff_sum > 1.0,
            "Phaser should modulate signal: diff_sum={diff_sum}"
        );
    }

    #[test]
    fn test_feedback_increases_resonance() {
        // Higher feedback should create more pronounced effect
        let mut ph_lo = Phaser::new(44100.0, 2.0, 1.0, 0.0, 4, 1.0);
        let mut ph_hi = Phaser::new(44100.0, 2.0, 1.0, 0.8, 4, 1.0);

        // Feed same signal, compare variation
        let mut lo_range = 0.0_f32;
        let mut hi_range = 0.0_f32;

        for _ in 0..4410 {
            ph_lo.process_sample(0.5);
            ph_hi.process_sample(0.5);
        }

        let mut lo_min = f32::INFINITY;
        let mut lo_max = f32::NEG_INFINITY;
        let mut hi_min = f32::INFINITY;
        let mut hi_max = f32::NEG_INFINITY;

        for _ in 0..4410 {
            let lo = ph_lo.process_sample(0.5);
            let hi = ph_hi.process_sample(0.5);
            lo_min = lo_min.min(lo);
            lo_max = lo_max.max(lo);
            hi_min = hi_min.min(hi);
            hi_max = hi_max.max(hi);
        }

        lo_range = lo_max - lo_min;
        hi_range = hi_max - hi_min;

        assert!(
            hi_range > lo_range,
            "High feedback ({hi_range}) should have more range than low ({lo_range})"
        );
    }

    #[test]
    fn test_parameter_setters() {
        let mut ph = Phaser::new(44100.0, 1.0, 0.5, 0.3, 4, 0.5);
        ph.set_rate(3.0);
        ph.set_depth(0.8);
        ph.set_feedback(0.7);
        ph.set_stages(8);
        assert_eq!(ph.num_stages, 8);
        ph.set_mix(0.6);
    }

    #[test]
    fn test_reset() {
        let mut ph = Phaser::new(44100.0, 1.0, 0.5, 0.7, 6, 1.0);
        for _ in 0..4410 {
            ph.process_sample(1.0);
        }
        ph.reset();
        let out = ph.process_sample(0.0);
        assert!(out.abs() < 1e-6, "After reset: {out}");
    }

    #[test]
    fn test_output_bounded() {
        let mut ph = Phaser::new(44100.0, 2.0, 0.8, 0.7, 6, 0.5);
        let mut max_out = 0.0_f32;
        for _ in 0..44100 {
            let s = ph.process_sample(0.5);
            max_out = max_out.max(s.abs());
        }
        assert!(max_out < 5.0, "Bounded: {max_out}");
    }

    #[test]
    fn test_48khz() {
        let mut ph = Phaser::new(48000.0, 1.5, 0.7, 0.4, 6, 0.5);
        let mut buf = [0.5_f32; 480];
        ph.process_buffer(&mut buf);
        // Should work without panic
    }
}
