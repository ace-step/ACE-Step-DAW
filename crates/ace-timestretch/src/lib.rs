//! High-quality time-stretch and pitch-shift for ACE-Step DAW.
//!
//! Two processing modes:
//! - **Realtime**: Low-latency phase vocoder with split computation for AudioWorklet
//! - **Offline**: Multi-resolution phase vocoder with transient detection + splicing
//!
//! Key improvements over basic phase vocoder:
//! 1. Transient detection via spectral flux
//! 2. Time-domain splicing around transients (prevents smearing)
//! 3. Identity phase locking (Laroche & Dolson 1999)
//! 4. Multi-resolution FFT (adaptive window size)

#[cfg(feature = "std")]
use std::vec::Vec;
#[cfg(not(feature = "std"))]
extern crate alloc;
#[cfg(not(feature = "std"))]
use alloc::vec::Vec;

mod transient;
mod vocoder;
mod resample;

pub use transient::{detect_transients, TransientInfo};
pub use vocoder::{StretchEngine, StretchParams, StretchQuality};
pub use resample::pitch_shift;

/// Time-stretch audio offline at the highest quality.
///
/// This is the main entry point for offline/export rendering.
/// Uses multi-resolution phase vocoder with transient detection + splicing.
pub fn stretch_offline(input: &[f32], sample_rate: u32, factor: f64, quality: StretchQuality) -> Vec<f32> {
    let mut engine = StretchEngine::new(StretchParams {
        sample_rate,
        quality,
        ..Default::default()
    });
    engine.process_offline(input, factor)
}

/// Time-stretch audio in real-time incremental mode.
///
/// Call repeatedly with small input blocks (e.g., 128 samples from AudioWorklet).
/// Returns processed output samples.
pub fn stretch_realtime(engine: &mut StretchEngine, input: &[f32], factor: f64) -> Vec<f32> {
    engine.set_stretch_factor(factor);
    engine.process_block(input)
}

#[cfg(test)]
mod tests {
    use super::*;
    use core::f64::consts::PI;

    const SR: u32 = 48000;

    fn sine_wave(freq: f64, duration_secs: f64) -> Vec<f32> {
        let n = (SR as f64 * duration_secs) as usize;
        (0..n)
            .map(|i| (2.0 * PI * freq * i as f64 / SR as f64).sin() as f32)
            .collect()
    }

    #[test]
    fn offline_stretch_doubles_length() {
        let input = sine_wave(440.0, 1.0);
        let output = stretch_offline(&input, SR, 2.0, StretchQuality::Standard);
        let ratio = output.len() as f64 / input.len() as f64;
        assert!((ratio - 2.0).abs() < 0.3, "2x stretch ratio: {ratio:.2}");
    }

    #[test]
    fn offline_stretch_halves_length() {
        let input = sine_wave(440.0, 1.0);
        let output = stretch_offline(&input, SR, 0.5, StretchQuality::Standard);
        let ratio = output.len() as f64 / input.len() as f64;
        assert!((ratio - 0.5).abs() < 0.2, "0.5x stretch ratio: {ratio:.2}");
    }

    #[test]
    fn offline_stretch_preserves_energy() {
        let input = sine_wave(440.0, 0.5);
        let output = stretch_offline(&input, SR, 1.0, StretchQuality::Standard);
        let in_e: f64 = input.iter().map(|&s| (s as f64).powi(2)).sum();
        let out_e: f64 = output.iter().map(|&s| (s as f64).powi(2)).sum();
        let ratio = out_e / in_e;
        assert!(ratio > 0.3 && ratio < 3.0, "Energy ratio: {ratio:.2}");
    }

    #[test]
    fn offline_high_quality_not_silent() {
        let input = sine_wave(1000.0, 0.5);
        let output = stretch_offline(&input, SR, 1.5, StretchQuality::High);
        let energy: f64 = output.iter().map(|&s| (s as f64).powi(2)).sum();
        assert!(energy > 1.0, "Output should not be silent: energy={energy}");
    }

    #[test]
    fn transient_detection_finds_clicks() {
        // Silence with a click at 0.5s
        let mut input = vec![0.0f32; 48000];
        for i in 24000..24050 {
            input[i] = 0.9;
        }
        let transients = detect_transients(&input, SR, 1024);
        assert!(!transients.is_empty(), "Should detect at least one transient");
        // The click is near sample 24000
        let has_near = transients.iter().any(|t| (t.sample_pos as i64 - 24000).unsigned_abs() < 2048);
        assert!(has_near, "Transient should be near sample 24000, found: {:?}", transients);
    }

    #[test]
    fn realtime_engine_produces_output() {
        let mut engine = StretchEngine::new(StretchParams {
            sample_rate: SR,
            quality: StretchQuality::Realtime,
            ..Default::default()
        });
        let input = sine_wave(440.0, 0.1);
        // Feed in chunks
        let mut total_output = Vec::new();
        for chunk in input.chunks(128) {
            let out = stretch_realtime(&mut engine, chunk, 1.0);
            total_output.extend_from_slice(&out);
        }
        // Should produce roughly the same amount
        assert!(total_output.len() > input.len() / 2, "Should produce output");
    }

    #[test]
    fn pitch_shift_preserves_duration() {
        let input = sine_wave(440.0, 0.5);
        let output = pitch_shift(&input, SR, 2.0); // +2 semitones
        let ratio = output.len() as f64 / input.len() as f64;
        assert!((ratio - 1.0).abs() < 0.15, "Pitch shift should preserve duration: ratio={ratio:.2}");
    }
}
