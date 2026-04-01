//! Auto-Pan — LFO-modulated stereo panning.
//!
//! Sweeps audio between left and right channels using a low-frequency
//! oscillator. Uses constant-power (equal-power) panning law so the
//! perceived loudness stays constant as the signal moves.
//!
//! Parameters:
//! - `rate_hz`: LFO speed (0.05–20 Hz)
//! - `depth`: panning depth (0.0–1.0, where 1.0 = full L↔R sweep)
//! - `shape`: LFO waveform (Sine, Triangle)

use core::f32::consts::{FRAC_PI_2, TAU};

/// LFO shape for auto-pan.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum PanShape {
    Sine,
    Triangle,
}

/// Auto-pan processor.
///
/// Operates on interleaved stereo buffers [L, R, L, R, ...].
pub struct AutoPan {
    phase: f32,
    phase_inc: f32,
    depth: f32,
    shape: PanShape,
    sample_rate: f32,
}

impl AutoPan {
    /// Create a new auto-pan.
    ///
    /// - `sample_rate`: audio sample rate
    /// - `rate_hz`: LFO rate (0.05–20 Hz)
    /// - `depth`: panning depth (0.0–1.0)
    /// - `shape`: LFO waveform
    pub fn new(sample_rate: f32, rate_hz: f32, depth: f32, shape: PanShape) -> Self {
        Self {
            phase: 0.0,
            phase_inc: rate_hz.max(0.01) / sample_rate,
            depth: depth.clamp(0.0, 1.0),
            shape,
            sample_rate,
        }
    }

    /// Set LFO rate in Hz.
    pub fn set_rate(&mut self, rate_hz: f32) {
        self.phase_inc = rate_hz.max(0.01) / self.sample_rate;
    }

    /// Set depth (0.0–1.0).
    pub fn set_depth(&mut self, depth: f32) {
        self.depth = depth.clamp(0.0, 1.0);
    }

    /// Set LFO shape.
    pub fn set_shape(&mut self, shape: PanShape) {
        self.shape = shape;
    }

    /// Get current shape.
    pub fn shape(&self) -> PanShape {
        self.shape
    }

    /// Get the LFO value mapped to pan position (0.0=left, 0.5=center, 1.0=right).
    #[inline]
    fn lfo_pan(&mut self) -> f32 {
        let raw = match self.shape {
            PanShape::Sine => {
                (1.0 + (self.phase * TAU).sin()) * 0.5 // 0..1
            }
            PanShape::Triangle => {
                let p = self.phase;
                if p < 0.5 { p * 2.0 } else { 2.0 - p * 2.0 }
            }
        };

        self.phase += self.phase_inc;
        if self.phase >= 1.0 {
            self.phase -= 1.0;
        }

        // Map with depth: 0.5 (center) ± depth * deviation
        0.5 + (raw - 0.5) * self.depth
    }

    /// Process a stereo sample pair with constant-power panning.
    #[inline]
    pub fn process_sample(&mut self, left: f32, right: f32) -> (f32, f32) {
        let pan = self.lfo_pan(); // 0..1
        // Constant-power panning law
        let angle = pan * FRAC_PI_2; // 0..π/2
        let gain_r = angle.sin();
        let gain_l = angle.cos();

        // Apply to mono sum for true auto-pan (or apply per-channel for stereo)
        let mono = (left + right) * 0.5;
        (mono * gain_l * 2.0_f32.sqrt(), mono * gain_r * 2.0_f32.sqrt())
    }

    /// Process an interleaved stereo buffer in-place [L, R, L, R, ...].
    pub fn process_interleaved(&mut self, buffer: &mut [f32]) {
        let len = buffer.len();
        let mut i = 0;
        while i + 1 < len {
            let (l, r) = self.process_sample(buffer[i], buffer[i + 1]);
            buffer[i] = l;
            buffer[i + 1] = r;
            i += 2;
        }
    }

