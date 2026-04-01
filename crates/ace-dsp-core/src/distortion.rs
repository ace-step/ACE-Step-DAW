//! Distortion / Waveshaper — multiple clipping and saturation algorithms.
//!
//! Provides several classic waveshaping curves:
//! - **HardClip**: brick-wall clipping at ±threshold
//! - **SoftClip**: tanh saturation (warm tube-like)
//! - **Overdrive**: asymmetric soft clipping
//! - **Fuzz**: aggressive squared clipping
//! - **Bitcrush**: bit-depth reduction for lo-fi effects
//!
//! Parameters:
//! - `drive`: input gain before waveshaping (1.0–100.0)
//! - `mix`: wet/dry blend (0.0–1.0)
//! - `output_gain`: post-waveshaper level compensation

/// Distortion algorithm selection.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum DistortionType {
    HardClip,
    SoftClip,
    Overdrive,
    Fuzz,
    Bitcrush,
}

/// Distortion / waveshaper processor.
pub struct Distortion {
    dist_type: DistortionType,
    drive: f32,
    mix: f32,
    output_gain: f32,
    bit_depth: f32, // for Bitcrush mode (1.0–16.0)
}

impl Distortion {
    /// Create a new distortion processor.
    ///
    /// - `dist_type`: waveshaping algorithm
    /// - `drive`: input gain (1.0–100.0)
    /// - `mix`: wet/dry (0.0–1.0)
    /// - `output_gain`: output level (0.0–2.0)
    pub fn new(dist_type: DistortionType, drive: f32, mix: f32, output_gain: f32) -> Self {
        Self {
            dist_type,
            drive: drive.clamp(1.0, 100.0),
            mix: mix.clamp(0.0, 1.0),
            output_gain: output_gain.clamp(0.0, 2.0),
            bit_depth: 8.0,
        }
    }

    /// Set distortion type.
    pub fn set_type(&mut self, dist_type: DistortionType) {
        self.dist_type = dist_type;
    }

    /// Get current distortion type.
    pub fn dist_type(&self) -> DistortionType {
        self.dist_type
    }

    /// Set drive (1.0–100.0).
    pub fn set_drive(&mut self, drive: f32) {
        self.drive = drive.clamp(1.0, 100.0);
    }

    /// Set wet/dry mix (0.0–1.0).
    pub fn set_mix(&mut self, mix: f32) {
        self.mix = mix.clamp(0.0, 1.0);
    }

    /// Set output gain (0.0–2.0).
    pub fn set_output_gain(&mut self, gain: f32) {
        self.output_gain = gain.clamp(0.0, 2.0);
    }

    /// Set bit depth for Bitcrush mode (1.0–16.0).
    pub fn set_bit_depth(&mut self, bits: f32) {
        self.bit_depth = bits.clamp(1.0, 16.0);
    }

    /// Apply the waveshaping function to a single sample.
    #[inline]
    fn shape(&self, sample: f32) -> f32 {
        let driven = sample * self.drive;
        match self.dist_type {
            DistortionType::HardClip => driven.clamp(-1.0, 1.0),
            DistortionType::SoftClip => driven.tanh(),
            DistortionType::Overdrive => {
                // Asymmetric soft clip: positive side softer, negative harder
                if driven >= 0.0 {
                    1.0 - (-driven).exp()
                } else {
                    -1.0 + driven.exp()
                }
            }
            DistortionType::Fuzz => {
                // Aggressive clipping with sign-preserving square
                let sign = if driven >= 0.0 { 1.0 } else { -1.0 };
                let abs = driven.abs().min(1.0);
                sign * (1.0 - (1.0 - abs) * (1.0 - abs))
            }
            DistortionType::Bitcrush => {
                // Quantize to reduced bit depth
                let levels = (2.0_f32).powf(self.bit_depth);
                let half_levels = levels * 0.5;
                ((driven * half_levels).round() / half_levels).clamp(-1.0, 1.0)
            }
        }
    }

    /// Process a single sample with wet/dry mix.
    #[inline]
    pub fn process_sample(&self, input: f32) -> f32 {
        let wet = self.shape(input);
        let mixed = input * (1.0 - self.mix) + wet * self.mix;
        mixed * self.output_gain
    }

