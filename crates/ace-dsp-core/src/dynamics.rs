//! Dynamics processors — compressor, noise gate, envelope follower.
//!
//! Professional-grade dynamics processing with:
//! - RMS and peak envelope detection
//! - Soft/hard knee compression
//! - Ballistics-based attack/release smoothing
//! - Noise gate with hold time and configurable range

use core::f32::consts::LN_2;
use crate::ANTI_DENORMAL;

/// Convert linear amplitude to decibels.
#[inline]
fn lin_to_db(lin: f32) -> f32 {
    if lin <= ANTI_DENORMAL {
        -100.0
    } else {
        20.0 * lin.log10()
    }
}

/// Convert decibels to linear amplitude.
#[inline]
fn db_to_lin(db: f32) -> f32 {
    if db <= -100.0 {
        0.0
    } else {
        10.0_f32.powf(db / 20.0)
    }
}

/// Compute the ballistics coefficient for a 1-pole IIR filter.
/// `time_sec` is the time constant (attack or release), `sample_rate` is in Hz.
#[inline]
fn ballistics_coeff(time_sec: f32, sample_rate: f32) -> f32 {
    if time_sec <= 0.0 {
        0.0 // instant
    } else {
        (-LN_2 / (time_sec * sample_rate)).exp()
    }
}

/// Envelope detection mode.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum EnvelopeMode {
    /// Peak detection — follows the instantaneous absolute value.
    Peak,
    /// RMS detection — follows the root-mean-square level.
    Rms,
}

/// Envelope follower with configurable attack/release ballistics.
pub struct EnvelopeFollower {
    mode: EnvelopeMode,
    attack_coeff: f32,
    release_coeff: f32,
    envelope: f32,
    sample_rate: f32,
}

impl EnvelopeFollower {
    pub fn new(mode: EnvelopeMode, sample_rate: f32, attack_ms: f32, release_ms: f32) -> Self {
        Self {
            mode,
            attack_coeff: ballistics_coeff(attack_ms / 1000.0, sample_rate),
            release_coeff: ballistics_coeff(release_ms / 1000.0, sample_rate),
            envelope: 0.0,
            sample_rate,
        }
    }

    pub fn set_attack(&mut self, attack_ms: f32) {
        self.attack_coeff = ballistics_coeff(attack_ms / 1000.0, self.sample_rate);
    }

    pub fn set_release(&mut self, release_ms: f32) {
        self.release_coeff = ballistics_coeff(release_ms / 1000.0, self.sample_rate);
    }

    /// Process a single sample and return the current envelope level (linear).
    #[inline]
    pub fn process(&mut self, input: f32) -> f32 {
        let detector_input = match self.mode {
            EnvelopeMode::Peak => input.abs(),
            EnvelopeMode::Rms => input * input,
        };

        // Branching ballistics: fast attack, slow release
        let coeff = if detector_input > self.envelope {
            self.attack_coeff
        } else {
            self.release_coeff
        };

        self.envelope = coeff * self.envelope + (1.0 - coeff) * detector_input
            + ANTI_DENORMAL - ANTI_DENORMAL;

        match self.mode {
            EnvelopeMode::Peak => self.envelope,
            EnvelopeMode::Rms => self.envelope.sqrt(),
        }
    }

    /// Get current envelope level (linear).
    pub fn level(&self) -> f32 {
        match self.mode {
            EnvelopeMode::Peak => self.envelope,
            EnvelopeMode::Rms => self.envelope.sqrt(),
        }
    }

    pub fn reset(&mut self) {
        self.envelope = 0.0;
    }
}

/// Compressor with soft/hard knee, attack/release, and makeup gain.
pub struct Compressor {
    envelope: EnvelopeFollower,
    threshold_db: f32,
    ratio: f32,
    knee_db: f32,
    makeup_gain_db: f32,
    gain_reduction_db: f32,
}