    /// Reset LFO phase.
    pub fn reset(&mut self) {
        self.phase = 0.0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_creation() {
        let ap = AutoPan::new(44100.0, 2.0, 0.5, PanShape::Sine);
        assert_eq!(ap.shape(), PanShape::Sine);
    }

    #[test]
    fn test_zero_depth_centered() {
        let mut ap = AutoPan::new(44100.0, 2.0, 0.0, PanShape::Sine);
        // Depth 0 = always center, should be roughly equal L/R
        let (l, r) = ap.process_sample(1.0, 1.0);
        assert!((l - r).abs() < 0.01, "Center: L={l}, R={r}");
    }

    #[test]
    fn test_full_depth_reaches_extremes() {
        let mut ap = AutoPan::new(44100.0, 2.0, 1.0, PanShape::Sine);
        let samples_per_cycle = (44100.0 / 2.0) as usize;

        let mut max_l = 0.0_f32;
        let mut max_r = 0.0_f32;
        let mut min_l = f32::INFINITY;
        let mut min_r = f32::INFINITY;

        for _ in 0..samples_per_cycle {
            let (l, r) = ap.process_sample(0.5, 0.5);
            max_l = max_l.max(l);
            max_r = max_r.max(r);
            min_l = min_l.min(l);
            min_r = min_r.min(r);
        }

        // Full depth: one channel should reach near-zero while other is loud
        assert!(min_l < 0.05, "L should reach near 0: {min_l}");
        assert!(min_r < 0.05, "R should reach near 0: {min_r}");
        assert!(max_l > 0.5, "L should be loud: {max_l}");
        assert!(max_r > 0.5, "R should be loud: {max_r}");
    }

    #[test]
    fn test_constant_power() {
        // Total power should stay roughly constant across the pan sweep
        let mut ap = AutoPan::new(44100.0, 2.0, 1.0, PanShape::Sine);
        let samples_per_cycle = (44100.0 / 2.0) as usize;

        let mut powers = Vec::new();
        for _ in 0..samples_per_cycle {
            let (l, r) = ap.process_sample(0.5, 0.5);
            powers.push(l * l + r * r);
        }

        let avg_power = powers.iter().sum::<f32>() / powers.len() as f32;
        let max_deviation = powers
            .iter()
            .map(|p| (p - avg_power).abs())
            .fold(0.0_f32, f32::max);

        // Constant power: deviation should be small relative to average
        assert!(
            max_deviation < avg_power * 0.15,
            "Power deviation {max_deviation} too large (avg={avg_power})"
        );
    }

    #[test]
    fn test_triangle_shape() {
        let mut ap = AutoPan::new(44100.0, 2.0, 1.0, PanShape::Triangle);
        let mut prev_l = 0.0_f32;
        let (l, _) = ap.process_sample(0.5, 0.5);
        prev_l = l;

        let mut max_jump = 0.0_f32;
        for _ in 1..4410 {
            let (l, _) = ap.process_sample(0.5, 0.5);
            max_jump = max_jump.max((l - prev_l).abs());
            prev_l = l;
        }
        // Triangle should be smooth
        assert!(max_jump < 0.01, "Triangle smooth: {max_jump}");
    }

    #[test]
    fn test_silence_passthrough() {
        let mut ap = AutoPan::new(44100.0, 2.0, 1.0, PanShape::Sine);
        let mut buf = [0.0_f32; 64];
        ap.process_interleaved(&mut buf);
        for &s in &buf {
            assert!(s.abs() < 1e-10, "Silence: {s}");
        }
    }

    #[test]
    fn test_interleaved_buffer() {
        let mut ap = AutoPan::new(44100.0, 2.0, 0.0, PanShape::Sine);
        let mut buf = [0.5_f32, 0.5, 0.5, 0.5];
        ap.process_interleaved(&mut buf);
        // Zero depth = center, L ≈ R
        assert!((buf[0] - buf[1]).abs() < 0.05, "Center: L={}, R={}", buf[0], buf[1]);
    }

    #[test]
    fn test_parameter_setters() {
        let mut ap = AutoPan::new(44100.0, 2.0, 0.5, PanShape::Sine);
        ap.set_rate(5.0);
        ap.set_depth(0.8);
        ap.set_shape(PanShape::Triangle);
        assert_eq!(ap.shape(), PanShape::Triangle);
    }

    #[test]
    fn test_depth_clamping() {
        let ap = AutoPan::new(44100.0, 2.0, 2.0, PanShape::Sine);
        assert_eq!(ap.depth, 1.0);
        let ap2 = AutoPan::new(44100.0, 2.0, -1.0, PanShape::Sine);
        assert_eq!(ap2.depth, 0.0);
    }

    #[test]
    fn test_reset() {
        let mut ap = AutoPan::new(44100.0, 2.0, 0.5, PanShape::Sine);
        for _ in 0..1000 {
            ap.process_sample(0.5, 0.5);
        }
        ap.reset();
        assert_eq!(ap.phase, 0.0);
    }
}
