//! Reverb engine — Dattorro plate reverb + early reflections.
//!
//! Based on Jon Dattorro's "Effect Design Part 1: Reverberator and Other
//! Filters" (JAES 1997). Uses allpass diffusers, modulated delay lines,
//! and crossfed tank loops for natural-sounding reverberation.

use crate::biquad::{BiquadCoeffs, BiquadMono, FilterType};
use crate::delay::DelayLine;
use crate::ANTI_DENORMAL;

// ── Allpass Diffuser ────────────────────────────────────────────────

/// Single allpass filter stage for diffusion.
#[derive(Debug, Clone)]
struct AllpassDiffuser {
    delay: DelayLine,
    delay_samples: usize,
    feedback: f64,
}

impl AllpassDiffuser {
    fn new(delay_samples: usize, feedback: f64) -> Self {
        Self {
            delay: DelayLine::new(delay_samples + 8),
            delay_samples,
            feedback,
        }
    }

    #[inline]
    fn process(&mut self, input: f64) -> f64 {
        let delayed = self.delay.read(self.delay_samples) as f64;
        let v = input - self.feedback * delayed;
        self.delay.push(v as f32);
        delayed + self.feedback * v + ANTI_DENORMAL
    }

    fn clear(&mut self) {
        self.delay.clear();
    }
}

// ── Early Reflections ───────────────────────────────────────────────

/// Early reflections using a tapped delay line.
#[derive(Debug, Clone)]
struct EarlyReflections {
    delay: DelayLine,
    taps_left: Vec<(usize, f32)>,  // (delay_samples, gain)
    taps_right: Vec<(usize, f32)>,
}

impl EarlyReflections {
    fn new(sample_rate: f64, room_size: RoomSize) -> Self {
        let taps = room_size.tap_times_ms();
        let max_delay = (300.0 * sample_rate / 1000.0) as usize;

        let taps_left: Vec<(usize, f32)> = taps
            .iter()
            .enumerate()
            .filter(|(i, _)| i % 2 == 0)
            .map(|(_, &(ms, gain))| ((ms * sample_rate / 1000.0) as usize, gain))
            .collect();

        let taps_right: Vec<(usize, f32)> = taps
            .iter()
            .enumerate()
            .filter(|(i, _)| i % 2 == 1)
            .map(|(_, &(ms, gain))| ((ms * sample_rate / 1000.0) as usize, gain))
            .collect();

        Self {
            delay: DelayLine::new(max_delay),
            taps_left,
            taps_right,
        }
    }

    fn process(&mut self, input: f32) -> (f32, f32) {
        self.delay.push(input);

        let left: f32 = self
            .taps_left
            .iter()
            .map(|&(d, g)| self.delay.read(d) * g)
            .sum();

        let right: f32 = self
            .taps_right
            .iter()
            .map(|&(d, g)| self.delay.read(d) * g)
            .sum();

        (left, right)
    }

    fn clear(&mut self) {
        self.delay.clear();
    }
}

/// Room size presets for early reflections.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum RoomSize {
    Small,
    Medium,
    Large,
    Hall,
}

impl RoomSize {
    /// Return (delay_ms, gain) pairs for early reflection taps.
    fn tap_times_ms(&self) -> Vec<(f64, f32)> {
        match self {
            RoomSize::Small => vec![
                (3.0, 0.7),
                (7.0, 0.65),
                (11.0, 0.5),
                (17.0, 0.45),
                (23.0, 0.35),
                (29.0, 0.3),
            ],
            RoomSize::Medium => vec![
                (5.0, 0.7),
                (12.0, 0.6),
                (19.0, 0.5),
                (28.0, 0.45),
                (37.0, 0.35),
                (46.0, 0.3),
                (57.0, 0.25),
                (71.0, 0.2),
            ],
            RoomSize::Large => vec![
                (8.0, 0.65),
                (19.0, 0.55),
                (31.0, 0.5),
                (45.0, 0.4),
                (62.0, 0.35),
                (81.0, 0.3),
                (103.0, 0.25),
                (128.0, 0.2),
                (157.0, 0.15),
                (191.0, 0.12),
            ],
            RoomSize::Hall => vec![
                (11.0, 0.6),
                (27.0, 0.5),
                (47.0, 0.45),
                (71.0, 0.4),
                (97.0, 0.35),
                (131.0, 0.3),
                (169.0, 0.25),
                (211.0, 0.2),
                (259.0, 0.15),
                (311.0, 0.12),
            ],
        }
    }
}

// ── Dattorro Plate Reverb ───────────────────────────────────────────

