//! Parametric EQ — 8-band equalizer built on cascaded biquad filters.
//!
//! Each band has independent type, frequency, Q, gain, and enable state.
//! Provides analytic magnitude response calculation for UI curve display.

use crate::biquad::{BiquadCoeffs, BiquadStereo, FilterType};

/// Maximum number of EQ bands.
pub const MAX_BANDS: usize = 8;

/// Parameters for a single EQ band.
#[derive(Debug, Clone, Copy)]
pub struct EqBandParams {
    pub filter_type: FilterType,
    pub frequency: f64,  // 20–20000 Hz
    pub q: f64,          // 0.1–30.0
    pub gain_db: f64,    // -24–+24 dB
    pub enabled: bool,
}

impl Default for EqBandParams {
    fn default() -> Self {
        Self {
            filter_type: FilterType::Peaking,
            frequency: 1000.0,
            q: 1.0,
            gain_db: 0.0,
            enabled: true,
        }
    }
}

/// 8-band parametric EQ with per-band type/freq/Q/gain control.
#[derive(Debug)]
pub struct ParametricEQ {
    bands: [BiquadStereo; MAX_BANDS],
    band_params: [EqBandParams; MAX_BANDS],
    band_coeffs: [BiquadCoeffs; MAX_BANDS],
    enabled: [bool; MAX_BANDS],
    sample_rate: f64,
}

impl ParametricEQ {
    /// Create a new 8-band parametric EQ with default (flat) settings.
    pub fn new(sample_rate: f64) -> Self {
        let default_params = EqBandParams::default();
        let coeffs = BiquadCoeffs::default(); // unity pass-through

        Self {
            bands: core::array::from_fn(|_| BiquadStereo::new(coeffs)),
            band_params: [default_params; MAX_BANDS],
            band_coeffs: [coeffs; MAX_BANDS],
            enabled: [false; MAX_BANDS], // all disabled by default
            sample_rate,
        }
    }

    /// Set parameters for a specific band (0-indexed).
    pub fn set_band(&mut self, index: usize, params: EqBandParams) {
        if index >= MAX_BANDS {
            return;
        }

        self.band_params[index] = params;
        self.enabled[index] = params.enabled;

        if params.enabled {
            let coeffs = BiquadCoeffs::new(
                params.filter_type,
                params.frequency,
                params.q,
                params.gain_db,
                self.sample_rate,
            );
            self.band_coeffs[index] = coeffs;
            self.bands[index].set_coeffs(coeffs);
        }
    }

    /// Enable or disable a band without changing its parameters.
    pub fn set_band_enabled(&mut self, index: usize, enabled: bool) {
        if index < MAX_BANDS {
            self.enabled[index] = enabled;
            self.band_params[index].enabled = enabled;
        }
    }

    /// Process stereo audio with separate L/R buffers.
    pub fn process_stereo(&mut self, left: &mut [f32], right: &mut [f32]) {
        for i in 0..MAX_BANDS {
            if self.enabled[i] {
                self.bands[i].process_split(left, right);
            }
        }
    }

    /// Calculate the combined magnitude response at the given frequencies.
    ///
    /// Returns dB values for each frequency. This is an analytic calculation
    /// (no FFT needed) — evaluates H(z) directly from coefficients.
    pub fn magnitude_response(&self, frequencies: &[f32]) -> Vec<f32> {
        frequencies
            .iter()
            .map(|&freq| {
                let mut total_db = 0.0f64;
                for i in 0..MAX_BANDS {
                    if self.enabled[i] {
                        total_db += self.band_coeffs[i].magnitude_db(freq as f64, self.sample_rate);
                    }
                }
                total_db as f32
            })
            .collect()
    }

    /// Calculate magnitude response for a single band.
    pub fn band_magnitude_response(&self, band_index: usize, frequencies: &[f32]) -> Vec<f32> {
        if band_index >= MAX_BANDS || !self.enabled[band_index] {
            return vec![0.0; frequencies.len()];
        }

        frequencies
            .iter()
            .map(|&freq| {
                self.band_coeffs[band_index]
                    .magnitude_db(freq as f64, self.sample_rate) as f32
            })
            .collect()
    }

    /// Generate log-spaced frequency points for UI curve rendering.
    /// Returns `num_points` frequencies from 20Hz to 20kHz.
    pub fn frequency_points(num_points: usize) -> Vec<f32> {
        let log_min = (20.0f64).ln();
        let log_max = (20000.0f64).ln();
        (0..num_points)
            .map(|i| {
                let t = i as f64 / (num_points - 1).max(1) as f64;
                (log_min + t * (log_max - log_min)).exp() as f32
            })
            .collect()
    }

