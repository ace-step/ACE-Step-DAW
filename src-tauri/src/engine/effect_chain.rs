//! Per-track effect chain wrapping `ace-dsp-core` algorithms.
//!
//! Each track gets a pre-allocated `TrackEffects` holding one instance
//! of each supported effect type. Effects are always present in memory
//! but only processed when their `enabled` flag is true — this avoids
//! any heap allocation on the audio thread when toggling effects.
//!
//! Processing order: **EQ → Compressor** (standard DAW insert chain).
//!
//! # Supported effects (2B-3)
//!
//! - 3-band EQ via `ace_dsp_core::eq::ParametricEq` (bands 0–2 mapped
//!   to low/mid/high shelf/peak)
//! - Compressor via `ace_dsp_core::dynamics::Compressor`
//!
//! Reverb and additional effects will be added in follow-up PRs.

use ace_dsp_core::biquad::BiquadType;
use ace_dsp_core::dynamics::Compressor;
use ace_dsp_core::eq::ParametricEq;

use super::graph::MAX_TRACKS;

/// Default EQ frequencies for the 3-band layout matching the Web Audio
/// bridge's `eqLowGain` / `eqMidGain` / `eqHighGain` params.
/// Aligned with the Web Audio mixer's TrackNode EQ (250 / 1k / 8k Hz,
/// Q=1.0) so the same `eqLowGain/eqMidGain/eqHighGain` values produce
/// matching sonic results across both backends. Found by codex review
/// on PR #1705 — original constants (200/1000/5000, Q=0.707) diverged.
const EQ_LOW_FREQ: f32 = 250.0;
const EQ_MID_FREQ: f32 = 1000.0;
const EQ_HIGH_FREQ: f32 = 8000.0;
const EQ_Q: f32 = 1.0;

/// Per-track effect instances.
pub struct TrackEffects {
    pub eq: ParametricEq,
    pub eq_enabled: bool,
    pub compressor: Compressor,
    pub compressor_enabled: bool,
}

impl TrackEffects {
    pub fn new(sample_rate: f32) -> Self {
        Self {
            eq: ParametricEq::new(sample_rate),
            eq_enabled: false,
            compressor: Compressor::new(
                sample_rate,
                -20.0, // threshold
                4.0,   // ratio
                10.0,  // attack ms
                100.0, // release ms
                3.0,   // knee dB
                0.0,   // makeup gain
            ),
            compressor_enabled: false,
        }
    }

    /// Set 3-band EQ gains. Enables the EQ if any gain is non-zero.
    pub fn set_eq_params(&mut self, low_db: f32, mid_db: f32, high_db: f32) {
        self.eq.set_band(0, BiquadType::LowShelf, EQ_LOW_FREQ, EQ_Q, low_db, low_db.abs() > 0.01);
        self.eq.set_band(1, BiquadType::Peaking, EQ_MID_FREQ, EQ_Q, mid_db, mid_db.abs() > 0.01);
        self.eq.set_band(2, BiquadType::HighShelf, EQ_HIGH_FREQ, EQ_Q, high_db, high_db.abs() > 0.01);
        self.eq_enabled = low_db.abs() > 0.01 || mid_db.abs() > 0.01 || high_db.abs() > 0.01;
    }

    /// Set compressor parameters.
    pub fn set_compressor_params(&mut self, enabled: bool, threshold_db: f32, ratio: f32) {
        self.compressor_enabled = enabled;
        self.compressor.set_threshold(threshold_db);
        self.compressor.set_ratio(ratio);
    }

    /// Process a mono buffer through the enabled effects in series.
    /// EQ → Compressor. Zero allocation.
    #[inline]
    pub fn process(&mut self, buffer: &mut [f32]) {
        if self.eq_enabled {
            self.eq.process_buffer(buffer);
        }
        if self.compressor_enabled {
            self.compressor.process_buffer(buffer);
        }
    }

    /// Reset all effect state (filter histories, envelope followers).
    pub fn reset(&mut self) {
        self.eq.reset();
        self.eq_enabled = false;
        self.compressor.reset();
        self.compressor_enabled = false;
    }
}

/// Pre-allocate `MAX_TRACKS` effect chains at engine start.
pub fn create_effect_chains(sample_rate: f32) -> Vec<TrackEffects> {
    (0..MAX_TRACKS)
        .map(|_| TrackEffects::new(sample_rate))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const SR: f32 = 48_000.0;

    fn sine_buffer(freq: f32, amplitude: f32, samples: usize) -> Vec<f32> {
        (0..samples)
            .map(|i| amplitude * (std::f32::consts::TAU * freq * i as f32 / SR).sin())
            .collect()
    }

    #[test]
    fn disabled_effects_are_transparent() {
        let mut fx = TrackEffects::new(SR);
        let mut buf = vec![0.5_f32; 256];
        let original = buf.clone();
        fx.process(&mut buf);
        assert_eq!(buf, original, "disabled effects must be transparent");
    }

    #[test]
    fn eq_boost_increases_level() {
        let mut fx = TrackEffects::new(SR);
        fx.set_eq_params(0.0, 12.0, 0.0); // +12 dB mid

        // Generate 1 kHz sine (center of mid band).
        let mut buf = sine_buffer(1000.0, 0.5, 4096);
        fx.process(&mut buf);

        // RMS of the processed tail should be higher than input.
        let rms: f32 = buf[2048..].iter().map(|x| x * x).sum::<f32>() / 2048.0;
        let rms = rms.sqrt();
        let input_rms = 0.5 / 2.0_f32.sqrt();
        assert!(
            rms > input_rms * 1.5,
            "12 dB EQ boost should increase RMS: got {rms}, input {input_rms}"
        );
    }

    #[test]
    fn compressor_reduces_peak() {
        let mut fx = TrackEffects::new(SR);
        fx.set_compressor_params(true, -20.0, 8.0); // heavy compression

        // Loud signal: 0.9 amplitude ≈ -1 dBFS, well above -20 threshold.
        let mut buf = sine_buffer(440.0, 0.9, 8192);
        fx.process(&mut buf);

        // Peak of compressed output should be lower than input peak.
        let peak = buf[4096..].iter().map(|s| s.abs()).fold(0.0_f32, f32::max);
        assert!(
            peak < 0.9,
            "compressor should reduce peak: got {peak}, input was 0.9"
        );
    }

    #[test]
    fn eq_and_compressor_chain_runs_without_panic() {
        let mut fx = TrackEffects::new(SR);
        fx.set_eq_params(6.0, -3.0, 6.0);
        fx.set_compressor_params(true, -10.0, 4.0);

        let mut buf = sine_buffer(440.0, 0.7, 1024);
        fx.process(&mut buf); // should not panic
    }

    #[test]
    fn create_effect_chains_allocates_max_tracks() {
        let chains = create_effect_chains(SR);
        assert_eq!(chains.len(), MAX_TRACKS);
    }
}
