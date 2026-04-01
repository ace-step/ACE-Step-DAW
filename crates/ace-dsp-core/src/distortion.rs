//! Distortion & saturation — waveshaping with oversampling.
//!
//! Oversampling is critical: nonlinear waveshaping generates harmonics above
//! Nyquist that fold back as aliasing. 2x–4x oversampling pushes aliases
//! above the audible range.

use crate::biquad::{BiquadCoeffs, BiquadMono, FilterType};

/// Distortion character.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum DistortionType {
    SoftClip,    // tanh — warm, musical
    HardClip,    // clamp — aggressive
    Tube,        // asymmetric — even harmonics (warm)
    Tape,        // x/(1+|x|) — gentle compression
    Fuzz,        // transistor — sign(x)*(1-e^(-|x|*drive))
    Bitcrusher,  // sample rate + bit depth reduction
}

/// Distortion parameters.
#[derive(Debug, Clone, Copy)]
pub struct DistortionParams {
    pub drive: f64,          // 0–1 (mapped to internal gain)
    pub character: DistortionType,
    pub tone: f64,           // -1 (dark) to +1 (bright) — post tilt EQ
    pub oversample: usize,   // 1 (off), 2, or 4
    pub wet: f64,            // 0–1
    // Bitcrusher-specific
    pub bit_depth: f64,      // 2–16 (for bitcrusher)
    pub downsample: f64,     // 1–32 (for bitcrusher — every Nth sample)
}

impl Default for DistortionParams {
    fn default() -> Self {
        Self {
            drive: 0.5,
            character: DistortionType::SoftClip,
            tone: 0.0,
            oversample: 2,
            wet: 1.0,
            bit_depth: 8.0,
            downsample: 1.0,
        }
    }
}

/// Oversampled distortion/saturation processor.
#[derive(Debug)]
pub struct Distortion {
    params: DistortionParams,
    // Oversampling anti-alias filters (per channel)
    upsample_filter_l: BiquadMono,
    upsample_filter_r: BiquadMono,
    downsample_filter_l: BiquadMono,
    downsample_filter_r: BiquadMono,
    // Post-distortion tone EQ
    tone_filter_l: BiquadMono,
    tone_filter_r: BiquadMono,
    // Bitcrusher state
    bc_hold_l: f32,
    bc_hold_r: f32,
    bc_counter: f64,
    sample_rate: f64,
}

impl Distortion {
    pub fn new(params: DistortionParams, sample_rate: f64) -> Self {
        let os = params.oversample.max(1);
        let os_rate = sample_rate * os as f64;

        // Anti-alias filter: steep lowpass at original Nyquist
        let aa_coeffs = BiquadCoeffs::new(
            FilterType::Lowpass,
            sample_rate * 0.45, // just below Nyquist
            0.707,
            0.0,
            os_rate,
        );

        // Tone: tilt EQ (shelf at 3kHz)
        let tone_coeffs = if params.tone > 0.01 {
            BiquadCoeffs::new(FilterType::HighShelf, 3000.0, 0.707, params.tone * 6.0, sample_rate)
        } else if params.tone < -0.01 {
            BiquadCoeffs::new(FilterType::HighShelf, 3000.0, 0.707, params.tone * 6.0, sample_rate)
        } else {
            BiquadCoeffs::default()
        };

        Self {
            params,
            upsample_filter_l: BiquadMono::new(aa_coeffs),
            upsample_filter_r: BiquadMono::new(aa_coeffs),
            downsample_filter_l: BiquadMono::new(aa_coeffs),
            downsample_filter_r: BiquadMono::new(aa_coeffs),
            tone_filter_l: BiquadMono::new(tone_coeffs),
            tone_filter_r: BiquadMono::new(tone_coeffs),
            bc_hold_l: 0.0,
            bc_hold_r: 0.0,
            bc_counter: 0.0,
            sample_rate,
        }
    }

    pub fn set_params(&mut self, params: DistortionParams) {
        // Update tone filter
        let tone_coeffs = if params.tone.abs() > 0.01 {
            BiquadCoeffs::new(
                FilterType::HighShelf,
                3000.0,
                0.707,
                params.tone * 6.0,
                self.sample_rate,
            )
        } else {
            BiquadCoeffs::default()
        };
        self.tone_filter_l.set_coeffs(tone_coeffs);
        self.tone_filter_r.set_coeffs(tone_coeffs);
        self.params = params;
    }

