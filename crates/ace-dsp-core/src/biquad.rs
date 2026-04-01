//! Biquad filter — foundation for EQ, filter effects.
//!
//! Implements the standard Direct Form II Transposed biquad filter
//! using the Audio EQ Cookbook coefficients by Robert Bristow-Johnson.

use core::f32::consts::PI;

/// Biquad filter types matching Web Audio API BiquadFilterNode types.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum BiquadType {
    Lowpass,
    Highpass,
    Bandpass,
    Notch,
    Allpass,
    Peaking,
    LowShelf,
    HighShelf,
}

/// Biquad filter coefficients.
#[derive(Debug, Clone, Copy)]
pub struct BiquadCoeffs {
    pub b0: f32,
    pub b1: f32,
    pub b2: f32,
    pub a1: f32,
    pub a2: f32,
}

impl BiquadCoeffs {
    /// Compute biquad coefficients from Audio EQ Cookbook formulas.
    pub fn compute(
        filter_type: BiquadType,
        sample_rate: f32,
        frequency: f32,
        q: f32,
        gain_db: f32,
    ) -> Self {
        // Clamp inputs to prevent NaN/Inf from invalid parameters.
        let sr = if sample_rate > 0.0 { sample_rate } else { 1.0 };
        let nyquist = 0.5 * sr;
        let safe_frequency = frequency.clamp(1.0, nyquist * 0.99);
        let safe_q = if q.is_finite() && q > 1.0e-6 { q } else { 1.0e-6 };

        let w0 = 2.0 * PI * safe_frequency / sr;
        let cos_w0 = w0.cos();
        let sin_w0 = w0.sin();
        let alpha = sin_w0 / (2.0 * safe_q);

        let (b0, b1, b2, a0, a1, a2) = match filter_type {
            BiquadType::Lowpass => {
                let b1 = 1.0 - cos_w0;
                let b0 = b1 / 2.0;
                let b2 = b0;
                let a0 = 1.0 + alpha;
                let a1 = -2.0 * cos_w0;
                let a2 = 1.0 - alpha;
                (b0, b1, b2, a0, a1, a2)
            }
            BiquadType::Highpass => {
                let b1 = -(1.0 + cos_w0);
                let b0 = -b1 / 2.0;
                let b2 = b0;
                let a0 = 1.0 + alpha;
                let a1 = -2.0 * cos_w0;
                let a2 = 1.0 - alpha;
                (b0, b1, b2, a0, a1, a2)
            }
            BiquadType::Bandpass => {
                let b0 = alpha;
                let b1 = 0.0;
                let b2 = -alpha;
                let a0 = 1.0 + alpha;
                let a1 = -2.0 * cos_w0;
                let a2 = 1.0 - alpha;
                (b0, b1, b2, a0, a1, a2)
            }
            BiquadType::Notch => {
                let b0 = 1.0;
                let b1 = -2.0 * cos_w0;
                let b2 = 1.0;
                let a0 = 1.0 + alpha;
                let a1 = -2.0 * cos_w0;
                let a2 = 1.0 - alpha;
                (b0, b1, b2, a0, a1, a2)
            }
            BiquadType::Allpass => {
                let b0 = 1.0 - alpha;
                let b1 = -2.0 * cos_w0;
                let b2 = 1.0 + alpha;
                let a0 = 1.0 + alpha;
                let a1 = -2.0 * cos_w0;
                let a2 = 1.0 - alpha;
                (b0, b1, b2, a0, a1, a2)
            }
            BiquadType::Peaking => {
                let a = 10.0_f32.powf(gain_db / 40.0);
                let b0 = 1.0 + alpha * a;
                let b1 = -2.0 * cos_w0;
                let b2 = 1.0 - alpha * a;
                let a0 = 1.0 + alpha / a;
                let a1 = -2.0 * cos_w0;
                let a2 = 1.0 - alpha / a;
                (b0, b1, b2, a0, a1, a2)
            }
            BiquadType::LowShelf => {
                let a = 10.0_f32.powf(gain_db / 40.0);
                let two_sqrt_a_alpha = 2.0 * a.sqrt() * alpha;
                let b0 = a * ((a + 1.0) - (a - 1.0) * cos_w0 + two_sqrt_a_alpha);
                let b1 = 2.0 * a * ((a - 1.0) - (a + 1.0) * cos_w0);
                let b2 = a * ((a + 1.0) - (a - 1.0) * cos_w0 - two_sqrt_a_alpha);
                let a0 = (a + 1.0) + (a - 1.0) * cos_w0 + two_sqrt_a_alpha;
                let a1 = -2.0 * ((a - 1.0) + (a + 1.0) * cos_w0);
                let a2 = (a + 1.0) + (a - 1.0) * cos_w0 - two_sqrt_a_alpha;
                (b0, b1, b2, a0, a1, a2)
            }
            BiquadType::HighShelf => {
                let a = 10.0_f32.powf(gain_db / 40.0);
                let two_sqrt_a_alpha = 2.0 * a.sqrt() * alpha;
                let b0 = a * ((a + 1.0) + (a - 1.0) * cos_w0 + two_sqrt_a_alpha);
                let b1 = -2.0 * a * ((a - 1.0) + (a + 1.0) * cos_w0);
                let b2 = a * ((a + 1.0) + (a - 1.0) * cos_w0 - two_sqrt_a_alpha);
                let a0 = (a + 1.0) - (a - 1.0) * cos_w0 + two_sqrt_a_alpha;
                let a1 = 2.0 * ((a - 1.0) - (a + 1.0) * cos_w0);
                let a2 = (a + 1.0) - (a - 1.0) * cos_w0 - two_sqrt_a_alpha;
                (b0, b1, b2, a0, a1, a2)
            }
        };

        // Normalize by a0
        let inv_a0 = 1.0 / a0;
        Self {
            b0: b0 * inv_a0,
            b1: b1 * inv_a0,
            b2: b2 * inv_a0,
            a1: a1 * inv_a0,
            a2: a2 * inv_a0,
        }
    }
}

