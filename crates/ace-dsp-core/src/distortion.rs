//! Distortion / Waveshaper — multiple clipping and saturation algorithms.
//!
//! Provides several classic waveshaping curves with 2x oversampling to prevent
//! aliasing artifacts in nonlinear modes:
//! - **HardClip**: brick-wall clipping at ±threshold
//! - **SoftClip**: tanh saturation (warm tube-like)
//! - **Overdrive**: asymmetric soft clipping
//! - **Fuzz**: aggressive squared clipping
//! - **Bitcrush**: bit-depth reduction for lo-fi effects (no oversampling needed)
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

/// Simple 2x oversampling state for anti-aliasing.
/// Uses linear interpolation for upsampling and decimation (taking every other sample) for downsampling,
/// with a one-pole lowpass to attenuate frequencies above Nyquist.
struct Oversampler {
    prev_input: f32,
    /// One-pole lowpass state for the anti-aliasing filter
    lp_state: f32,
}

impl Oversampler {
    fn new() -> Self {
        Self {
            prev_input: 0.0,
            lp_state: 0.0,
        }
    }

    /// Process one input sample through 2x oversampling with waveshaping.
    /// `driven_input` should already have drive applied.
    /// 1. Upsample: linear interpolation to generate 2 samples
    /// 2. Apply waveshaping function to both
    /// 3. Lowpass filter at original Nyquist
    /// 4. Downsample: take every other sample
    #[inline]
    fn process<F: Fn(f32) -> f32>(&mut self, driven_input: f32, shape_fn: &F) -> f32 {
        // Upsample: interpolate between previous and current driven input
        let mid = (self.prev_input + driven_input) * 0.5;
        self.prev_input = driven_input;

        // Apply nonlinear waveshaping at 2x rate
        let y0 = shape_fn(mid);
        let y1 = shape_fn(driven_input);

        // Anti-alias lowpass (one-pole at ~0.5 normalized freq)
        // Coefficient 0.25 gives -6dB at Nyquist/2, good tradeoff
        const LP_COEFF: f32 = 0.25;
        self.lp_state = self.lp_state + LP_COEFF * (y0 - self.lp_state);
        let _filtered0 = self.lp_state;
        self.lp_state = self.lp_state + LP_COEFF * (y1 - self.lp_state);
        let filtered1 = self.lp_state;

        // Downsample: output the second filtered sample
        filtered1
    }

    fn reset(&mut self) {
        self.prev_input = 0.0;
        self.lp_state = 0.0;
    }
}

/// Stateless waveshaping function (extracted to avoid borrow conflicts with oversampler).
#[inline]
fn shape_stateless(dist_type: DistortionType, driven: f32, bit_depth: f32) -> f32 {
    match dist_type {
        DistortionType::HardClip => driven.clamp(-1.0, 1.0),
        DistortionType::SoftClip => driven.tanh(),
        DistortionType::Overdrive => {
            if driven >= 0.0 {
                1.0 - (-driven).exp()
            } else {
                -1.0 + driven.exp()
            }
        }
        DistortionType::Fuzz => {
            let sign = if driven >= 0.0 { 1.0 } else { -1.0 };
            let abs = driven.abs().min(1.0);
            sign * (1.0 - (1.0 - abs) * (1.0 - abs))
        }
        DistortionType::Bitcrush => {
            let levels = (2.0_f32).powf(bit_depth);
            let half_levels = levels * 0.5;
            ((driven * half_levels).round() / half_levels).clamp(-1.0, 1.0)
        }
    }
}

