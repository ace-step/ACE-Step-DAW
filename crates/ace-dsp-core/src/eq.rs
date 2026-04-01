//! Parametric EQ — multi-band equalizer using cascaded biquad filters.
//!
//! Supports up to 8 bands, each independently configurable with type,
//! frequency, Q, and gain. Uses the biquad module for coefficient computation.

use crate::biquad::{BiquadCoeffs, BiquadFilter, BiquadType};

/// Maximum number of EQ bands.
pub const MAX_BANDS: usize = 8;

/// Configuration for a single EQ band.
#[derive(Debug, Clone, Copy)]
pub struct EqBand {
    pub filter_type: BiquadType,
    pub frequency: f32,
    pub q: f32,
    pub gain_db: f32,
    pub enabled: bool,
}

impl Default for EqBand {
    fn default() -> Self {
        Self {
            filter_type: BiquadType::Peaking,
            frequency: 1000.0,
            q: 0.707,
            gain_db: 0.0,
            enabled: false,
        }
    }
}

/// Multi-band parametric equalizer.
///
/// Each band is a biquad filter in series. Disabled bands have zero cost
/// (skipped during processing).
pub struct ParametricEq {
    bands: [EqBand; MAX_BANDS],
    filters: [BiquadFilter; MAX_BANDS],
    sample_rate: f32,
}

impl ParametricEq {
    /// Create a new parametric EQ with all bands disabled.
    pub fn new(sample_rate: f32) -> Self {
        let default_coeffs = BiquadCoeffs::compute(
            BiquadType::Peaking,
            sample_rate,
            1000.0,
            0.707,
            0.0,
        );
        Self {
            bands: [EqBand::default(); MAX_BANDS],
            filters: core::array::from_fn(|_| BiquadFilter::new(default_coeffs)),
            sample_rate,
        }
    }

    /// Configure a band. `index` must be 0..MAX_BANDS.
    pub fn set_band(
        &mut self,
        index: usize,
        filter_type: BiquadType,
        frequency: f32,
        q: f32,
        gain_db: f32,
        enabled: bool,
    ) {
        if index >= MAX_BANDS {
            return;
        }
        self.bands[index] = EqBand {
            filter_type,
            frequency,
            q,
            gain_db,
            enabled,
        };
        if enabled {
            let coeffs =
                BiquadCoeffs::compute(filter_type, self.sample_rate, frequency, q, gain_db);
            self.filters[index].set_coeffs(coeffs);
        }
    }

    /// Enable or disable a band.
    pub fn set_band_enabled(&mut self, index: usize, enabled: bool) {
        if index >= MAX_BANDS {
            return;
        }
        self.bands[index].enabled = enabled;
    }

    /// Update only the frequency of a band (for smooth sweeping).
    pub fn set_band_frequency(&mut self, index: usize, frequency: f32) {
        if index >= MAX_BANDS {
            return;
        }
        let band = &mut self.bands[index];
        band.frequency = frequency;
        if band.enabled {
            let coeffs = BiquadCoeffs::compute(
                band.filter_type,
                self.sample_rate,
                frequency,
                band.q,
                band.gain_db,
            );
            self.filters[index].set_coeffs(coeffs);
        }
    }

    /// Get the number of currently enabled bands.
    pub fn active_band_count(&self) -> usize {
        self.bands.iter().filter(|b| b.enabled).count()
    }

    /// Process a single sample through all enabled bands.
    #[inline]
    pub fn process_sample(&mut self, input: f32) -> f32 {
        let mut sample = input;
        for (band, filter) in self.bands.iter().zip(self.filters.iter_mut()) {
            if band.enabled {
                sample = filter.process_sample(sample);
            }
        }
        sample
    }

    /// Process a buffer in-place through all enabled bands.
    #[inline]
    pub fn process_buffer(&mut self, buffer: &mut [f32]) {
        // Process each enabled band across the entire buffer for better cache locality
        for (band, filter) in self.bands.iter().zip(self.filters.iter_mut()) {
            if band.enabled {
                filter.process_buffer(buffer);
            }
        }
    }