/// Reverb parameters.
#[derive(Debug, Clone, Copy)]
pub struct ReverbParams {
    pub decay: f64,        // 0.1–30 seconds
    pub damping: f64,      // 0–1 (high-frequency absorption)
    pub diffusion: f64,    // 0–1
    pub predelay_ms: f64,  // 0–250ms
    pub mod_depth: f64,    // 0–1 (tank modulation)
    pub mod_rate: f64,     // 0.1–5 Hz
    pub early_level: f64,  // 0–1
    pub late_level: f64,   // 0–1
    pub wet: f64,          // 0–1
    pub room_size: RoomSize,
}

impl Default for ReverbParams {
    fn default() -> Self {
        Self {
            decay: 2.0,
            damping: 0.5,
            diffusion: 0.7,
            predelay_ms: 20.0,
            mod_depth: 0.3,
            mod_rate: 0.5,
            early_level: 0.5,
            late_level: 1.0,
            wet: 0.3,
            room_size: RoomSize::Medium,
        }
    }
}

/// Dattorro plate reverb with early reflections.
///
/// Architecture:
/// Input → Pre-delay → Input Diffusers (4x allpass)
///     → Tank Loop A (delay + damping + modulation)
///     → Tank Loop B (delay + damping + modulation)
///     → Cross-fed output taps
#[derive(Debug)]
pub struct DattorroReverb {
    params: ReverbParams,
    sample_rate: f64,

    // Pre-delay
    predelay: DelayLine,
    predelay_samples: usize,

    // Early reflections
    early: EarlyReflections,

    // Input diffusion (4 allpass stages)
    input_diffusers: [AllpassDiffuser; 4],

    // Tank: two delay lines with damping filters
    tank_delay_a: DelayLine,
    tank_delay_b: DelayLine,
    tank_allpass_a: AllpassDiffuser,
    tank_allpass_b: AllpassDiffuser,
    damp_a: BiquadMono,
    damp_b: BiquadMono,

    // Tank delay lengths (in samples) — prime-like for density
    tank_len_a: usize,
    tank_len_b: usize,

    // Modulation LFO
    lfo_phase: f64,

    // Decay coefficient
    decay_coeff: f64,
}

impl DattorroReverb {
    pub fn new(params: ReverbParams, sample_rate: f64) -> Self {
        let predelay_samples = (params.predelay_ms * sample_rate / 1000.0) as usize;

        // Tank delay lengths (prime-ish, scaled by sample rate)
        let scale = sample_rate / 29761.0; // Dattorro's reference sample rate
        let tank_len_a = (4453.0 * scale) as usize;
        let tank_len_b = (3720.0 * scale) as usize;

        // Input diffuser delay lengths (from Dattorro paper)
        let diff = params.diffusion;
        let input_diffusers = [
            AllpassDiffuser::new((142.0 * scale) as usize, 0.75 * diff),
            AllpassDiffuser::new((107.0 * scale) as usize, 0.75 * diff),
            AllpassDiffuser::new((379.0 * scale) as usize, 0.625 * diff),
            AllpassDiffuser::new((277.0 * scale) as usize, 0.625 * diff),
        ];

        // Tank allpass (inside the feedback loop)
        let tank_allpass_a =
            AllpassDiffuser::new((672.0 * scale) as usize, 0.5 * diff);
        let tank_allpass_b =
            AllpassDiffuser::new((908.0 * scale) as usize, 0.5 * diff);

        // Damping filters (lowpass in feedback path)
        let damp_freq = 2000.0 + (1.0 - params.damping) * 16000.0;
        let damp_coeffs =
            BiquadCoeffs::new(FilterType::Lowpass, damp_freq, 0.707, 0.0, sample_rate);

        // Decay coefficient from decay time
        let decay_coeff = compute_decay_coeff(params.decay, tank_len_a + tank_len_b, sample_rate);

        Self {
            params,
            sample_rate,
            predelay: DelayLine::new(predelay_samples.max(1) + 64),
            predelay_samples,
            early: EarlyReflections::new(sample_rate, params.room_size),
            input_diffusers,
            tank_delay_a: DelayLine::new(tank_len_a + 256),
            tank_delay_b: DelayLine::new(tank_len_b + 256),
            tank_allpass_a,
            tank_allpass_b,
            damp_a: BiquadMono::new(damp_coeffs),
            damp_b: BiquadMono::new(damp_coeffs),
            tank_len_a,
            tank_len_b,
            lfo_phase: 0.0,
            decay_coeff,
        }
    }