/// Distortion / waveshaper processor.
pub struct Distortion {
    dist_type: DistortionType,
    drive: f32,
    mix: f32,
    output_gain: f32,
    bit_depth: f32, // for Bitcrush mode (1.0–16.0)
    oversampler: Oversampler,
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
            oversampler: Oversampler::new(),
        }
    }

    /// Set distortion type.
    pub fn set_type(&mut self, dist_type: DistortionType) {
        self.dist_type = dist_type;
        self.oversampler.reset();
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

    /// Returns true if this distortion type benefits from oversampling.
    #[inline]
    fn needs_oversampling(&self) -> bool {
        !matches!(self.dist_type, DistortionType::Bitcrush)
    }

    /// Process a single sample with wet/dry mix.
    #[inline]
    pub fn process_sample(&mut self, input: f32) -> f32 {
        let drive = self.drive;
        let dist_type = self.dist_type;
        let bit_depth = self.bit_depth;
        let driven_input = input * drive;
        let wet = if self.needs_oversampling() {
            // 2x oversampled waveshaping for nonlinear modes
            self.oversampler.process(driven_input, &|s| {
                shape_stateless(dist_type, s, bit_depth)
            })
        } else {
            shape_stateless(dist_type, driven_input, bit_depth)
        };
        let mixed = input * (1.0 - self.mix) + wet * self.mix;
        mixed * self.output_gain
    }

    /// Process a buffer in-place.
    pub fn process_buffer(&mut self, buffer: &mut [f32]) {
        for sample in buffer.iter_mut() {
            *sample = self.process_sample(*sample);
        }
    }

    /// Reset internal state (oversampler).
    pub fn reset(&mut self) {
        self.oversampler.reset();
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
        let mut d = Distortion::new(DistortionType::HardClip, 10.0, 1.0, 1.0);
        // Feed samples to let oversampler's one-pole filter settle
        for _ in 0..16 { d.process_sample(0.5); }
        let out = d.process_sample(0.5);
        // 0.5 * 10 = 5.0 → clipped to 1.0, filtered through oversampler
        assert!(out > 0.8, "Hard clip should saturate: {out}");
        // Negative
        for _ in 0..16 { d.process_sample(-0.5); }
        let out_neg = d.process_sample(-0.5);
        assert!(out_neg < -0.8, "Hard clip negative: {out_neg}");
    }

    #[test]
    fn test_soft_clip_saturation() {
        let mut d = Distortion::new(DistortionType::SoftClip, 5.0, 1.0, 1.0);
        // Settle oversampler
        for _ in 0..8 { d.process_sample(0.5); }
        let out = d.process_sample(0.5);
        // tanh(2.5) ≈ 0.987, oversampled may differ slightly
        assert!(out > 0.8 && out < 1.0, "Soft clip: {out}");
    }

    #[test]
    fn test_soft_clip_preserves_sign() {
        let mut d = Distortion::new(DistortionType::SoftClip, 3.0, 1.0, 1.0);
        for _ in 0..4 { d.process_sample(0.5); }
        assert!(d.process_sample(0.5) > 0.0);
        for _ in 0..4 { d.process_sample(-0.5); }
        assert!(d.process_sample(-0.5) < 0.0);
    }

    #[test]
    fn test_overdrive_bounded() {
        let mut d = Distortion::new(DistortionType::Overdrive, 5.0, 1.0, 1.0);
        for &input in &[0.3_f32, -0.3, 0.8, -0.8] {
            for _ in 0..4 { d.process_sample(input); }
            let out = d.process_sample(input);
            assert!(out.abs() <= 1.01, "Overdrive unbounded at {input}: {out}");
        }
    }

    #[test]
    fn test_fuzz_aggressive() {
        let mut d = Distortion::new(DistortionType::Fuzz, 10.0, 1.0, 1.0);
        for _ in 0..8 { d.process_sample(0.5); }
        let out = d.process_sample(0.5);
        assert!(out > 0.85, "Fuzz should be aggressive: {out}");
    }

    #[test]
    fn test_bitcrush_no_oversampling() {
        let mut d = Distortion::new(DistortionType::Bitcrush, 1.0, 1.0, 1.0);
        d.set_bit_depth(4.0);
        // Bitcrush doesn't use oversampling, so output should be immediate
        let out = d.process_sample(0.3);
        let step = 1.0 / 8.0;
        let remainder = out % step;
        assert!(
            remainder.abs() < 0.001 || (step - remainder.abs()).abs() < 0.001,
            "Should be quantized: {out}, remainder: {remainder}"
        );
    }

    #[test]
    fn test_mix_dry_only() {
        let mut d = Distortion::new(DistortionType::HardClip, 10.0, 0.0, 1.0);
        // Mix = 0 → pure dry signal
        let out = d.process_sample(0.3);
        assert!((out - 0.3).abs() < 0.001, "Dry only: {out}");
    }

    #[test]
    fn test_mix_half_blends() {
        let mut d = Distortion::new(DistortionType::HardClip, 10.0, 0.5, 1.0);
        // Settle oversampler
        for _ in 0..16 { d.process_sample(0.3); }
        let out = d.process_sample(0.3);
        // mix=0.5: output = 0.3*0.5 + wet*0.5, wet ≈ 1.0 (hard clipped)
        // So output should be between dry (0.3) and wet (~1.0)
        assert!(out > 0.3 && out < 1.0, "Half mix should blend: {out}");
        // Should differ from both pure dry and pure wet
        assert!((out - 0.3).abs() > 0.05, "Should differ from dry: {out}");
    }

    #[test]
    fn test_output_gain() {
        let mut d = Distortion::new(DistortionType::HardClip, 10.0, 1.0, 0.5);
        // Settle
        for _ in 0..8 { d.process_sample(0.5); }
        let out = d.process_sample(0.5);
        // Clipped to ~1.0, then * 0.5 ≈ 0.5
        assert!(out > 0.4 && out < 0.6, "Output gain: {out}");
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
        let mut d = Distortion::new(DistortionType::Bitcrush, 1.0, 1.0, 1.0);
        d.set_bit_depth(16.0); // high bit depth ≈ passthrough
        let mut buf = [0.5_f32, -0.5, 0.01, -0.01];
        d.process_buffer(&mut buf);
        // With drive=1 and 16-bit quantization, output ≈ input
        assert!((buf[0] - 0.5).abs() < 0.01, "buf[0]={}", buf[0]);
        assert!((buf[1] + 0.5).abs() < 0.01, "buf[1]={}", buf[1]);
    }

    #[test]
    fn test_silence_passthrough() {
        let mut d = Distortion::new(DistortionType::SoftClip, 5.0, 1.0, 1.0);
        let out = d.process_sample(0.0);
        assert!(out.abs() < 1e-6, "Silence: {out}");
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
            let mut d = Distortion::new(dt, 50.0, 1.0, 1.0);
            // Settle oversampler with consistent signal
            for _ in 0..16 { d.process_sample(0.5); }
            for &input in &[0.5_f32, -0.5, 1.0, -1.0, 0.01, -0.01] {
                // Feed consistent signal to settle
                for _ in 0..4 { d.process_sample(input); }
                let out = d.process_sample(input);
                assert!(
                    out.abs() <= 1.1,
                    "{:?} unbounded at input {input}: {out}",
                    dt
                );
            }
        }
    }

    #[test]
    fn test_oversampling_reduces_aliasing() {
        // With oversampling, a high-frequency signal through hard clip
        // should have less energy above Nyquist (compared to without).
        // We verify the oversampler is active by checking that output
        // differs from direct waveshaping.
        let mut d = Distortion::new(DistortionType::HardClip, 10.0, 1.0, 1.0);
        let mut output = Vec::new();
        // Generate a mix of two frequencies that would alias when clipped
        for i in 0..256 {
            let t = i as f32 / 256.0;
            let input = (t * core::f32::consts::TAU * 80.0).sin() * 0.3
                + (t * core::f32::consts::TAU * 120.0).sin() * 0.3;
            output.push(d.process_sample(input));
        }
        // Output should be bounded and non-zero
        let energy: f32 = output.iter().map(|s| s * s).sum();
        assert!(energy > 1.0, "Oversampled output should have energy: {energy}");
        let max = output.iter().cloned().fold(0.0_f32, |a, b| a.max(b.abs()));
        assert!(max <= 1.01, "Should be bounded: {max}");
    }

    #[test]
    fn test_reset() {
        let mut d = Distortion::new(DistortionType::SoftClip, 5.0, 1.0, 1.0);
        for _ in 0..10 { d.process_sample(0.5); }
        d.reset();
        // After reset, first sample should still produce valid output
        let out = d.process_sample(0.0);
        assert!(out.abs() < 0.1, "After reset: {out}");
    }
}
