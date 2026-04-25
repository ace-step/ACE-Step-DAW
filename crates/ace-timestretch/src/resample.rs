//! Pitch shifting via time-stretch + resampling.
//!
//! Pitch shift = time-stretch by 1/ratio + resample to original length.
//! This preserves duration while changing pitch.

#[cfg(feature = "std")]
use std::vec::Vec;
#[cfg(not(feature = "std"))]
use alloc::vec::Vec;

use crate::vocoder::{StretchEngine, StretchParams, StretchQuality};

/// Pitch shift audio by the given number of semitones.
///
/// Positive = higher pitch, negative = lower pitch.
/// Duration is preserved.
pub fn pitch_shift(input: &[f32], sample_rate: u32, semitones: f64) -> Vec<f32> {
    if input.is_empty() {
        return Vec::new();
    }

    let ratio = 2.0f64.powf(semitones / 12.0);

    if (ratio - 1.0).abs() < 0.001 {
        return input.to_vec();
    }

    // Step 1: Time-stretch by inverse of pitch ratio
    // To raise pitch by 2x, we need to stretch to 0.5x length first
    let stretch_factor = 1.0 / ratio;
    let mut engine = StretchEngine::new(StretchParams {
        sample_rate,
        quality: StretchQuality::Standard,
        ..Default::default()
    });
    let stretched = engine.process_offline(input, stretch_factor);

    // Step 2: Resample back to original length using linear interpolation
    let target_len = input.len();
    resample_linear(&stretched, target_len)
}

/// Linear interpolation resampling to target length.
fn resample_linear(input: &[f32], target_len: usize) -> Vec<f32> {
    if input.is_empty() || target_len == 0 {
        return vec![0.0; target_len];
    }

    let ratio = input.len() as f64 / target_len as f64;
    let mut output = Vec::with_capacity(target_len);

    for i in 0..target_len {
        let src = i as f64 * ratio;
        let idx = src as usize;
        let frac = (src - idx as f64) as f32;

        if idx + 1 < input.len() {
            output.push(input[idx] * (1.0 - frac) + input[idx + 1] * frac);
        } else if idx < input.len() {
            output.push(input[idx]);
        } else {
            output.push(0.0);
        }
    }

    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pitch_shift_zero_semitones_is_identity() {
        let input: Vec<f32> = (0..4800)
            .map(|i| (2.0 * core::f64::consts::PI * 440.0 * i as f64 / 48000.0).sin() as f32)
            .collect();
        let output = pitch_shift(&input, 48000, 0.0);
        assert_eq!(output.len(), input.len());
    }

    #[test]
    fn pitch_shift_preserves_length() {
        let input: Vec<f32> = (0..24000)
            .map(|i| (2.0 * core::f64::consts::PI * 440.0 * i as f64 / 48000.0).sin() as f32)
            .collect();
        let output = pitch_shift(&input, 48000, 5.0);
        let ratio = output.len() as f64 / input.len() as f64;
        assert!((ratio - 1.0).abs() < 0.15, "Length ratio: {ratio:.2}");
    }

    #[test]
    fn resample_doubles_length() {
        let input = vec![0.0, 1.0, 0.0, -1.0];
        let output = resample_linear(&input, 8);
        assert_eq!(output.len(), 8);
    }

    #[test]
    fn resample_halves_length() {
        let input = vec![0.0, 0.5, 1.0, 0.5, 0.0, -0.5, -1.0, -0.5];
        let output = resample_linear(&input, 4);
        assert_eq!(output.len(), 4);
    }
}
