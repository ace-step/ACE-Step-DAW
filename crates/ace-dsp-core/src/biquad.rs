//! Biquad filter — the fundamental audio DSP building block.
//!
//! Implements all standard filter types from the Robert Bristow-Johnson
//! Audio EQ Cookbook. Uses Direct Form II Transposed topology for best
//! numerical behavior with floating-point arithmetic.
//!
//! Coefficients are computed in f64 for precision, processing can run
//! in f32 for SIMD friendliness.

use core::f64::consts::PI;

use crate::ANTI_DENORMAL;

/// Filter type selection for coefficient calculation.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum FilterType {
    Lowpass,
    Highpass,
    Bandpass,       // constant skirt gain, peak gain = Q
    BandpassPeak,   // constant 0 dB peak gain
    Notch,
    Peaking,        // parametric EQ bell
    LowShelf,
    HighShelf,
    Allpass,
}

/// Biquad filter coefficients (normalized: a0 = 1.0).
#[derive(Debug, Clone, Copy)]
pub struct BiquadCoeffs {
    pub b0: f64,
    pub b1: f64,
    pub b2: f64,
    pub a1: f64,
    pub a2: f64,
}

impl Default for BiquadCoeffs {
    fn default() -> Self {
        // Unity pass-through
        Self {
            b0: 1.0,
            b1: 0.0,
            b2: 0.0,
            a1: 0.0,
            a2: 0.0,
        }
    }
}

