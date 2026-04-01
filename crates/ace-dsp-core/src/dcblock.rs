//! DC Blocker — removes DC offset from audio signals.
//!
//! Uses a first-order highpass filter (single-pole/single-zero) to remove
//! any DC component that accumulates from effects like distortion, compression,
//! or asymmetric waveshaping.
//!
//! Transfer function: H(z) = (1 - z^-1) / (1 - R * z^-1)
//! where R controls the cutoff frequency (~5 Hz at R ≈ 0.995 for 44.1kHz).
//!
//! Parameters:
//! - `r_coeff`: pole radius (0.99–0.999), higher = lower cutoff

/// DC blocking filter.
pub struct DcBlocker {
    x_prev: f32,
    y_prev: f32,
    r: f32,
}

impl DcBlocker {
    /// Create a new DC blocker.
    ///
    /// - `sample_rate`: audio sample rate
    /// - `cutoff_hz`: cutoff frequency (default ~5 Hz). Lower values
    ///   preserve more low-frequency content.
    pub fn new(sample_rate: f32, cutoff_hz: f32) -> Self {
        Self {
            x_prev: 0.0,
            y_prev: 0.0,
            r: Self::compute_r(sample_rate, cutoff_hz),
        }
    }

    /// Create with default 5 Hz cutoff.
    pub fn default_for_rate(sample_rate: f32) -> Self {
        Self::new(sample_rate, 5.0)
    }

    /// Compute the pole coefficient R from sample rate and cutoff.
    ///
    /// R = 1 - (2π * fc / fs), clamped to [0.9, 0.9999].
    fn compute_r(sample_rate: f32, cutoff_hz: f32) -> f32 {
        let r = 1.0 - (core::f32::consts::TAU * cutoff_hz / sample_rate);
        r.clamp(0.9, 0.9999)
    }

    /// Set cutoff frequency.
    pub fn set_cutoff(&mut self, sample_rate: f32, cutoff_hz: f32) {
        self.r = Self::compute_r(sample_rate, cutoff_hz);
    }

    /// Process a single sample.
    ///
    /// y[n] = x[n] - x[n-1] + R * y[n-1]
    #[inline]
    pub fn process_sample(&mut self, input: f32) -> f32 {
        let y = input - self.x_prev + self.r * self.y_prev;
        self.x_prev = input;
        self.y_prev = y;
        y
    }

    /// Process a buffer in-place.
    pub fn process_buffer(&mut self, buffer: &mut [f32]) {
        for sample in buffer.iter_mut() {
            *sample = self.process_sample(*sample);
        }
    }

    /// Reset filter state.
    pub fn reset(&mut self) {
        self.x_prev = 0.0;
        self.y_prev = 0.0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_creation() {
        let dc = DcBlocker::new(44100.0, 5.0);
        assert!(dc.r > 0.99);
    }

    #[test]
    fn test_default_for_rate() {
        let dc = DcBlocker::default_for_rate(48000.0);
        assert!(dc.r > 0.99);
    }

    #[test]
    fn test_removes_dc_offset() {
        let mut dc = DcBlocker::new(44100.0, 5.0);
        // Feed signal with DC offset: 0.5 + sin(440Hz)
        let mut buf: Vec<f32> = (0..44100)
            .map(|i| {
                0.5 + (i as f32 * 440.0 * core::f32::consts::TAU / 44100.0).sin() * 0.3
            })
            .collect();
        dc.process_buffer(&mut buf);
        // After settling, the mean should be near zero
        let mean: f32 = buf[22050..].iter().sum::<f32>() / buf[22050..].len() as f32;
        assert!(
            mean.abs() < 0.01,
            "DC offset should be removed: mean={mean}"
        );
    }

    #[test]
    fn test_passes_ac_signal() {
        let mut dc = DcBlocker::new(44100.0, 5.0);
        // Feed pure sine (no DC)
        let input: Vec<f32> = (0..44100)
            .map(|i| (i as f32 * 440.0 * core::f32::consts::TAU / 44100.0).sin() * 0.5)
            .collect();
        let mut buf = input.clone();
        dc.process_buffer(&mut buf);
        // After settling, AC energy should be preserved
        let input_energy: f32 = input[22050..].iter().map(|s| s * s).sum();
        let output_energy: f32 = buf[22050..].iter().map(|s| s * s).sum();
        let ratio = output_energy / input_energy;
        assert!(
            ratio > 0.95,
            "AC should pass through: ratio={ratio}"
        );
    }

    #[test]
    fn test_silence_passthrough() {
        let mut dc = DcBlocker::new(44100.0, 5.0);
        let mut buf = [0.0_f32; 128];
        dc.process_buffer(&mut buf);
        for &s in &buf {
            assert!(s.abs() < 1e-10, "Silence: {s}");
        }
    }

    #[test]
    fn test_impulse_response_settles() {
        let mut dc = DcBlocker::new(44100.0, 5.0);
        // Feed a step function (constant DC)
        let mut buf = [1.0_f32; 44100];
        dc.process_buffer(&mut buf);
        // Last sample should be near zero (DC removed)
        assert!(
            buf[44099].abs() < 0.01,
            "Step should settle to 0: {}",
            buf[44099]
        );
    }

    #[test]
    fn test_output_bounded() {
        let mut dc = DcBlocker::new(44100.0, 5.0);
        let mut max_out = 0.0_f32;
        for i in 0..44100 {
            let input = (i as f32 * 440.0 * core::f32::consts::TAU / 44100.0).sin();
            let out = dc.process_sample(input);
            max_out = max_out.max(out.abs());
        }
        assert!(max_out <= 2.1, "Bounded: {max_out}");
    }

    #[test]
    fn test_set_cutoff() {
        let mut dc = DcBlocker::new(44100.0, 5.0);
        let r_before = dc.r;
        dc.set_cutoff(44100.0, 20.0);
        assert!(dc.r < r_before, "Higher cutoff → lower R");
    }

    #[test]
    fn test_reset() {
        let mut dc = DcBlocker::new(44100.0, 5.0);
        for _ in 0..1000 {
            dc.process_sample(1.0);
        }
        dc.reset();
        assert_eq!(dc.x_prev, 0.0);
        assert_eq!(dc.y_prev, 0.0);
    }

    #[test]
    fn test_r_clamping() {
        // Very high cutoff should clamp R to 0.9
        let dc = DcBlocker::new(44100.0, 10000.0);
        assert!((dc.r - 0.9).abs() < 0.001);
        // Very low cutoff should clamp to 0.9999
        let dc2 = DcBlocker::new(44100.0, 0.001);
        assert!((dc2.r - 0.9999).abs() < 0.001);
    }

    #[test]
    fn test_low_freq_preservation() {
        let mut dc = DcBlocker::new(44100.0, 5.0);
        // 50Hz sine — well above cutoff, should be preserved
        let input: Vec<f32> = (0..44100)
            .map(|i| (i as f32 * 50.0 * core::f32::consts::TAU / 44100.0).sin() * 0.8)
            .collect();
        let mut buf = input.clone();
        dc.process_buffer(&mut buf);
        let input_energy: f32 = input[22050..].iter().map(|s| s * s).sum();
        let output_energy: f32 = buf[22050..].iter().map(|s| s * s).sum();
        let ratio = output_energy / input_energy;
        assert!(ratio > 0.9, "50Hz should pass: ratio={ratio}");
    }
}