    /// Reset all filter states.
    pub fn reset(&mut self) {
        for filter in &mut self.filters {
            filter.reset();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use core::f32::consts::PI;

    #[test]
    fn test_new_eq_all_bands_disabled() {
        let eq = ParametricEq::new(48000.0);
        assert_eq!(eq.active_band_count(), 0);
    }

    #[test]
    fn test_set_band_enables() {
        let mut eq = ParametricEq::new(48000.0);
        eq.set_band(0, BiquadType::Peaking, 1000.0, 1.0, 6.0, true);
        assert_eq!(eq.active_band_count(), 1);
    }

    #[test]
    fn test_disabled_eq_passes_through() {
        let mut eq = ParametricEq::new(48000.0);
        // All bands disabled — should be transparent
        let mut buf = [0.5_f32; 128];
        eq.process_buffer(&mut buf);
        for &s in &buf {
            assert_eq!(s, 0.5);
        }
    }

    #[test]
    fn test_peaking_boost_increases_level() {
        let mut eq = ParametricEq::new(48000.0);
        // Boost 12dB at 1kHz
        eq.set_band(0, BiquadType::Peaking, 1000.0, 1.0, 12.0, true);

        let sample_rate = 48000.0;
        let freq = 1000.0;
        // Generate 1kHz sine
        let mut buf: Vec<f32> = (0..4096)
            .map(|i| (2.0 * PI * freq * i as f32 / sample_rate).sin())
            .collect();

        eq.process_buffer(&mut buf);

        // Measure RMS of last 2048 samples (after transient)
        let rms: f32 = buf[2048..]
            .iter()
            .map(|x| x * x)
            .sum::<f32>()
            / 2048.0;
        let rms = rms.sqrt();
        let input_rms = 1.0 / 2.0_f32.sqrt(); // ~0.707

        assert!(
            rms > input_rms * 1.5,
            "12dB peaking boost at center freq should increase level: rms={rms}, input_rms={input_rms}"
        );
    }

    #[test]
    fn test_peaking_cut_decreases_level() {
        let mut eq = ParametricEq::new(48000.0);
        // Cut 12dB at 1kHz
        eq.set_band(0, BiquadType::Peaking, 1000.0, 1.0, -12.0, true);

        let sample_rate = 48000.0;
        let freq = 1000.0;
        let mut buf: Vec<f32> = (0..4096)
            .map(|i| (2.0 * PI * freq * i as f32 / sample_rate).sin())
            .collect();

        eq.process_buffer(&mut buf);

        let rms: f32 = buf[2048..]
            .iter()
            .map(|x| x * x)
            .sum::<f32>()
            / 2048.0;
        let rms = rms.sqrt();
        let input_rms = 1.0 / 2.0_f32.sqrt();

        assert!(
            rms < input_rms * 0.5,
            "12dB peaking cut at center freq should decrease level: rms={rms}"
        );
    }

    #[test]
    fn test_lowshelf_boosts_low_frequencies() {
        let mut eq = ParametricEq::new(48000.0);
        eq.set_band(0, BiquadType::LowShelf, 500.0, 0.707, 12.0, true);

        let sample_rate = 48000.0;
        // Generate 100Hz sine (below shelf)
        let mut buf: Vec<f32> = (0..8192)
            .map(|i| (2.0 * PI * 100.0 * i as f32 / sample_rate).sin())
            .collect();

        eq.process_buffer(&mut buf);

        let rms: f32 = buf[4096..]
            .iter()
            .map(|x| x * x)
            .sum::<f32>()
            / 4096.0;
        let rms = rms.sqrt();
        let input_rms = 1.0 / 2.0_f32.sqrt();

        assert!(
            rms > input_rms * 1.5,
            "Low shelf should boost 100Hz: rms={rms}"
        );
    }

    #[test]
    fn test_multiple_bands() {
        let mut eq = ParametricEq::new(48000.0);
        eq.set_band(0, BiquadType::Peaking, 100.0, 1.0, 6.0, true);
        eq.set_band(1, BiquadType::Peaking, 1000.0, 1.0, 6.0, true);
        eq.set_band(2, BiquadType::Peaking, 5000.0, 1.0, 6.0, true);
        assert_eq!(eq.active_band_count(), 3);

        // Should process without panic
        let mut buf = [0.5_f32; 128];
        eq.process_buffer(&mut buf);
    }

    #[test]
    fn test_band_disable() {
        let mut eq = ParametricEq::new(48000.0);
        eq.set_band(0, BiquadType::Peaking, 1000.0, 1.0, 12.0, true);
        eq.set_band_enabled(0, false);
        assert_eq!(eq.active_band_count(), 0);

        // Disabled band should pass through
        let mut buf = [0.5_f32; 128];
        eq.process_buffer(&mut buf);
        for &s in &buf {
            assert_eq!(s, 0.5);
        }
    }

    #[test]
    fn test_set_band_frequency() {
        let mut eq = ParametricEq::new(48000.0);
        eq.set_band(0, BiquadType::Peaking, 1000.0, 1.0, 6.0, true);
        eq.set_band_frequency(0, 2000.0);
        assert_eq!(eq.bands[0].frequency, 2000.0);
    }

    #[test]
    fn test_out_of_bounds_band_ignored() {
        let mut eq = ParametricEq::new(48000.0);
        eq.set_band(MAX_BANDS + 1, BiquadType::Peaking, 1000.0, 1.0, 6.0, true);
        assert_eq!(eq.active_band_count(), 0);
    }

    #[test]
    fn test_reset_clears_state() {
        let mut eq = ParametricEq::new(48000.0);
        eq.set_band(0, BiquadType::Peaking, 1000.0, 1.0, 12.0, true);
        let mut buf = [1.0_f32; 256];
        eq.process_buffer(&mut buf);
        eq.reset();
        // After reset, processing should start fresh (no ringing)
        let mut zero_buf = [0.0_f32; 64];
        eq.process_buffer(&mut zero_buf);
        // Output should be very close to zero
        assert!(
            zero_buf[63].abs() < 0.001,
            "After reset, zero input should give ~zero output: {}",
            zero_buf[63]
        );
    }
}
