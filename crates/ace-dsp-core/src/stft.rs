//! STFT (Short-Time Fourier Transform) framework.
//!
//! Analysis/synthesis pair with overlap-add for spectral processing.
//! Used by the phase vocoder for time-stretching and pitch correction.

use rustfft::{num_complex::Complex, FftPlanner};

#[cfg(feature = "std")]
use std::vec::Vec;
#[cfg(not(feature = "std"))]
use alloc::vec::Vec;

use core::f64::consts::PI;

/// Generate a Hann window of the given length.
pub fn hann_window(length: usize) -> Vec<f64> {
    (0..length)
        .map(|i| {
            let t = i as f64 / length as f64;
            0.5 * (1.0 - (2.0 * PI * t).cos())
        })
        .collect()
}

/// STFT analysis/synthesis engine.
///
/// Performs windowed FFT analysis and overlap-add synthesis with configurable
/// FFT size and hop size. The hop ratio determines the time-stretch factor.
pub struct Stft {
    fft_size: usize,
    analysis_hop: usize,
    window: Vec<f64>,
    // FFT buffers
    fft_buffer: Vec<Complex<f64>>,
    scratch: Vec<Complex<f64>>,
    // Pre-planned FFT
    fft_forward: std::sync::Arc<dyn rustfft::Fft<f64>>,
    fft_inverse: std::sync::Arc<dyn rustfft::Fft<f64>>,
}

impl Stft {
    /// Create a new STFT engine.
    ///
    /// - `fft_size`: FFT window size (must be power of 2: 1024, 2048, 4096, 8192)
    /// - `analysis_hop`: hop size for analysis (typically fft_size/4 for 75% overlap)
    pub fn new(fft_size: usize, analysis_hop: usize) -> Self {
        let mut planner = FftPlanner::new();
        let fft_forward = planner.plan_fft_forward(fft_size);
        let fft_inverse = planner.plan_fft_inverse(fft_size);

        Self {
            fft_size,
            analysis_hop,
            window: hann_window(fft_size),
            fft_buffer: vec![Complex::new(0.0, 0.0); fft_size],
            scratch: vec![Complex::new(0.0, 0.0); fft_size],
            fft_forward,
            fft_inverse,
        }
    }

    /// Perform forward FFT on a windowed frame.
    ///
    /// `input` must be at least `fft_size` samples.
    /// Returns magnitude and phase arrays.
    pub fn analyze(&mut self, input: &[f32]) -> (Vec<f64>, Vec<f64>) {
        let n = self.fft_size;

        // Window the input
        for i in 0..n {
            let sample = if i < input.len() { input[i] as f64 } else { 0.0 };
            self.fft_buffer[i] = Complex::new(sample * self.window[i], 0.0);
        }

        // Forward FFT
        self.fft_forward
            .process_with_scratch(&mut self.fft_buffer, &mut self.scratch);

        // Extract magnitude and phase
        let half = n / 2 + 1;
        let mut magnitudes = Vec::with_capacity(half);
        let mut phases = Vec::with_capacity(half);

        for i in 0..half {
            let c = self.fft_buffer[i];
            magnitudes.push((c.re * c.re + c.im * c.im).sqrt());
            phases.push(c.im.atan2(c.re));
        }

        (magnitudes, phases)
    }

    /// Perform inverse FFT and return a windowed time-domain frame.
    ///
    /// `magnitudes` and `phases` should come from `analyze()` (length = fft_size/2 + 1).
    pub fn synthesize(&mut self, magnitudes: &[f64], phases: &[f64]) -> Vec<f32> {
        let n = self.fft_size;
        let half = n / 2 + 1;

        // Reconstruct complex spectrum
        for i in 0..half {
            let mag = if i < magnitudes.len() { magnitudes[i] } else { 0.0 };
            let phase = if i < phases.len() { phases[i] } else { 0.0 };
            self.fft_buffer[i] = Complex::new(mag * phase.cos(), mag * phase.sin());
        }

        // Mirror for negative frequencies (conjugate symmetry)
        for i in 1..n / 2 {
            self.fft_buffer[n - i] = self.fft_buffer[i].conj();
        }

        // Inverse FFT
        self.fft_inverse
            .process_with_scratch(&mut self.fft_buffer, &mut self.scratch);

        // Window and normalize
        let norm = 1.0 / n as f64;
        (0..n)
            .map(|i| (self.fft_buffer[i].re * norm * self.window[i]) as f32)
            .collect()
    }

    pub fn fft_size(&self) -> usize {
        self.fft_size
    }

    pub fn analysis_hop(&self) -> usize {
        self.analysis_hop
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_preserves_signal() {
        let mut stft = Stft::new(1024, 256);

        // Create a sine wave
        let input: Vec<f32> = (0..1024)
            .map(|i| (2.0 * PI * 440.0 * i as f64 / 48000.0).sin() as f32)
            .collect();

        let (mag, phase) = stft.analyze(&input);
        let output = stft.synthesize(&mag, &phase);

        // The windowed output should correlate with the windowed input
        let window = hann_window(1024);
        let mut input_energy = 0.0f64;
        let mut output_energy = 0.0f64;
        let mut correlation = 0.0f64;

        for i in 0..1024 {
            let wi = input[i] as f64 * window[i];
            let wo = output[i] as f64;
            input_energy += wi * wi;
            output_energy += wo * wo;
            correlation += wi * wo;
        }

        // Normalized correlation should be high
        let norm_corr = correlation / (input_energy.sqrt() * output_energy.sqrt() + 1e-20);
        assert!(
            norm_corr > 0.95,
            "STFT roundtrip correlation: {norm_corr:.4}"
        );
    }

    #[test]
    fn hann_window_properties() {
        let w = hann_window(1024);
        assert_eq!(w.len(), 1024);
        // First and last values should be near zero
        assert!(w[0].abs() < 0.001, "Window start: {}", w[0]);
        // Peak should be at center
        assert!((w[512] - 1.0).abs() < 0.01, "Window center: {}", w[512]);
    }

    #[test]
    fn dc_signal_roundtrip() {
        let mut stft = Stft::new(512, 128);
        let input = vec![0.5f32; 512];

        let (mag, phase) = stft.analyze(&input);
        let output = stft.synthesize(&mag, &phase);

        // DC component should be preserved (windowed)
        let window = hann_window(512);
        let expected_center = 0.5 * window[256]; // DC * window at center
        let actual_center = output[256] as f64;
        assert!(
            (actual_center - expected_center).abs() < 0.01,
            "DC roundtrip at center: expected {expected_center:.4}, got {actual_center:.4}"
        );
    }
}