impl Compressor {
    /// Create a new compressor.
    /// - `threshold_db`: compression threshold in dB (e.g., -20.0)
    /// - `ratio`: compression ratio (e.g., 4.0 for 4:1)
    /// - `attack_ms`: attack time in milliseconds
    /// - `release_ms`: release time in milliseconds
    /// - `knee_db`: knee width in dB (0.0 = hard knee)
    /// - `makeup_gain_db`: output gain compensation in dB
    pub fn new(
        sample_rate: f32,
        threshold_db: f32,
        ratio: f32,
        attack_ms: f32,
        release_ms: f32,
        knee_db: f32,
        makeup_gain_db: f32,
    ) -> Self {
        Self {
            envelope: EnvelopeFollower::new(EnvelopeMode::Rms, sample_rate, attack_ms, release_ms),
            threshold_db,
            ratio: ratio.max(1.0),
            knee_db: knee_db.max(0.0),
            makeup_gain_db,
            gain_reduction_db: 0.0,
        }
    }

    pub fn set_threshold(&mut self, db: f32) {
        self.threshold_db = db;
    }

    pub fn set_ratio(&mut self, ratio: f32) {
        self.ratio = ratio.max(1.0);
    }

    pub fn set_attack(&mut self, ms: f32) {
        self.envelope.set_attack(ms);
    }

    pub fn set_release(&mut self, ms: f32) {
        self.envelope.set_release(ms);
    }

    pub fn set_knee(&mut self, db: f32) {
        self.knee_db = db.max(0.0);
    }

    pub fn set_makeup_gain(&mut self, db: f32) {
        self.makeup_gain_db = db;
    }

    /// Get current gain reduction in dB (always <= 0).
    pub fn gain_reduction_db(&self) -> f32 {
        self.gain_reduction_db
    }

    /// Compute gain reduction for a given input level in dB.
    /// Returns the gain to apply in dB.
    #[inline]
    fn compute_gain(&self, input_db: f32) -> f32 {
        let t = self.threshold_db;
        let r = self.ratio;
        let w = self.knee_db;

        if w <= 0.0 || w < 0.01 {
            // Hard knee
            if input_db <= t {
                0.0
            } else {
                (t + (input_db - t) / r) - input_db
            }
        } else {
            // Soft knee
            let half_w = w / 2.0;
            if input_db <= t - half_w {
                // Below knee — no compression
                0.0
            } else if input_db >= t + half_w {
                // Above knee — full compression
                (t + (input_db - t) / r) - input_db
            } else {
                // In the knee region — quadratic interpolation
                let x = input_db - t + half_w;
                (1.0 / r - 1.0) * x * x / (2.0 * w)
            }
        }
    }

    /// Process a single sample. Returns the compressed sample.
    #[inline]
    pub fn process_sample(&mut self, input: f32) -> f32 {
        let level = self.envelope.process(input);
        let input_db = lin_to_db(level);
        let gr_db = self.compute_gain(input_db);
        self.gain_reduction_db = gr_db;
        let total_gain_db = gr_db + self.makeup_gain_db;
        input * db_to_lin(total_gain_db)
    }

    /// Process a buffer in-place.
    #[inline]
    pub fn process_buffer(&mut self, buffer: &mut [f32]) {
        for sample in buffer.iter_mut() {
            *sample = self.process_sample(*sample);
        }
    }

    pub fn reset(&mut self) {
        self.envelope.reset();
        self.gain_reduction_db = 0.0;
    }
}

/// Noise gate with hold time and configurable range.
pub struct NoiseGate {
    envelope: EnvelopeFollower,
    threshold_db: f32,
    range_db: f32,
    hold_samples: usize,
    hold_counter: usize,
    gate_gain: f32,
    attack_coeff: f32,
    release_coeff: f32,
    sample_rate: f32,
}