/// Biquad filter state (Direct Form II Transposed).
#[derive(Debug, Clone)]
pub struct BiquadFilter {
    coeffs: BiquadCoeffs,
    z1: f32,
    z2: f32,
}

impl BiquadFilter {
    pub fn new(coeffs: BiquadCoeffs) -> Self {
        Self {
            coeffs,
            z1: 0.0,
            z2: 0.0,
        }
    }

    /// Create a filter from parameters.
    pub fn from_params(
        filter_type: BiquadType,
        sample_rate: f32,
        frequency: f32,
        q: f32,
        gain_db: f32,
    ) -> Self {
        Self::new(BiquadCoeffs::compute(
            filter_type,
            sample_rate,
            frequency,
            q,
            gain_db,
        ))
    }

    /// Update filter coefficients (smooth parameter changes).
    pub fn set_coeffs(&mut self, coeffs: BiquadCoeffs) {
        self.coeffs = coeffs;
    }

    /// Reset filter state (call on seek or discontinuity).
    pub fn reset(&mut self) {
        self.z1 = 0.0;
        self.z2 = 0.0;
    }

    /// Process a single sample (Direct Form II Transposed).
    #[inline]
    pub fn process_sample(&mut self, input: f32) -> f32 {
        let c = &self.coeffs;
        let output = c.b0 * input + self.z1;
        self.z1 = c.b1 * input - c.a1 * output + self.z2;
        self.z2 = c.b2 * input - c.a2 * output;
        output
    }

    /// Process a buffer in-place.
    #[inline]
    pub fn process_buffer(&mut self, buffer: &mut [f32]) {
        for sample in buffer.iter_mut() {
            *sample = self.process_sample(*sample);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lowpass_dc_passthrough() {
        // A lowpass filter should pass DC (0 Hz) at unity gain
        let mut filter = BiquadFilter::from_params(
            BiquadType::Lowpass,
            48000.0,
            1000.0,
            0.707,
            0.0,
        );
        // Feed DC signal (all 1.0) through the filter
        let mut buf = [1.0_f32; 256];
        filter.process_buffer(&mut buf);
        // After settling, output should be ~1.0
        let last = buf[255];
        assert!((last - 1.0).abs() < 0.01, "DC should pass through lowpass, got {last}");
    }

    #[test]
    fn test_highpass_blocks_dc() {
        let mut filter = BiquadFilter::from_params(
            BiquadType::Highpass,
            48000.0,
            1000.0,
            0.707,
            0.0,
        );
        let mut buf = [1.0_f32; 512];
        filter.process_buffer(&mut buf);
        // After settling, DC should be fully attenuated
        let last = buf[511];
        assert!(last.abs() < 0.01, "DC should be blocked by highpass, got {last}");
    }

    #[test]
    fn test_reset_clears_state() {
        let mut filter = BiquadFilter::from_params(
            BiquadType::Lowpass,
            48000.0,
            1000.0,
            0.707,
            0.0,
        );
        // Process some signal
        let mut buf = [1.0_f32; 64];
        filter.process_buffer(&mut buf);
        assert!(filter.z1 != 0.0 || filter.z2 != 0.0);

        filter.reset();
        assert_eq!(filter.z1, 0.0);
        assert_eq!(filter.z2, 0.0);
    }

    #[test]
    fn test_bandpass_peak_at_center() {
        // Bandpass should pass signal at center frequency
        let sample_rate = 48000.0;
        let center_freq = 1000.0;
        let mut filter = BiquadFilter::from_params(
            BiquadType::Bandpass,
            sample_rate,
            center_freq,
            1.0,
            0.0,
        );

        // Generate 1kHz sine wave
        let mut buf: Vec<f32> = (0..2048)
            .map(|i| (2.0 * PI * center_freq * i as f32 / sample_rate).sin())
            .collect();

        filter.process_buffer(&mut buf);

        // Check RMS of last 1024 samples (after transient)
        let rms: f32 = buf[1024..]
            .iter()
            .map(|x| x * x)
            .sum::<f32>()
            / 1024.0;
        let rms = rms.sqrt();

        // Bandpass at center freq should have significant output
        assert!(rms > 0.3, "Bandpass should pass center freq, RMS = {rms}");
    }

    #[test]
    fn test_coefficients_normalized() {
        let coeffs = BiquadCoeffs::compute(
            BiquadType::Lowpass,
            48000.0,
            1000.0,
            0.707,
            0.0,
        );
        // Verify coefficients are finite and reasonable
        assert!(coeffs.b0.is_finite());
        assert!(coeffs.b1.is_finite());
        assert!(coeffs.b2.is_finite());
        assert!(coeffs.a1.is_finite());
        assert!(coeffs.a2.is_finite());
    }
}
