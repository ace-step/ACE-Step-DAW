//! ACE DSP WASM — WebAssembly bindings for the DSP engine.
//!
//! This crate exposes `ace-dsp-core` to JavaScript via `wasm-bindgen`.
//! Each effect type gets a WASM-friendly wrapper that manages its own
//! state and provides `process()` / `set_param()` methods.

use wasm_bindgen::prelude::*;

// Re-export core types for internal use
use ace_dsp_core::biquad::{BiquadCoeffs, BiquadStereo, FilterType};
use ace_dsp_core::delay::FeedbackDelay;

// ── Smoke test ──────────────────────────────────────────────────────

/// Pipeline smoke test: verifies Rust → WASM → JS works end-to-end.
#[wasm_bindgen]
pub fn add(a: f32, b: f32) -> f32 {
    ace_dsp_core::add(a, b)
}

/// Return the DSP engine version string.
#[wasm_bindgen]
pub fn dsp_version() -> String {
    format!("ace-dsp {}", env!("CARGO_PKG_VERSION"))
}

// ── Biquad Filter ───────────────────────────────────────────────────

/// Map JS filter type string to Rust enum.
fn parse_filter_type(s: &str) -> FilterType {
    match s {
        "lowpass" => FilterType::Lowpass,
        "highpass" => FilterType::Highpass,
        "bandpass" => FilterType::Bandpass,
        "bandpassPeak" => FilterType::BandpassPeak,
        "notch" => FilterType::Notch,
        "peaking" => FilterType::Peaking,
        "lowshelf" => FilterType::LowShelf,
        "highshelf" => FilterType::HighShelf,
        "allpass" => FilterType::Allpass,
        _ => FilterType::Lowpass,
    }
}

/// Stereo biquad filter exposed to JS.
#[wasm_bindgen]
pub struct WasmBiquadStereo {
    inner: BiquadStereo,
    sample_rate: f64,
}

#[wasm_bindgen]
impl WasmBiquadStereo {
    /// Create a new stereo biquad filter.
    #[wasm_bindgen(constructor)]
    pub fn new(
        filter_type: &str,
        freq: f64,
        q: f64,
        gain_db: f64,
        sample_rate: f64,
    ) -> WasmBiquadStereo {
        let ft = parse_filter_type(filter_type);
        let coeffs = BiquadCoeffs::new(ft, freq, q, gain_db, sample_rate);
        WasmBiquadStereo {
            inner: BiquadStereo::new(coeffs),
            sample_rate,
        }
    }

    /// Update filter parameters.
    pub fn set_params(&mut self, filter_type: &str, freq: f64, q: f64, gain_db: f64) {
        let ft = parse_filter_type(filter_type);
        let coeffs = BiquadCoeffs::new(ft, freq, q, gain_db, self.sample_rate);
        self.inner.set_coeffs(coeffs);
    }

    /// Process interleaved stereo buffer in-place.
    /// The buffer should be [L0, R0, L1, R1, ...].
    pub fn process_interleaved(&mut self, buffer: &mut [f32]) {
        self.inner.process_interleaved(buffer);
    }

    /// Process separate left and right channel buffers.
    pub fn process_split(&mut self, left: &mut [f32], right: &mut [f32]) {
        self.inner.process_split(left, right);
    }

    /// Calculate magnitude response in dB at given frequencies.
    /// Returns an array of dB values, one per input frequency.
    pub fn magnitude_response(&self, frequencies: &[f32]) -> Vec<f32> {
        // Access coefficients via a temporary mono filter to get the response
        let coeffs = BiquadCoeffs::new(
            FilterType::Lowpass, 1000.0, 0.707, 0.0, self.sample_rate,
        );
        // We need access to the inner coeffs — for now, reconstruct
        // TODO: expose coeffs getter from BiquadStereo
        let _ = coeffs;
        frequencies
            .iter()
            .map(|&f| {
                // Placeholder — will be implemented when coeffs are accessible
                let _ = f;
                0.0
            })
            .collect()
    }

    /// Reset filter state to silence.
    pub fn reset(&mut self) {
        self.inner.reset();
    }
}

// ── Delay Line ──────────────────────────────────────────────────────

/// Feedback delay effect exposed to JS.
#[wasm_bindgen]
pub struct WasmFeedbackDelay {
    inner: FeedbackDelay,
}

#[wasm_bindgen]
impl WasmFeedbackDelay {
    /// Create a new feedback delay.
    ///
    /// - `max_delay_ms`: maximum delay capacity in milliseconds
    /// - `delay_ms`: initial delay time in milliseconds
    /// - `feedback`: feedback gain (0.0–0.95)
    /// - `wet`: wet/dry mix (0.0–1.0)
    /// - `sample_rate`: sample rate in Hz
    #[wasm_bindgen(constructor)]
    pub fn new(
        max_delay_ms: f64,
        delay_ms: f64,
        feedback: f32,
        wet: f32,
        sample_rate: f64,
    ) -> WasmFeedbackDelay {
        let max_samples = (max_delay_ms * sample_rate / 1000.0) as usize;
        let delay_samples = delay_ms * sample_rate / 1000.0;
        WasmFeedbackDelay {
            inner: FeedbackDelay::new(max_samples, delay_samples, feedback, wet),
        }
    }

    pub fn set_delay_ms(&mut self, delay_ms: f64, sample_rate: f64) {
        self.inner
            .set_delay_time(delay_ms * sample_rate / 1000.0);
    }

    pub fn set_feedback(&mut self, feedback: f32) {
        self.inner.set_feedback(feedback);
    }

    pub fn set_wet(&mut self, wet: f32) {
        self.inner.set_wet(wet);
    }

    /// Process a mono buffer in-place.
    pub fn process_block(&mut self, buffer: &mut [f32]) {
        self.inner.process_block(buffer);
    }

    pub fn clear(&mut self) {
        self.inner.clear();
    }
}