    pub fn reset(&mut self) {
        for band in &mut self.bands {
            band.reset();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SR: f64 = 48000.0;

    #[test]
    fn flat_eq_passes_through() {
        let mut eq = ParametricEQ::new(SR);

        // No bands enabled — should be unity
        let mut left = vec![1.0f32; 100];
        let mut right = vec![1.0f32; 100];

        eq.process_stereo(&mut left, &mut right);

        assert!(
            (left[99] - 1.0).abs() < 0.001,
            "Flat EQ should pass through: got {}",
            left[99]
        );
    }

    #[test]
    fn single_band_boost() {
        let mut eq = ParametricEQ::new(SR);

        eq.set_band(0, EqBandParams {
            filter_type: FilterType::Peaking,
            frequency: 1000.0,
            q: 1.0,
            gain_db: 12.0,
            enabled: true,
        });

        let response = eq.magnitude_response(&[1000.0]);
        assert!(
            (response[0] - 12.0).abs() < 0.5,
            "1kHz +12dB boost: expected ~12dB, got {:.2}dB",
            response[0]
        );
    }

    #[test]
    fn single_band_cut() {
        let mut eq = ParametricEQ::new(SR);

        eq.set_band(0, EqBandParams {
            filter_type: FilterType::Peaking,
            frequency: 500.0,
            q: 2.0,
            gain_db: -6.0,
            enabled: true,
        });

        let response = eq.magnitude_response(&[500.0]);
        assert!(
            (response[0] - (-6.0)).abs() < 0.5,
            "500Hz -6dB cut: expected ~-6dB, got {:.2}dB",
            response[0]
        );
    }

    #[test]
    fn multiple_bands_combine() {
        let mut eq = ParametricEQ::new(SR);

        // Band 0: +6dB at 200Hz
        eq.set_band(0, EqBandParams {
            filter_type: FilterType::Peaking,
            frequency: 200.0,
            q: 1.0,
            gain_db: 6.0,
            enabled: true,
        });

        // Band 1: +6dB at 200Hz (same freq — should stack)
        eq.set_band(1, EqBandParams {
            filter_type: FilterType::Peaking,
            frequency: 200.0,
            q: 1.0,
            gain_db: 6.0,
            enabled: true,
        });

        let response = eq.magnitude_response(&[200.0]);
        assert!(
            (response[0] - 12.0).abs() < 1.0,
            "Two +6dB bands at same freq should give ~+12dB: got {:.2}dB",
            response[0]
        );
    }

    #[test]
    fn disabled_band_has_no_effect() {
        let mut eq = ParametricEQ::new(SR);

        eq.set_band(0, EqBandParams {
            filter_type: FilterType::Peaking,
            frequency: 1000.0,
            q: 1.0,
            gain_db: 12.0,
            enabled: false,
        });

        let response = eq.magnitude_response(&[1000.0]);
        assert!(
            response[0].abs() < 0.01,
            "Disabled band should have 0dB effect: got {:.2}dB",
            response[0]
        );
    }

    #[test]
    fn frequency_points_log_spaced() {
        let pts = ParametricEQ::frequency_points(100);
        assert_eq!(pts.len(), 100);
        assert!((pts[0] - 20.0).abs() < 0.1, "First point should be ~20Hz");
        assert!(
            (pts[99] - 20000.0).abs() < 10.0,
            "Last point should be ~20kHz"
        );
        // Should be monotonically increasing
        for i in 1..pts.len() {
            assert!(pts[i] > pts[i - 1], "Points should be increasing");
        }
    }

    #[test]
    fn highpass_at_band_0() {
        let mut eq = ParametricEQ::new(SR);

        eq.set_band(0, EqBandParams {
            filter_type: FilterType::Highpass,
            frequency: 200.0,
            q: 0.707,
            gain_db: 0.0,
            enabled: true,
        });

        let response = eq.magnitude_response(&[50.0, 200.0, 5000.0]);
        // 50Hz should be attenuated
        assert!(response[0] < -6.0, "50Hz should be cut by HP@200: got {:.2}dB", response[0]);
        // 5kHz should pass
        assert!(response[2].abs() < 1.0, "5kHz should pass HP@200: got {:.2}dB", response[2]);
    }

    #[test]
    fn band_magnitude_response_individual() {
        let mut eq = ParametricEQ::new(SR);

        eq.set_band(0, EqBandParams {
            filter_type: FilterType::Peaking,
            frequency: 1000.0,
            q: 1.0,
            gain_db: 6.0,
            enabled: true,
        });

        eq.set_band(1, EqBandParams {
            filter_type: FilterType::Peaking,
            frequency: 5000.0,
            q: 1.0,
            gain_db: -3.0,
            enabled: true,
        });

        // Band 0 at its center
        let b0 = eq.band_magnitude_response(0, &[1000.0]);
        assert!((b0[0] - 6.0).abs() < 0.5, "Band 0 at 1kHz: got {:.2}dB", b0[0]);

        // Band 1 at its center
        let b1 = eq.band_magnitude_response(1, &[5000.0]);
        assert!((b1[0] - (-3.0)).abs() < 0.5, "Band 1 at 5kHz: got {:.2}dB", b1[0]);
    }
}
