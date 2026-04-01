//! Modulation effects — chorus, flanger, phaser.
//!
//! All three share the LFO + modulated-delay architecture pattern but differ
//! in delay ranges, feedback behavior, and topology.

use crate::biquad::{BiquadCoeffs, BiquadMono, FilterType};
use crate::delay::DelayLine;
use crate::lfo::{Lfo, LfoWaveform};
use crate::ANTI_DENORMAL;

// ── Chorus ──────────────────────────────────────────────────────────

/// Chorus parameters.
#[derive(Debug, Clone, Copy)]
pub struct ChorusParams {
    pub rate_hz: f64,       // LFO rate: 0.1–5 Hz
    pub depth: f64,         // Modulation depth: 0–1
    pub delay_ms: f64,      // Center delay: 5–30ms
    pub feedback: f64,      // 0–0.5
    pub wet: f64,           // 0–1
    pub stereo_spread: f64, // LFO phase offset for stereo: 0–0.5 (0.25 = 90°)
}

impl Default for ChorusParams {
    fn default() -> Self {
        Self {
            rate_hz: 1.0,
            depth: 0.5,
            delay_ms: 15.0,
            feedback: 0.2,
            wet: 0.5,
            stereo_spread: 0.25,
        }
    }
}

/// Stereo chorus effect.
#[derive(Debug)]
pub struct Chorus {
    params: ChorusParams,
    lfo: Lfo,
    delay_left: DelayLine,
    delay_right: DelayLine,
    center_delay_samples: f64,
    depth_samples: f64,
    sample_rate: f64,
}

impl Chorus {
    pub fn new(params: ChorusParams, sample_rate: f64) -> Self {
        let max_delay = ((params.delay_ms + 20.0) * sample_rate / 1000.0) as usize;
        let center = params.delay_ms * sample_rate / 1000.0;
        let depth = params.depth * center * 0.5;

        Self {
            params,
            lfo: Lfo::new(params.rate_hz, LfoWaveform::Sine, sample_rate),
            delay_left: DelayLine::new(max_delay + 64),
            delay_right: DelayLine::new(max_delay + 64),
            center_delay_samples: center,
            depth_samples: depth,
            sample_rate,
        }
    }

    pub fn set_params(&mut self, params: ChorusParams) {
        self.lfo.set_rate(params.rate_hz);
        self.center_delay_samples = params.delay_ms * self.sample_rate / 1000.0;
        self.depth_samples = params.depth * self.center_delay_samples * 0.5;
        self.params = params;
    }

    pub fn process_stereo(&mut self, left: &mut [f32], right: &mut [f32]) {
        let len = left.len().min(right.len());
        let wet = self.params.wet as f32;
        let fb = self.params.feedback as f32;

        for i in 0..len {
            let (lfo_l, lfo_r) = self.lfo.next_with_offset(self.params.stereo_spread);

            let delay_l = self.center_delay_samples + lfo_l * self.depth_samples;
            let delay_r = self.center_delay_samples + lfo_r * self.depth_samples;

            let wet_l = self.delay_left.read_cubic(delay_l.max(1.0));
            let wet_r = self.delay_right.read_cubic(delay_r.max(1.0));

            self.delay_left.push(left[i] + wet_l * fb);
            self.delay_right.push(right[i] + wet_r * fb);

            left[i] = left[i] * (1.0 - wet) + wet_l * wet;
            right[i] = right[i] * (1.0 - wet) + wet_r * wet;
        }
    }

    pub fn reset(&mut self) {
        self.delay_left.clear();
        self.delay_right.clear();
        self.lfo.reset();
    }
}

// ── Flanger ─────────────────────────────────────────────────────────

/// Flanger parameters.
#[derive(Debug, Clone, Copy)]
pub struct FlangerParams {
    pub rate_hz: f64,    // LFO rate: 0.1–10 Hz
    pub depth: f64,      // 0–1
    pub delay_ms: f64,   // Center delay: 0.5–10ms
    pub feedback: f64,   // -0.95 to +0.95 (negative = jet-plane effect)
    pub wet: f64,        // 0–1
}

impl Default for FlangerParams {
    fn default() -> Self {
        Self {
            rate_hz: 0.5,
            depth: 0.7,
            delay_ms: 3.0,
            feedback: 0.7,
            wet: 0.5,
        }
    }
}

/// Stereo flanger effect.
#[derive(Debug)]
pub struct Flanger {
    params: FlangerParams,
    lfo: Lfo,
    delay_left: DelayLine,
    delay_right: DelayLine,
    center_delay_samples: f64,
    depth_samples: f64,
    sample_rate: f64,
}

impl Flanger {
    pub fn new(params: FlangerParams, sample_rate: f64) -> Self {
        let max_delay = ((params.delay_ms + 15.0) * sample_rate / 1000.0) as usize;
        let center = params.delay_ms * sample_rate / 1000.0;
        let depth = params.depth * center;

        Self {
            params,
            lfo: Lfo::new(params.rate_hz, LfoWaveform::Sine, sample_rate),
            delay_left: DelayLine::new(max_delay + 64),
            delay_right: DelayLine::new(max_delay + 64),
            center_delay_samples: center,
            depth_samples: depth,
            sample_rate,
        }
    }