impl BiquadCoeffs {
    /// Calculate coefficients for the given filter type.
    ///
    /// - `filter_type`: type of filter
    /// - `freq`: center/cutoff frequency in Hz (20..20000)
    /// - `q`: quality factor (0.1..30.0)
    /// - `gain_db`: gain in dB for peaking/shelf types (-24..+24)
    /// - `sample_rate`: sample rate in Hz (e.g. 48000.0)
    pub fn new(
        filter_type: FilterType,
        freq: f64,
        q: f64,
        gain_db: f64,
        sample_rate: f64,
    ) -> Self {
        let w0 = 2.0 * PI * freq / sample_rate;
        let cos_w0 = w0.cos();
        let sin_w0 = w0.sin();
        let alpha = sin_w0 / (2.0 * q);

        // For shelf filters
        let a = 10.0_f64.powf(gain_db / 40.0); // sqrt of linear gain
        let two_sqrt_a_alpha = 2.0 * a.sqrt() * alpha;

        let (b0, b1, b2, a0, a1, a2) = match filter_type {
            FilterType::Lowpass => {
                let b1 = 1.0 - cos_w0;
                let b0 = b1 / 2.0;
                let b2 = b0;
                let a0 = 1.0 + alpha;
                let a1 = -2.0 * cos_w0;
                let a2 = 1.0 - alpha;
                (b0, b1, b2, a0, a1, a2)
            }
            FilterType::Highpass => {
                let b1 = -(1.0 + cos_w0);
                let b0 = -b1 / 2.0;
                let b2 = b0;
                let a0 = 1.0 + alpha;
                let a1 = -2.0 * cos_w0;
                let a2 = 1.0 - alpha;
                (b0, b1, b2, a0, a1, a2)
            }
            FilterType::Bandpass => {
                let b0 = alpha;
                let b1 = 0.0;
                let b2 = -alpha;
                let a0 = 1.0 + alpha;
                let a1 = -2.0 * cos_w0;
                let a2 = 1.0 - alpha;
                (b0, b1, b2, a0, a1, a2)
            }
            FilterType::BandpassPeak => {
                let b0 = sin_w0 / 2.0;
                let b1 = 0.0;
                let b2 = -sin_w0 / 2.0;
                let a0 = 1.0 + alpha;
                let a1 = -2.0 * cos_w0;
                let a2 = 1.0 - alpha;
                (b0, b1, b2, a0, a1, a2)
            }
            FilterType::Notch => {
                let b0 = 1.0;
                let b1 = -2.0 * cos_w0;
                let b2 = 1.0;
                let a0 = 1.0 + alpha;
                let a1 = -2.0 * cos_w0;
                let a2 = 1.0 - alpha;
                (b0, b1, b2, a0, a1, a2)
            }
            FilterType::Peaking => {
                let a_lin = 10.0_f64.powf(gain_db / 40.0);
                let b0 = 1.0 + alpha * a_lin;
                let b1 = -2.0 * cos_w0;
                let b2 = 1.0 - alpha * a_lin;
                let a0 = 1.0 + alpha / a_lin;
                let a1 = -2.0 * cos_w0;
                let a2 = 1.0 - alpha / a_lin;
                (b0, b1, b2, a0, a1, a2)
            }
            FilterType::LowShelf => {
                let b0 = a * ((a + 1.0) - (a - 1.0) * cos_w0 + two_sqrt_a_alpha);
                let b1 = 2.0 * a * ((a - 1.0) - (a + 1.0) * cos_w0);
                let b2 = a * ((a + 1.0) - (a - 1.0) * cos_w0 - two_sqrt_a_alpha);
                let a0 = (a + 1.0) + (a - 1.0) * cos_w0 + two_sqrt_a_alpha;
                let a1 = -2.0 * ((a - 1.0) + (a + 1.0) * cos_w0);
                let a2 = (a + 1.0) + (a - 1.0) * cos_w0 - two_sqrt_a_alpha;
                (b0, b1, b2, a0, a1, a2)
            }
            FilterType::HighShelf => {
                let b0 = a * ((a + 1.0) + (a - 1.0) * cos_w0 + two_sqrt_a_alpha);
                let b1 = -2.0 * a * ((a - 1.0) + (a + 1.0) * cos_w0);
                let b2 = a * ((a + 1.0) + (a - 1.0) * cos_w0 - two_sqrt_a_alpha);
                let a0 = (a + 1.0) - (a - 1.0) * cos_w0 + two_sqrt_a_alpha;
                let a1 = 2.0 * ((a - 1.0) - (a + 1.0) * cos_w0);
                let a2 = (a + 1.0) - (a - 1.0) * cos_w0 - two_sqrt_a_alpha;
                (b0, b1, b2, a0, a1, a2)
            }
            FilterType::Allpass => {
                let b0 = 1.0 - alpha;
                let b1 = -2.0 * cos_w0;
                let b2 = 1.0 + alpha;
                let a0 = 1.0 + alpha;
                let a1 = -2.0 * cos_w0;
                let a2 = 1.0 - alpha;
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

    /// Calculate magnitude response in dB at a given frequency.
    pub fn magnitude_db(&self, freq: f64, sample_rate: f64) -> f64 {
        let w = 2.0 * PI * freq / sample_rate;
        let cos_w = w.cos();
        let cos_2w = (2.0 * w).cos();

        // |H(e^jw)|^2 = (b0^2 + b1^2 + b2^2 + 2*(b0*b1+b1*b2)*cos(w) + 2*b0*b2*cos(2w))
        //              / (1 + a1^2 + a2^2 + 2*(a1+a1*a2)*cos(w) + 2*a2*cos(2w))
        let num = self.b0 * self.b0
            + self.b1 * self.b1
            + self.b2 * self.b2
            + 2.0 * (self.b0 * self.b1 + self.b1 * self.b2) * cos_w
            + 2.0 * self.b0 * self.b2 * cos_2w;

        let den = 1.0
            + self.a1 * self.a1
            + self.a2 * self.a2
            + 2.0 * (self.a1 + self.a1 * self.a2) * cos_w
            + 2.0 * self.a2 * cos_2w;

        10.0 * (num / den).log10()
    }
}

/// Mono biquad processor using Direct Form II Transposed.
///
/// This topology has the best numerical properties for floating-point
/// coefficient modulation (parameter changes during processing).
#[derive(Debug, Clone)]
pub struct BiquadMono {
    coeffs: BiquadCoeffs,
    s1: f64, // state variable 1
    s2: f64, // state variable 2
}

impl BiquadMono {
    pub fn new(coeffs: BiquadCoeffs) -> Self {
        Self {
            coeffs,
            s1: 0.0,
            s2: 0.0,
        }
    }

    /// Update coefficients (smooth transition — no click since DFII-T
    /// state variables are compatible across coefficient changes).
    #[inline]
    pub fn set_coeffs(&mut self, coeffs: BiquadCoeffs) {
        self.coeffs = coeffs;
    }

    /// Process a single sample.
    #[inline]
    pub fn process_sample(&mut self, input: f32) -> f32 {
        let x = input as f64;
        let c = &self.coeffs;

        let y = c.b0 * x + self.s1;
        self.s1 = c.b1 * x - c.a1 * y + self.s2;
        self.s2 = c.b2 * x - c.a2 * y + ANTI_DENORMAL;

        y as f32
    }

    /// Process a block of samples in-place.
    #[inline]
    pub fn process_block(&mut self, buffer: &mut [f32]) {
        for sample in buffer.iter_mut() {
            *sample = self.process_sample(*sample);
        }
    }

    /// Process a block from input to output buffer.
    pub fn process_block_to(&mut self, input: &[f32], output: &mut [f32]) {
        let len = input.len().min(output.len());
        for i in 0..len {
            output[i] = self.process_sample(input[i]);
        }
    }

    /// Reset state to silence (call on seek or track reset).
    pub fn reset(&mut self) {
        self.s1 = 0.0;
        self.s2 = 0.0;
    }
}

/// Stereo biquad processor — two independent mono filters with shared coefficients.
#[derive(Debug, Clone)]
pub struct BiquadStereo {
    left: BiquadMono,
    right: BiquadMono,
}

impl BiquadStereo {
    pub fn new(coeffs: BiquadCoeffs) -> Self {
        Self {
            left: BiquadMono::new(coeffs),
            right: BiquadMono::new(coeffs),
        }
    }

    pub fn set_coeffs(&mut self, coeffs: BiquadCoeffs) {
        self.left.set_coeffs(coeffs);
        self.right.set_coeffs(coeffs);
    }

    /// Process interleaved stereo samples [L, R, L, R, ...].
    pub fn process_interleaved(&mut self, buffer: &mut [f32]) {
        let mut i = 0;
        while i + 1 < buffer.len() {
            buffer[i] = self.left.process_sample(buffer[i]);
            buffer[i + 1] = self.right.process_sample(buffer[i + 1]);
            i += 2;
        }
    }

    /// Process separate L/R channel buffers.
    pub fn process_split(&mut self, left: &mut [f32], right: &mut [f32]) {
        self.left.process_block(left);
        self.right.process_block(right);
    }

    pub fn reset(&mut self) {
        self.left.reset();
        self.right.reset();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SR: f64 = 48000.0;

    #[test]
    fn lowpass_passes_dc() {
        let coeffs = BiquadCoeffs::new(FilterType::Lowpass, 1000.0, 0.707, 0.0, SR);
        let mut filter = BiquadMono::new(coeffs);

        // Feed DC (1.0) for 1000 samples — output should converge to 1.0
        let mut last = 0.0f32;
        for _ in 0..1000 {
            last = filter.process_sample(1.0);
        }
        assert!((last - 1.0).abs() < 0.001, "DC should pass through LP: got {last}");
    }

    #[test]
    fn lowpass_attenuates_nyquist() {
        let coeffs = BiquadCoeffs::new(FilterType::Lowpass, 1000.0, 0.707, 0.0, SR);
        // At Nyquist/2 (12kHz), a 1kHz LP should heavily attenuate
        let mag = coeffs.magnitude_db(12000.0, SR);
        assert!(mag < -20.0, "12kHz should be attenuated >20dB by 1kHz LP: got {mag:.1}dB");
    }

    #[test]
    fn highpass_blocks_dc() {
        let coeffs = BiquadCoeffs::new(FilterType::Highpass, 1000.0, 0.707, 0.0, SR);
        let mut filter = BiquadMono::new(coeffs);

        let mut last = 0.0f32;
        for _ in 0..1000 {
            last = filter.process_sample(1.0);
        }
        assert!(last.abs() < 0.001, "DC should be blocked by HP: got {last}");
    }

    #[test]
    fn peaking_boosts_at_center() {
        let coeffs = BiquadCoeffs::new(FilterType::Peaking, 1000.0, 1.0, 12.0, SR);
        let mag = coeffs.magnitude_db(1000.0, SR);
        // 12dB boost at center should give ~12dB
        assert!(
            (mag - 12.0).abs() < 0.5,
            "Peaking +12dB at 1kHz: expected ~12dB, got {mag:.2}dB"
        );
    }

    #[test]
    fn peaking_flat_away_from_center() {
        let coeffs = BiquadCoeffs::new(FilterType::Peaking, 1000.0, 1.0, 12.0, SR);
        // Far from center (100Hz), should be near 0dB
        let mag = coeffs.magnitude_db(100.0, SR);
        assert!(
            mag.abs() < 1.0,
            "Peaking should be flat far from center: got {mag:.2}dB at 100Hz"
        );
    }

    #[test]
    fn notch_cuts_at_center() {
        let coeffs = BiquadCoeffs::new(FilterType::Notch, 1000.0, 10.0, 0.0, SR);
        let mag = coeffs.magnitude_db(1000.0, SR);
        assert!(mag < -30.0, "Notch should deeply cut at center: got {mag:.1}dB");
    }

    #[test]
    fn allpass_unity_magnitude() {
        let coeffs = BiquadCoeffs::new(FilterType::Allpass, 1000.0, 0.707, 0.0, SR);
        // Allpass should have 0dB magnitude at all frequencies
        for freq in [100.0, 500.0, 1000.0, 5000.0, 15000.0] {
            let mag = coeffs.magnitude_db(freq, SR);
            assert!(
                mag.abs() < 0.1,
                "Allpass should be 0dB at {freq}Hz: got {mag:.3}dB"
            );
        }
    }

    #[test]
    fn stereo_processes_both_channels() {
        let coeffs = BiquadCoeffs::new(FilterType::Lowpass, 5000.0, 0.707, 0.0, SR);
        let mut stereo = BiquadStereo::new(coeffs);

        let mut left = vec![1.0f32; 100];
        let mut right = vec![1.0f32; 100];
        stereo.process_split(&mut left, &mut right);

        // Both channels should converge toward 1.0 (DC passes LP)
        assert!(
            (left[99] - 1.0).abs() < 0.01,
            "Left channel DC: got {}",
            left[99]
        );
        assert!(
            (right[99] - 1.0).abs() < 0.01,
            "Right channel DC: got {}",
            right[99]
        );
    }

    #[test]
    fn reset_clears_state() {
        let coeffs = BiquadCoeffs::new(FilterType::Lowpass, 1000.0, 0.707, 0.0, SR);
        let mut filter = BiquadMono::new(coeffs);

        // Process some samples
        for _ in 0..100 {
            filter.process_sample(1.0);
        }

        filter.reset();

        // After reset, first output should be close to first-sample response
        let out1 = filter.process_sample(0.0);
        assert!(
            out1.abs() < 0.001,
            "After reset, zero input should give ~zero output: got {out1}"
        );
    }

    #[test]
    fn low_shelf_boost() {
        let coeffs = BiquadCoeffs::new(FilterType::LowShelf, 200.0, 0.707, 6.0, SR);
        let low_mag = coeffs.magnitude_db(50.0, SR);
        let high_mag = coeffs.magnitude_db(5000.0, SR);

        assert!(
            low_mag > 4.0,
            "Low shelf +6dB should boost at 50Hz: got {low_mag:.2}dB"
        );
        assert!(
            high_mag.abs() < 1.0,
            "Low shelf should be flat at 5kHz: got {high_mag:.2}dB"
        );
    }

    #[test]
    fn high_shelf_boost() {
        let coeffs = BiquadCoeffs::new(FilterType::HighShelf, 5000.0, 0.707, 6.0, SR);
        let low_mag = coeffs.magnitude_db(100.0, SR);
        let high_mag = coeffs.magnitude_db(15000.0, SR);

        assert!(
            low_mag.abs() < 1.0,
            "High shelf should be flat at 100Hz: got {low_mag:.2}dB"
        );
        assert!(
            high_mag > 4.0,
            "High shelf +6dB should boost at 15kHz: got {high_mag:.2}dB"
        );
    }
}