impl NoiseGate {
    /// Create a new noise gate.
    /// - `threshold_db`: gate threshold in dB
    /// - `attack_ms`: gate open time
    /// - `hold_ms`: time to hold gate open after signal drops below threshold
    /// - `release_ms`: gate close time
    /// - `range_db`: attenuation when gate is closed (e.g., -80 for full gate, -20 for expander)
    pub fn new(
        sample_rate: f32,
        threshold_db: f32,
        attack_ms: f32,
        hold_ms: f32,
        release_ms: f32,
        range_db: f32,
    ) -> Self {
        Self {
            envelope: EnvelopeFollower::new(EnvelopeMode::Peak, sample_rate, 0.1, release_ms),
            threshold_db,
            range_db: range_db.min(0.0),
            hold_samples: (hold_ms / 1000.0 * sample_rate) as usize,
            hold_counter: 0,
            gate_gain: 1.0,
            attack_coeff: ballistics_coeff(attack_ms / 1000.0, sample_rate),
            release_coeff: ballistics_coeff(release_ms / 1000.0, sample_rate),
            sample_rate,
        }
    }

    pub fn set_threshold(&mut self, db: f32) {
        self.threshold_db = db;
    }

    pub fn set_attack(&mut self, ms: f32) {
        self.attack_coeff = ballistics_coeff(ms / 1000.0, self.sample_rate);
    }

    pub fn set_hold(&mut self, ms: f32) {
        self.hold_samples = (ms / 1000.0 * self.sample_rate) as usize;
    }

    pub fn set_release(&mut self, ms: f32) {
        self.release_coeff = ballistics_coeff(ms / 1000.0, self.sample_rate);
    }

    pub fn set_range(&mut self, db: f32) {
        self.range_db = db.min(0.0);
    }

    /// Returns true if the gate is currently open.
    pub fn is_open(&self) -> bool {
        self.gate_gain > 0.5
    }

    /// Process a single sample. Returns the gated sample.
    #[inline]
    pub fn process_sample(&mut self, input: f32) -> f32 {
        let level = self.envelope.process(input);
        let level_db = lin_to_db(level);

        let target_gain = if level_db >= self.threshold_db {
            self.hold_counter = self.hold_samples;
            1.0 // gate open
        } else if self.hold_counter > 0 {
            self.hold_counter -= 1;
            1.0 // holding open
        } else {
            db_to_lin(self.range_db) // gate closed (attenuated)
        };

        // Smooth the gate gain with ballistics
        let coeff = if target_gain > self.gate_gain {
            self.attack_coeff
        } else {
            self.release_coeff
        };
        self.gate_gain = coeff * self.gate_gain + (1.0 - coeff) * target_gain;

        input * self.gate_gain
    }

    /// Process a buffer in-place.
    #[inline]
    pub fn process_buffer(&mut self, buffer: &mut [f32]) {
        for sample in buffer.iter_mut() {
            *sample = self.process_sample(*sample);
        }
    }