    pub fn set_params(&mut self, params: ReverbParams) {
        self.predelay_samples = (params.predelay_ms * self.sample_rate / 1000.0) as usize;
        self.decay_coeff = compute_decay_coeff(
            params.decay,
            self.tank_len_a + self.tank_len_b,
            self.sample_rate,
        );

        let damp_freq = 2000.0 + (1.0 - params.damping) * 16000.0;
        let damp_coeffs = BiquadCoeffs::new(
            FilterType::Lowpass,
            damp_freq,
            0.707,
            0.0,
            self.sample_rate,
        );
        self.damp_a.set_coeffs(damp_coeffs);
        self.damp_b.set_coeffs(damp_coeffs);

        self.params = params;
    }

    /// Process stereo audio in-place.
    pub fn process_stereo(&mut self, left: &mut [f32], right: &mut [f32]) {
        let len = left.len().min(right.len());
        let lfo_inc = self.params.mod_rate * 2.0 * core::f64::consts::PI / self.sample_rate;
        let mod_depth_samples = self.params.mod_depth * 16.0; // max 16 samples modulation

        for i in 0..len {
            let dry_l = left[i];
            let dry_r = right[i];

            // Mono sum for input
            let input = (dry_l + dry_r) * 0.5;

            // Pre-delay
            self.predelay.push(input);
            let predelayed = if self.predelay_samples > 0 {
                self.predelay.read(self.predelay_samples)
            } else {
                input
            };

            // Early reflections
            let (er_l, er_r) = self.early.process(predelayed);

            // Input diffusion
            let mut diffused = predelayed as f64;
            for diff in &mut self.input_diffusers {
                diffused = diff.process(diffused);
            }

            // LFO for tank modulation
            let lfo = self.lfo_phase.sin();
            self.lfo_phase += lfo_inc;
            if self.lfo_phase > 2.0 * core::f64::consts::PI {
                self.lfo_phase -= 2.0 * core::f64::consts::PI;
            }

            // Tank loop A
            let mod_a = (1.0 + lfo * mod_depth_samples) as f64;
            let tank_read_a = self
                .tank_delay_a
                .read_linear(self.tank_len_a as f64 + mod_a) as f64;
            let damped_a = self.damp_a.process_sample(tank_read_a as f32) as f64;

            // Tank loop B (with cross-feed from A)
            let mod_b = (1.0 - lfo * mod_depth_samples * 0.7) as f64;
            let tank_read_b = self
                .tank_delay_b
                .read_linear(self.tank_len_b as f64 + mod_b) as f64;
            let damped_b = self.damp_b.process_sample(tank_read_b as f32) as f64;

            // Cross-feed: A feeds into B, B feeds into A
            let into_a = diffused + damped_b * self.decay_coeff;
            let into_b = damped_a * self.decay_coeff;

            // Process through tank allpass
            let ap_a = self.tank_allpass_a.process(into_a);
            let ap_b = self.tank_allpass_b.process(into_b);

            self.tank_delay_a.push(ap_a as f32);
            self.tank_delay_b.push(ap_b as f32);

            // Output taps (decorrelated L/R)
            let late_l = (tank_read_a + tank_read_b * 0.6) as f32;
            let late_r = (tank_read_b + tank_read_a * 0.6) as f32;

            // Mix
            let el = self.params.early_level as f32;
            let ll = self.params.late_level as f32;
            let wet = self.params.wet as f32;

            let reverb_l = er_l * el + late_l * ll;
            let reverb_r = er_r * el + late_r * ll;

            left[i] = dry_l * (1.0 - wet) + reverb_l * wet;
            right[i] = dry_r * (1.0 - wet) + reverb_r * wet;
        }
    }

    pub fn reset(&mut self) {
        self.predelay.clear();
        self.early.clear();
        for diff in &mut self.input_diffusers {
            diff.clear();
        }
        self.tank_delay_a.clear();
        self.tank_delay_b.clear();
        self.tank_allpass_a.clear();
        self.tank_allpass_b.clear();
        self.damp_a.reset();
        self.damp_b.reset();
        self.lfo_phase = 0.0;
    }
}