    pub fn set_params(&mut self, params: FlangerParams) {
        self.lfo.set_rate(params.rate_hz);
        self.center_delay_samples = params.delay_ms * self.sample_rate / 1000.0;
        self.depth_samples = params.depth * self.center_delay_samples;
        self.params = params;
    }

    pub fn process_stereo(&mut self, left: &mut [f32], right: &mut [f32]) {
        let len = left.len().min(right.len());
        let wet = self.params.wet as f32;
        let fb = self.params.feedback.clamp(-0.95, 0.95) as f32;

        for i in 0..len {
            // Stereo: invert LFO for right channel for wider image
            let (lfo_l, lfo_r) = self.lfo.next_with_offset(0.5); // 180° offset

            let delay_l = (self.center_delay_samples + lfo_l * self.depth_samples).max(1.0);
            let delay_r = (self.center_delay_samples + lfo_r * self.depth_samples).max(1.0);

            let wet_l = self.delay_left.read_cubic(delay_l);
            let wet_r = self.delay_right.read_cubic(delay_r);

            self.delay_left.push(left[i] + wet_l * fb + ANTI_DENORMAL as f32);
            self.delay_right.push(right[i] + wet_r * fb + ANTI_DENORMAL as f32);

            left[i] = left[i] * (1.0 - wet) + wet_l * wet;
            right[i] = right[i] * (1.0 - wet) + wet_r * wet;
        }
    }

    pub fn reset(&mut self) {
        self.delay_left.clear();
        self.delay_right.clear();
        self.lfo.reset();
    }
}

// ── Phaser ──────────────────────────────────────────────────────────

/// Phaser parameters.
#[derive(Debug, Clone, Copy)]
pub struct PhaserParams {
    pub rate_hz: f64,        // LFO rate: 0.1–5 Hz
    pub depth: f64,          // 0–1 (sweep range in octaves)
    pub stages: usize,       // 2, 4, 6, 8, 10, 12 (even only)
    pub feedback: f64,       // -0.95 to +0.95
    pub base_freq: f64,      // Center frequency: 100–8000 Hz
    pub wet: f64,            // 0–1
}

impl Default for PhaserParams {
    fn default() -> Self {
        Self {
            rate_hz: 0.5,
            depth: 0.7,
            stages: 4,
            feedback: 0.5,
            base_freq: 1000.0,
            wet: 0.5,
        }
    }
}

/// Stereo phaser using cascaded allpass filters.
///
/// The LFO modulates the center frequency of all allpass stages,
/// creating moving notches in the frequency response.
#[derive(Debug)]
pub struct Phaser {
    params: PhaserParams,
    lfo: Lfo,
    // Allpass stages (left and right channels)
    stages_left: Vec<BiquadMono>,
    stages_right: Vec<BiquadMono>,
    feedback_l: f64,
    feedback_r: f64,
    sample_rate: f64,
}

impl Phaser {
    pub fn new(params: PhaserParams, sample_rate: f64) -> Self {
        let num_stages = (params.stages / 2 * 2).clamp(2, 12); // ensure even, 2..12
        let coeffs = BiquadCoeffs::new(
            FilterType::Allpass,
            params.base_freq,
            0.707,
            0.0,
            sample_rate,
        );

        Self {
            params,
            lfo: Lfo::new(params.rate_hz, LfoWaveform::Sine, sample_rate),
            stages_left: (0..num_stages).map(|_| BiquadMono::new(coeffs)).collect(),
            stages_right: (0..num_stages).map(|_| BiquadMono::new(coeffs)).collect(),
            feedback_l: 0.0,
            feedback_r: 0.0,
            sample_rate,
        }
    }

    pub fn set_params(&mut self, params: PhaserParams) {
        self.lfo.set_rate(params.rate_hz);
        self.params = params;
    }