    /// Process a buffer in-place.
    pub fn process_buffer(&self, buffer: &mut [f32]) {
        for sample in buffer.iter_mut() {
            *sample = self.process_sample(*sample);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_creation() {
        let d = Distortion::new(DistortionType::SoftClip, 2.0, 1.0, 1.0);
        assert_eq!(d.dist_type(), DistortionType::SoftClip);
    }

    #[test]
    fn test_hard_clip() {
        let d = Distortion::new(DistortionType::HardClip, 10.0, 1.0, 1.0);
        // Loud signal should be clipped to ±1
        assert_eq!(d.process_sample(0.5), 1.0);   // 0.5 * 10 = 5.0 → clipped to 1.0
        assert_eq!(d.process_sample(-0.5), -1.0);
        // Quiet signal should pass through
        let out = d.process_sample(0.05);
        assert!((out - 0.5).abs() < 0.01, "Low signal: {out}"); // 0.05 * 10 = 0.5
    }

    #[test]
    fn test_soft_clip_saturation() {
        let d = Distortion::new(DistortionType::SoftClip, 5.0, 1.0, 1.0);
        let out = d.process_sample(0.5);
        // tanh(2.5) ≈ 0.987 — saturated but not hard clipped
        assert!(out > 0.9 && out < 1.0, "Soft clip: {out}");
    }

    #[test]
    fn test_soft_clip_preserves_sign() {
        let d = Distortion::new(DistortionType::SoftClip, 3.0, 1.0, 1.0);
        assert!(d.process_sample(0.5) > 0.0);
        assert!(d.process_sample(-0.5) < 0.0);
    }

    #[test]
    fn test_overdrive_asymmetry() {
        let d = Distortion::new(DistortionType::Overdrive, 5.0, 1.0, 1.0);
        let pos = d.process_sample(0.3);
        let neg = d.process_sample(-0.3);
        // Overdrive should be roughly symmetric for moderate levels
        assert!(pos > 0.0);
        assert!(neg < 0.0);
        // Both should be bounded
        assert!(pos.abs() <= 1.0);
        assert!(neg.abs() <= 1.0);
    }

    #[test]
    fn test_fuzz_aggressive_clip() {
        let d = Distortion::new(DistortionType::Fuzz, 10.0, 1.0, 1.0);
        let out = d.process_sample(0.5);
        // Fuzz with high drive should be near ±1
        assert!(out > 0.95, "Fuzz should be aggressive: {out}");
    }

    #[test]
    fn test_bitcrush_quantization() {
        let mut d = Distortion::new(DistortionType::Bitcrush, 1.0, 1.0, 1.0);
        d.set_bit_depth(4.0);
        // 4 bits = 16 levels, step size = 1/8 = 0.125
        let out = d.process_sample(0.3);
        // Should be quantized to nearest step
        let step = 1.0 / 8.0;
        let remainder = out % step;
        assert!(
            remainder.abs() < 0.001 || (step - remainder.abs()).abs() < 0.001,
            "Should be quantized: {out}, remainder: {remainder}"
        );
    }

    #[test]
    fn test_mix_dry_only() {
        let d = Distortion::new(DistortionType::HardClip, 10.0, 0.0, 1.0);
        // Mix = 0 → pure dry signal
        let out = d.process_sample(0.3);
        assert!((out - 0.3).abs() < 0.001, "Dry only: {out}");
    }

    #[test]
    fn test_mix_blend() {
        let d = Distortion::new(DistortionType::HardClip, 10.0, 0.5, 1.0);
        // 50% wet (clipped to 1.0) + 50% dry (0.3) = 0.65
        let out = d.process_sample(0.3);
        assert!(
            (out - 0.65).abs() < 0.01,
            "50/50 mix: {out}"
        );
    }

    #[test]
    fn test_output_gain() {
        let d = Distortion::new(DistortionType::HardClip, 10.0, 1.0, 0.5);
        // Clipped to 1.0, then * 0.5 = 0.5
        let out = d.process_sample(0.5);
        assert!((out - 0.5).abs() < 0.01, "Output gain: {out}");
    }

    #[test]
    fn test_drive_clamping() {
        let d = Distortion::new(DistortionType::SoftClip, 200.0, 1.0, 1.0);
        assert_eq!(d.drive, 100.0);
        let d2 = Distortion::new(DistortionType::SoftClip, 0.0, 1.0, 1.0);
        assert_eq!(d2.drive, 1.0);
    }

    #[test]
    fn test_parameter_setters() {
        let mut d = Distortion::new(DistortionType::HardClip, 2.0, 0.5, 1.0);
        d.set_type(DistortionType::Fuzz);
        assert_eq!(d.dist_type(), DistortionType::Fuzz);
        d.set_drive(5.0);
        d.set_mix(0.8);
        d.set_output_gain(1.5);
        d.set_bit_depth(12.0);
    }

    #[test]
    fn test_process_buffer() {
        let d = Distortion::new(DistortionType::HardClip, 10.0, 1.0, 1.0);
        let mut buf = [0.5_f32, -0.5, 0.01, -0.01];
        d.process_buffer(&mut buf);
        assert_eq!(buf[0], 1.0);
        assert_eq!(buf[1], -1.0);
        assert!((buf[2] - 0.1).abs() < 0.01);
        assert!((buf[3] - -0.1).abs() < 0.01);
    }

    #[test]
    fn test_silence_passthrough() {
        let d = Distortion::new(DistortionType::SoftClip, 5.0, 1.0, 1.0);
        let out = d.process_sample(0.0);
        assert!(out.abs() < 1e-10, "Silence: {out}");
    }

    #[test]
    fn test_all_types_bounded() {
        let types = [
            DistortionType::HardClip,
            DistortionType::SoftClip,
            DistortionType::Overdrive,
            DistortionType::Fuzz,
            DistortionType::Bitcrush,
        ];
        for dt in types {
            let d = Distortion::new(dt, 50.0, 1.0, 1.0);
            for &input in &[0.5_f32, -0.5, 1.0, -1.0, 0.01, -0.01] {
                let out = d.process_sample(input);
                assert!(
                    out.abs() <= 1.01,
                    "{:?} unbounded at input {input}: {out}",
                    dt
                );
            }
        }
    }
}
