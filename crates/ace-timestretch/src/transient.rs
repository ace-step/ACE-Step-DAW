//! Transient detection via spectral flux.
//!
//! Detects onsets/transients in audio so the stretcher can apply
//! time-domain splicing around them instead of phase vocoder processing.
//! This is the key quality differentiator vs basic phase vocoder.

#[cfg(feature = "std")]
use std::vec::Vec;
#[cfg(not(feature = "std"))]
use alloc::vec::Vec;

use rustfft::{num_complex::Complex, FftPlanner};

/// A detected transient position.
#[derive(Debug, Clone, Copy)]
pub struct TransientInfo {
    /// Sample position of the transient.
    pub sample_pos: usize,
    /// Strength of the transient (spectral flux magnitude).
    pub strength: f64,
}

/// Detect transients in audio using spectral flux.
///
/// Returns a list of transient positions sorted by sample position.
/// - `hop_size`: FFT hop size (typically fft_size / 4)
pub fn detect_transients(input: &[f32], sample_rate: u32, hop_size: usize) -> Vec<TransientInfo> {
    let fft_size = hop_size * 4; // 75% overlap
    if input.len() < fft_size {
        return Vec::new();
    }

    let half = fft_size / 2 + 1;
    let mut planner = FftPlanner::new();
    let fft = planner.plan_fft_forward(fft_size);

    // Hann window
    let window: Vec<f64> = (0..fft_size)
        .map(|i| {
            let t = i as f64 / fft_size as f64;
            0.5 * (1.0 - (2.0 * core::f64::consts::PI * t).cos())
        })
        .collect();

    let num_frames = (input.len() - fft_size) / hop_size + 1;
    let mut prev_magnitudes = vec![0.0f64; half];
    let mut flux_values: Vec<(usize, f64)> = Vec::with_capacity(num_frames);

    for frame_idx in 0..num_frames {
        let start = frame_idx * hop_size;
        if start + fft_size > input.len() {
            break;
        }

        // Windowed FFT
        let mut buffer: Vec<Complex<f64>> = (0..fft_size)
            .map(|i| Complex::new(input[start + i] as f64 * window[i], 0.0))
            .collect();
        fft.process(&mut buffer);

        // Compute magnitudes
        let magnitudes: Vec<f64> = (0..half).map(|k| buffer[k].norm()).collect();

        // Spectral flux: sum of positive magnitude differences
        let mut flux = 0.0f64;
        for k in 0..half {
            let diff = magnitudes[k] - prev_magnitudes[k];
            if diff > 0.0 {
                flux += diff;
            }
        }

        flux_values.push((start + fft_size / 2, flux)); // center of frame
        prev_magnitudes = magnitudes;
    }

    if flux_values.is_empty() {
        return Vec::new();
    }

    // Adaptive threshold: median flux * multiplier
    let mut sorted_flux: Vec<f64> = flux_values.iter().map(|&(_, f)| f).collect();
    sorted_flux.sort_by(|a, b| a.partial_cmp(b).unwrap_or(core::cmp::Ordering::Equal));
    let median = sorted_flux[sorted_flux.len() / 2];
    let threshold = median * 3.0 + 0.01; // 3x median, small floor for silence

    // Peak-pick: flux above threshold and local maximum
    let min_gap_samples = (sample_rate as f64 * 0.05) as usize; // 50ms min gap
    let mut transients = Vec::new();
    let mut last_pos = 0usize;

    for i in 1..flux_values.len().saturating_sub(1) {
        let (pos, flux) = flux_values[i];
        let prev_flux = flux_values[i - 1].1;
        let next_flux = flux_values[i + 1].1;

        if flux > threshold && flux >= prev_flux && flux >= next_flux {
            if transients.is_empty() || pos.saturating_sub(last_pos) >= min_gap_samples {
                transients.push(TransientInfo {
                    sample_pos: pos,
                    strength: flux,
                });
                last_pos = pos;
            }
        }
    }

    transients
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_transients_in_silence() {
        let input = vec![0.0f32; 48000];
        let t = detect_transients(&input, 48000, 1024);
        assert!(t.is_empty(), "Silence should have no transients");
    }

    #[test]
    fn no_transients_in_steady_sine() {
        let input: Vec<f32> = (0..48000)
            .map(|i| (2.0 * core::f64::consts::PI * 440.0 * i as f64 / 48000.0).sin() as f32)
            .collect();
        let t = detect_transients(&input, 48000, 1024);
        // A steady sine might trigger one at the onset, but should be few
        assert!(t.len() <= 2, "Steady sine should have few transients: found {}", t.len());
    }

    #[test]
    fn detects_impulse() {
        let mut input = vec![0.0f32; 96000];
        // Sharp click at 1s
        for i in 48000..48010 {
            input[i] = 1.0;
        }
        let t = detect_transients(&input, 48000, 512);
        assert!(!t.is_empty(), "Should detect the click");
    }
}