    pub fn process_stereo(&mut self, left: &mut [f32], right: &mut [f32]) {
        let len = left.len().min(right.len());
        let wet = self.params.wet as f32;
        let fb = self.params.feedback.clamp(-0.95, 0.95);

        for i in 0..len {
            let lfo_val = self.lfo.next();

            // Modulate allpass frequency: base_freq * 2^(lfo * depth * octaves)
            let octave_range = 3.0; // sweep 3 octaves
            let mod_freq = self.params.base_freq
                * 2.0_f64.powf(lfo_val * self.params.depth * octave_range);
            let mod_freq = mod_freq.clamp(20.0, 20000.0);

            let coeffs = BiquadCoeffs::new(
                FilterType::Allpass,
                mod_freq,
                0.707,
                0.0,
                self.sample_rate,
            );

            // Update all stages with new frequency
            for stage in &mut self.stages_left {
                stage.set_coeffs(coeffs);
            }
            for stage in &mut self.stages_right {
                stage.set_coeffs(coeffs);
            }

            // Process left channel through allpass cascade
            let mut ap_l = left[i] as f64 + self.feedback_l * fb;
            for stage in &mut self.stages_left {
                ap_l = stage.process_sample(ap_l as f32) as f64;
            }
            self.feedback_l = ap_l + ANTI_DENORMAL;

            // Process right channel
            let mut ap_r = right[i] as f64 + self.feedback_r * fb;
            for stage in &mut self.stages_right {
                ap_r = stage.process_sample(ap_r as f32) as f64;
            }
            self.feedback_r = ap_r + ANTI_DENORMAL;

            // Mix
            left[i] = left[i] * (1.0 - wet) + ap_l as f32 * wet;
            right[i] = right[i] * (1.0 - wet) + ap_r as f32 * wet;
        }
    }

    pub fn reset(&mut self) {
        for stage in &mut self.stages_left {
            stage.reset();
        }
        for stage in &mut self.stages_right {
            stage.reset();
        }
        self.feedback_l = 0.0;
        self.feedback_r = 0.0;
        self.lfo.reset();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SR: f64 = 48000.0;

    #[test]
    fn chorus_adds_width() {
        let mut chorus = Chorus::new(ChorusParams::default(), SR);

        // Process a constant signal
        let mut left = vec![0.5f32; 4800];
        let mut right = vec![0.5f32; 4800];
        chorus.process_stereo(&mut left, &mut right);

        // Output should differ from input (modulation applied)
        let diff: f32 = left.iter().map(|&s| (s - 0.5).abs()).sum::<f32>() / 4800.0;
        assert!(diff > 0.001, "Chorus should modify signal: avg diff = {diff}");
    }

    #[test]
    fn chorus_dry_passthrough() {
        let params = ChorusParams {
            wet: 0.0,
            ..ChorusParams::default()
        };
        let mut chorus = Chorus::new(params, SR);

        let mut left = vec![0.7f32; 100];
        let mut right = vec![0.7f32; 100];
        chorus.process_stereo(&mut left, &mut right);

        assert!(
            (left[99] - 0.7).abs() < 0.001,
            "Dry chorus should pass through: {}",
            left[99]
        );
    }

    #[test]
    fn flanger_comb_effect() {
        let mut flanger = Flanger::new(FlangerParams::default(), SR);

        // Send a broadband signal (impulse train)
        let mut left = vec![0.0f32; 4800];
        let mut right = vec![0.0f32; 4800];
        for i in (0..4800).step_by(100) {
            left[i] = 1.0;
            right[i] = 1.0;
        }

        flanger.process_stereo(&mut left, &mut right);

        // Flanger should produce comb-filtered output
        let energy: f32 = left.iter().map(|&s| s * s).sum();
        assert!(energy > 0.1, "Flanger should produce output: energy = {energy}");
    }

    #[test]
    fn flanger_negative_feedback() {
        let params = FlangerParams {
            feedback: -0.8,
            wet: 1.0,
            ..FlangerParams::default()
        };
        let mut flanger = Flanger::new(params, SR);

        let mut left = vec![0.0f32; 2400];
        let mut right = vec![0.0f32; 2400];
        left[0] = 1.0;
        right[0] = 1.0;

        flanger.process_stereo(&mut left, &mut right);

        // Should produce output without blowing up
        let max = left.iter().map(|s| s.abs()).fold(0.0f32, f32::max);
        assert!(max < 10.0, "Negative feedback flanger should be stable: max = {max}");
    }

    #[test]
    fn phaser_produces_notches() {
        let mut phaser = Phaser::new(PhaserParams::default(), SR);

        // White-ish noise (alternating values)
        let mut left: Vec<f32> = (0..4800)
            .map(|i| if i % 2 == 0 { 0.5 } else { -0.5 })
            .collect();
        let mut right = left.clone();

        phaser.process_stereo(&mut left, &mut right);

        // Phaser should modify the signal
        let original_energy: f32 = (0..4800)
            .map(|i| {
                let v = if i % 2 == 0 { 0.5f32 } else { -0.5 };
                v * v
            })
            .sum();
        let processed_energy: f32 = left.iter().map(|&s| s * s).sum();

        assert!(
            (processed_energy - original_energy).abs() > 0.1,
            "Phaser should change spectral content: orig={original_energy}, proc={processed_energy}"
        );
    }

    #[test]
    fn phaser_dry_passthrough() {
        let params = PhaserParams {
            wet: 0.0,
            ..PhaserParams::default()
        };
        let mut phaser = Phaser::new(params, SR);

        let mut left = vec![0.3f32; 100];
        let mut right = vec![0.3f32; 100];
        phaser.process_stereo(&mut left, &mut right);

        assert!(
            (left[99] - 0.3).abs() < 0.001,
            "Dry phaser: {}",
            left[99]
        );
    }
}