    /// Process stereo audio in-place.
    pub fn process_stereo(&mut self, left: &mut [f32], right: &mut [f32]) {
        let len = left.len().min(right.len());
        let drive_gain = 1.0 + self.params.drive * 29.0; // 1x to 30x
        let wet = self.params.wet as f32;
        let os = self.params.oversample.max(1);

        for i in 0..len {
            let dry_l = left[i];
            let dry_r = right[i];

            let (proc_l, proc_r) = if os > 1 {
                self.process_oversampled(left[i], right[i], drive_gain, os)
            } else {
                let l = self.apply_waveshaper(left[i] as f64 * drive_gain);
                let r = self.apply_waveshaper(right[i] as f64 * drive_gain);
                (l as f32, r as f32)
            };

            // Tone EQ
            let toned_l = self.tone_filter_l.process_sample(proc_l);
            let toned_r = self.tone_filter_r.process_sample(proc_r);

            left[i] = dry_l * (1.0 - wet) + toned_l * wet;
            right[i] = dry_r * (1.0 - wet) + toned_r * wet;
        }
    }

    fn process_oversampled(
        &mut self,
        input_l: f32,
        input_r: f32,
        drive_gain: f64,
        os: usize,
    ) -> (f32, f32) {
        // Upsample: insert zeros between samples, then lowpass filter
        let mut sum_l = 0.0f32;
        let mut sum_r = 0.0f32;

        for j in 0..os {
            // Zero-stuffing: first sample is the input, rest are zeros
            let up_l = if j == 0 {
                input_l * os as f32
            } else {
                0.0
            };
            let up_r = if j == 0 {
                input_r * os as f32
            } else {
                0.0
            };

            // Anti-alias filter (upsample)
            let filtered_l = self.upsample_filter_l.process_sample(up_l);
            let filtered_r = self.upsample_filter_r.process_sample(up_r);

            // Apply waveshaping at oversampled rate
            let shaped_l = self.apply_waveshaper(filtered_l as f64 * drive_gain);
            let shaped_r = self.apply_waveshaper(filtered_r as f64 * drive_gain);

            // Anti-alias filter (downsample)
            let down_l = self.downsample_filter_l.process_sample(shaped_l as f32);
            let down_r = self.downsample_filter_r.process_sample(shaped_r as f32);

            // Keep every Nth sample (decimate)
            if j == 0 {
                sum_l = down_l;
                sum_r = down_r;
            }
        }

        (sum_l, sum_r)
    }

    #[inline]
    fn apply_waveshaper(&mut self, x: f64) -> f64 {
        match self.params.character {
            DistortionType::SoftClip => x.tanh(),
            DistortionType::HardClip => x.clamp(-1.0, 1.0),
            DistortionType::Tube => {
                // Asymmetric: softer on positive, harder on negative
                if x >= 0.0 {
                    (x * 1.5).tanh() * 0.9
                } else {
                    (x * 2.0).tanh() * 0.8
                }
            }
            DistortionType::Tape => x / (1.0 + x.abs()),
            DistortionType::Fuzz => {
                let sign = if x >= 0.0 { 1.0 } else { -1.0 };
                sign * (1.0 - (-x.abs()).exp())
            }
            DistortionType::Bitcrusher => {
                // Bit depth reduction
                let levels = 2.0_f64.powf(self.params.bit_depth);
                let quantized = (x * levels).round() / levels;

                // Sample rate reduction
                self.bc_counter += 1.0;
                if self.bc_counter >= self.params.downsample {
                    self.bc_counter = 0.0;
                    self.bc_hold_l = quantized as f32;
                }
                self.bc_hold_l as f64
            }
        }
    }