    pub fn reset(&mut self) {
        self.envelope.reset();
        self.hold_counter = 0;
        self.gate_gain = 1.0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ---- Utility tests ----

    #[test]
    fn test_lin_to_db() {
        assert!((lin_to_db(1.0) - 0.0).abs() < 0.01);
        assert!((lin_to_db(0.5) - (-6.02)).abs() < 0.1);
        assert!((lin_to_db(0.1) - (-20.0)).abs() < 0.1);
        assert!(lin_to_db(0.0) <= -99.0);
    }

    #[test]
    fn test_db_to_lin() {
        assert!((db_to_lin(0.0) - 1.0).abs() < 0.01);
        assert!((db_to_lin(-6.02) - 0.5).abs() < 0.01);
        assert!((db_to_lin(-20.0) - 0.1).abs() < 0.01);
        assert_eq!(db_to_lin(-100.0), 0.0);
    }

    #[test]
    fn test_db_roundtrip() {
        for &val in &[0.1, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0] {
            let roundtrip = db_to_lin(lin_to_db(val));
            assert!(
                (roundtrip - val).abs() < 0.001,
                "Roundtrip failed for {val}: got {roundtrip}"
            );
        }
    }

    // ---- Envelope follower tests ----

    #[test]
    fn test_envelope_peak_follows_signal() {
        let mut env = EnvelopeFollower::new(EnvelopeMode::Peak, 48000.0, 1.0, 50.0);
        // Feed a constant signal
        for _ in 0..4800 {
            env.process(0.5);
        }
        let level = env.level();
        assert!(
            (level - 0.5).abs() < 0.05,
            "Peak envelope should track 0.5, got {level}"
        );
    }

    #[test]
    fn test_envelope_rms_tracks_sine() {
        let mut env = EnvelopeFollower::new(EnvelopeMode::Rms, 48000.0, 5.0, 50.0);
        let freq = 1000.0;
        // Feed a sine wave
        for i in 0..48000 {
            let sample = (2.0 * core::f32::consts::PI * freq * i as f32 / 48000.0).sin();
            env.process(sample);
        }
        let level = env.level();
        // Ballistics-based RMS reads higher than true RMS (~0.707) due to
        // asymmetric attack/release. Expected range: 0.7–1.0
        assert!(
            level > 0.6 && level < 1.0,
            "RMS envelope should track sine in range 0.6-1.0, got {level}"
        );
    }

    #[test]
    fn test_envelope_reset() {
        let mut env = EnvelopeFollower::new(EnvelopeMode::Peak, 48000.0, 1.0, 50.0);
        for _ in 0..1000 {
            env.process(1.0);
        }
        env.reset();
        assert_eq!(env.level(), 0.0);
    }

    // ---- Compressor tests ----

    #[test]
    fn test_compressor_below_threshold_passes() {
        let mut comp = Compressor::new(48000.0, -10.0, 4.0, 1.0, 50.0, 0.0, 0.0);
        // Feed a quiet signal (well below -10dB threshold)
        let mut buf = [0.1_f32; 4800]; // ~-20dB
        comp.process_buffer(&mut buf);
        // After envelope settles, signal should be mostly unchanged
        let last = buf[4799];
        assert!(
            (last - 0.1).abs() < 0.02,
            "Below threshold should pass: got {last}"
        );
    }

    #[test]
    fn test_compressor_above_threshold_reduces() {
        let mut comp = Compressor::new(48000.0, -20.0, 4.0, 0.1, 50.0, 0.0, 0.0);
        // Feed a loud signal (~0dB)
        let mut buf = [1.0_f32; 4800];
        comp.process_buffer(&mut buf);
        // Should be compressed (output < input)
        let last = buf[4799];
        assert!(
            last < 0.8,
            "Above threshold should compress: got {last}"
        );
        assert!(last > 0.01, "Should not be silent: got {last}");
    }

    #[test]
    fn test_compressor_gain_reduction_reported() {
        let mut comp = Compressor::new(48000.0, -20.0, 4.0, 0.1, 50.0, 0.0, 0.0);
        let mut buf = [1.0_f32; 4800];
        comp.process_buffer(&mut buf);
        let gr = comp.gain_reduction_db();
        assert!(gr < -1.0, "Should report gain reduction: {gr}dB");
    }

    #[test]
    fn test_compressor_hard_knee() {
        let comp = Compressor::new(48000.0, -20.0, 4.0, 1.0, 50.0, 0.0, 0.0);
        // Hard knee: below threshold = 0 gain change
        assert_eq!(comp.compute_gain(-30.0), 0.0);
        // Above threshold: compressed
        let gr = comp.compute_gain(-10.0);
        assert!(gr < -1.0, "Hard knee above threshold: {gr}dB");
    }

    #[test]
    fn test_compressor_soft_knee() {
        let comp = Compressor::new(48000.0, -20.0, 4.0, 1.0, 50.0, 10.0, 0.0);
        // Well below knee: no compression
        assert_eq!(comp.compute_gain(-30.0), 0.0);
        // In knee region: partial compression
        let gr_knee = comp.compute_gain(-20.0);
        assert!(gr_knee < 0.0, "In knee: {gr_knee}dB");
        // Above knee: full compression
        let gr_above = comp.compute_gain(-10.0);
        assert!(gr_above < gr_knee, "Above knee should compress more: {gr_above} vs {gr_knee}");
    }

    #[test]
    fn test_compressor_makeup_gain() {
        let mut comp = Compressor::new(48000.0, -20.0, 4.0, 0.1, 50.0, 0.0, 10.0);
        // Feed signal below threshold
        let mut buf = [0.1_f32; 4800];
        comp.process_buffer(&mut buf);
        let last = buf[4799];
        // Makeup gain should boost output
        assert!(
            last > 0.1,
            "Makeup gain should boost: got {last}"
        );
    }

    #[test]
    fn test_compressor_ratio_1_no_compression() {
        let comp = Compressor::new(48000.0, -20.0, 1.0, 1.0, 50.0, 0.0, 0.0);
        // Ratio 1:1 = no compression
        let gr = comp.compute_gain(0.0);
        assert!(
            gr.abs() < 0.01,
            "Ratio 1:1 should not compress: {gr}dB"
        );
    }

    #[test]
    fn test_compressor_reset() {
        let mut comp = Compressor::new(48000.0, -20.0, 4.0, 0.1, 50.0, 0.0, 0.0);
        let mut buf = [1.0_f32; 1000];
        comp.process_buffer(&mut buf);
        comp.reset();
        assert_eq!(comp.gain_reduction_db(), 0.0);
    }

    // ---- Noise gate tests ----

    #[test]
    fn test_gate_passes_loud_signal() {
        let mut gate = NoiseGate::new(48000.0, -40.0, 0.1, 10.0, 50.0, -80.0);
        // Feed loud signal (well above -40dB threshold)
        let mut buf = [0.5_f32; 4800];
        gate.process_buffer(&mut buf);
        let last = buf[4799];
        assert!(
            (last - 0.5).abs() < 0.05,
            "Gate should pass loud signal: got {last}"
        );
    }

    #[test]
    fn test_gate_attenuates_quiet_signal() {
        let mut gate = NoiseGate::new(48000.0, -20.0, 0.1, 0.0, 10.0, -80.0);
        // Feed very quiet signal (well below -20dB threshold)
        let mut buf = [0.001_f32; 48000]; // ~-60dB
        gate.process_buffer(&mut buf);
        let last = buf[47999];
        assert!(
            last < 0.0005,
            "Gate should attenuate quiet signal: got {last}"
        );
    }

    #[test]
    fn test_gate_hold_time() {
        let mut gate = NoiseGate::new(48000.0, -20.0, 0.1, 100.0, 50.0, -80.0);
        // Feed loud signal to open gate
        for _ in 0..4800 {
            gate.process_sample(0.5);
        }
        assert!(gate.is_open(), "Gate should be open with loud signal");

        // Feed silence — gate should hold for 100ms (4800 samples at 48kHz)
        for _ in 0..2400 {
            gate.process_sample(0.0);
        }
        // Should still be open (within hold time)
        assert!(gate.is_open(), "Gate should still be open during hold");
    }

    #[test]
    fn test_gate_range_expander() {
        let mut gate = NoiseGate::new(48000.0, -20.0, 0.1, 0.0, 10.0, -12.0);
        // Feed quiet signal with -12dB range (expander mode, not full gate)
        let mut buf = [0.001_f32; 48000];
        gate.process_buffer(&mut buf);
        let last = buf[47999];
        // With -12dB range, the signal should be attenuated but not fully gated
        assert!(last > 0.0001, "Expander should not fully gate: {last}");
        assert!(last < 0.001, "Expander should attenuate: {last}");
    }

    #[test]
    fn test_gate_reset() {
        let mut gate = NoiseGate::new(48000.0, -20.0, 0.1, 100.0, 50.0, -80.0);
        for _ in 0..1000 {
            gate.process_sample(0.5);
        }
        gate.reset();
        assert_eq!(gate.gate_gain, 1.0);
        assert_eq!(gate.hold_counter, 0);
    }
}