/// Compute the per-sample decay coefficient from the desired RT60 time.
fn compute_decay_coeff(decay_seconds: f64, loop_length_samples: usize, sample_rate: f64) -> f64 {
    if decay_seconds <= 0.0 || loop_length_samples == 0 {
        return 0.0;
    }
    let rt60_samples = decay_seconds * sample_rate;
    let loops = rt60_samples / loop_length_samples as f64;
    // -60dB after `loops` iterations → gain^loops = 0.001
    0.001_f64.powf(1.0 / loops).min(0.9999)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SR: f64 = 48000.0;

    #[test]
    fn reverb_produces_output() {
        let params = ReverbParams::default();
        let mut reverb = DattorroReverb::new(params, SR);

        // Send an impulse
        let mut left = vec![0.0f32; 4800];
        let mut right = vec![0.0f32; 4800];
        left[0] = 1.0;
        right[0] = 1.0;

        reverb.process_stereo(&mut left, &mut right);

        // After the impulse, there should be reverb tail energy
        let tail_energy: f32 = left[2400..4800].iter().map(|&s| s * s).sum();
        assert!(
            tail_energy > 0.0001,
            "Reverb should produce tail energy: got {tail_energy}"
        );
    }

    #[test]
    fn reverb_decays_to_silence() {
        let params = ReverbParams {
            decay: 0.5, // Short decay
            wet: 1.0,
            ..ReverbParams::default()
        };
        let mut reverb = DattorroReverb::new(params, SR);

        // Impulse
        let mut left = vec![0.0f32; 48000]; // 1 second
        let mut right = vec![0.0f32; 48000];
        left[0] = 1.0;
        right[0] = 1.0;

        reverb.process_stereo(&mut left, &mut right);

        // Early energy should be higher than late energy
        let early_energy: f32 = left[1000..5000].iter().map(|&s| s * s).sum();
        let late_energy: f32 = left[40000..48000].iter().map(|&s| s * s).sum();

        assert!(
            early_energy > late_energy,
            "Reverb should decay: early={early_energy:.6}, late={late_energy:.6}"
        );
    }

    #[test]
    fn dry_signal_preserved() {
        let params = ReverbParams {
            wet: 0.0, // Fully dry
            ..ReverbParams::default()
        };
        let mut reverb = DattorroReverb::new(params, SR);

        let mut left = vec![0.5f32; 100];
        let mut right = vec![0.5f32; 100];

        reverb.process_stereo(&mut left, &mut right);

        // Should be exactly dry signal
        assert!(
            (left[99] - 0.5).abs() < 0.001,
            "Dry-only should preserve signal: got {}",
            left[99]
        );
    }

    #[test]
    fn stereo_decorrelation() {
        let params = ReverbParams {
            wet: 1.0,
            ..ReverbParams::default()
        };
        let mut reverb = DattorroReverb::new(params, SR);

        // Impulse
        let mut left = vec![0.0f32; 4800];
        let mut right = vec![0.0f32; 4800];
        left[0] = 1.0;
        right[0] = 1.0;

        reverb.process_stereo(&mut left, &mut right);

        // L and R should be different (decorrelated)
        let mut diff_sum = 0.0f32;
        for i in 1000..4800 {
            diff_sum += (left[i] - right[i]).abs();
        }

        assert!(
            diff_sum > 0.01,
            "L/R should be decorrelated: diff_sum = {diff_sum}"
        );
    }

    #[test]
    fn predelay_delays_output() {
        let params = ReverbParams {
            predelay_ms: 50.0, // 50ms = 2400 samples at 48kHz
            wet: 1.0,
            early_level: 0.0,
            late_level: 1.0,
            ..ReverbParams::default()
        };
        let mut reverb = DattorroReverb::new(params, SR);

        let mut left = vec![0.0f32; 4800];
        let mut right = vec![0.0f32; 4800];
        left[0] = 1.0;
        right[0] = 1.0;

        reverb.process_stereo(&mut left, &mut right);

        // First 2000 samples should be near-silent (predelay + diffusion latency)
        let early_energy: f32 = left[0..1000].iter().map(|&s| s * s).sum();
        assert!(
            early_energy < 0.01,
            "Predelay should delay output: early energy = {early_energy}"
        );
    }

    #[test]
    fn reset_clears_state() {
        let params = ReverbParams::default();
        let mut reverb = DattorroReverb::new(params, SR);

        // Process some audio
        let mut left = vec![1.0f32; 1000];
        let mut right = vec![1.0f32; 1000];
        reverb.process_stereo(&mut left, &mut right);

        reverb.reset();

        // After reset, silence input should produce silence output
        let mut left = vec![0.0f32; 1000];
        let mut right = vec![0.0f32; 1000];
        reverb.process_stereo(&mut left, &mut right);

        let energy: f32 = left.iter().map(|&s| s * s).sum();
        assert!(
            energy < 0.001,
            "After reset, silence should produce silence: energy = {energy}"
        );
    }

    #[test]
    fn decay_coeff_reasonable() {
        // 2-second decay with ~8000 sample loop at 48kHz
        let coeff = compute_decay_coeff(2.0, 8000, SR);
        assert!(coeff > 0.5 && coeff < 1.0, "Decay coeff should be 0.5..1.0: got {coeff}");
    }
}