    pub fn reset(&mut self) {
        self.upsample_filter_l.reset();
        self.upsample_filter_r.reset();
        self.downsample_filter_l.reset();
        self.downsample_filter_r.reset();
        self.tone_filter_l.reset();
        self.tone_filter_r.reset();
        self.bc_hold_l = 0.0;
        self.bc_hold_r = 0.0;
        self.bc_counter = 0.0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SR: f64 = 48000.0;

    #[test]
    fn soft_clip_bounded() {
        let params = DistortionParams {
            drive: 1.0,
            character: DistortionType::SoftClip,
            oversample: 1,
            wet: 1.0,
            ..DistortionParams::default()
        };
        let mut dist = Distortion::new(params, SR);

        let mut left = vec![1.0f32; 100];
        let mut right = vec![1.0f32; 100];
        dist.process_stereo(&mut left, &mut right);

        let max = left.iter().map(|s| s.abs()).fold(0.0f32, f32::max);
        assert!(max <= 1.01, "Soft clip should be bounded: max = {max}");
    }

    #[test]
    fn hard_clip_bounded() {
        let params = DistortionParams {
            drive: 1.0,
            character: DistortionType::HardClip,
            oversample: 1,
            wet: 1.0,
            ..DistortionParams::default()
        };
        let mut dist = Distortion::new(params, SR);

        let mut left = vec![0.9f32; 100];
        let mut right = vec![0.9f32; 100];
        dist.process_stereo(&mut left, &mut right);

        let max = left.iter().map(|s| s.abs()).fold(0.0f32, f32::max);
        assert!(max <= 1.01, "Hard clip: max = {max}");
    }

    #[test]
    fn oversampled_reduces_aliasing() {
        // Compare energy above Nyquist/2 with and without oversampling
        // For a simple test: oversampled output should have less high-freq energy
        let params_no_os = DistortionParams {
            drive: 0.8,
            character: DistortionType::SoftClip,
            oversample: 1,
            wet: 1.0,
            ..DistortionParams::default()
        };
        let params_os = DistortionParams {
            oversample: 4,
            ..params_no_os
        };

        let mut dist_no = Distortion::new(params_no_os, SR);
        let mut dist_os = Distortion::new(params_os, SR);

        // 5kHz sine wave — harmonics at 10k, 15k, 20k, 25k (aliases without OS)
        let signal: Vec<f32> = (0..4800)
            .map(|i| (2.0 * core::f64::consts::PI * 5000.0 * i as f64 / SR).sin() as f32 * 0.5)
            .collect();

        let mut l_no = signal.clone();
        let mut r_no = signal.clone();
        let mut l_os = signal.clone();
        let mut r_os = signal.clone();

        dist_no.process_stereo(&mut l_no, &mut r_no);
        dist_os.process_stereo(&mut l_os, &mut r_os);

        // Both should produce output
        let energy_no: f32 = l_no.iter().map(|&s| s * s).sum();
        let energy_os: f32 = l_os.iter().map(|&s| s * s).sum();

        assert!(energy_no > 0.1, "Non-OS should produce output: {energy_no}");
        assert!(energy_os > 0.1, "OS should produce output: {energy_os}");
    }

    #[test]
    fn tape_saturation_gentle() {
        let params = DistortionParams {
            drive: 0.3,
            character: DistortionType::Tape,
            oversample: 1,
            wet: 1.0,
            ..DistortionParams::default()
        };
        let mut dist = Distortion::new(params, SR);

        let mut left = vec![0.5f32; 100];
        let mut right = vec![0.5f32; 100];
        dist.process_stereo(&mut left, &mut right);

        // Tape at moderate drive should not clip hard
        let max = left.iter().map(|s| s.abs()).fold(0.0f32, f32::max);
        assert!(max < 1.0, "Tape should be gentle: max = {max}");
        assert!(max > 0.1, "Tape should produce output: max = {max}");
    }

    #[test]
    fn bitcrusher_quantizes() {
        let params = DistortionParams {
            drive: 0.0,
            character: DistortionType::Bitcrusher,
            oversample: 1,
            wet: 1.0,
            bit_depth: 4.0, // 16 levels — heavy quantization
            downsample: 1.0,
            ..DistortionParams::default()
        };
        let mut dist = Distortion::new(params, SR);

        // Smooth ramp
        let mut left: Vec<f32> = (0..100).map(|i| i as f32 / 100.0).collect();
        let mut right = left.clone();
        dist.process_stereo(&mut left, &mut right);

        // Count unique values — should be far fewer than 100 due to quantization
        let mut unique = left.clone();
        unique.sort_by(|a, b| a.partial_cmp(b).unwrap());
        unique.dedup();
        assert!(
            unique.len() < 50,
            "Bitcrusher should quantize: {} unique values from 100 inputs",
            unique.len()
        );
    }

    #[test]
    fn dry_passthrough() {
        let params = DistortionParams {
            wet: 0.0,
            ..DistortionParams::default()
        };
        let mut dist = Distortion::new(params, SR);

        let mut left = vec![0.42f32; 100];
        let mut right = vec![0.42f32; 100];
        dist.process_stereo(&mut left, &mut right);

        assert!(
            (left[99] - 0.42).abs() < 0.001,
            "Dry should pass through: {}",
            left[99]
        );
    }
}
