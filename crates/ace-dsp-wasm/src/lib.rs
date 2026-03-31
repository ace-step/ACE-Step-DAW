//! ACE-Step DSP WASM — wasm-bindgen exports for AudioWorklet processing.
//!
//! This crate exposes the DSP engine to JavaScript via wasm-bindgen.
//! The primary consumer is the AudioWorklet processor (`wasm-dsp-processor.js`).

use wasm_bindgen::prelude::*;
use ace_dsp_core::biquad::{BiquadCoeffs, BiquadFilter, BiquadType};
use ace_dsp_core::gain::GainProcessor;

/// WASM-exported DSP processor that handles a chain of effects for one track.
///
/// Designed to be instantiated once per AudioWorkletNode and called from
/// the worklet's `process()` method on every audio render quantum (128 frames).
#[wasm_bindgen]
pub struct DspProcessor {
    gain: GainProcessor,
    filter: Option<BiquadFilter>,
    sample_rate: f32,
}

#[wasm_bindgen]
impl DspProcessor {
    /// Create a new DSP processor.
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: f32) -> Self {
        Self {
            gain: GainProcessor::new(1.0),
            filter: None,
            sample_rate,
        }
    }

    /// Set gain value (linear, 0.0 to ~2.0).
    pub fn set_gain(&mut self, gain: f32) {
        self.gain.set_gain(gain);
    }

    /// Enable a biquad filter with the given parameters.
    /// filter_type: 0=LP, 1=HP, 2=BP, 3=Notch, 4=Allpass, 5=Peaking, 6=LowShelf, 7=HighShelf
    pub fn set_filter(&mut self, filter_type: u8, frequency: f32, q: f32, gain_db: f32) {
        let ft = match filter_type {
            0 => BiquadType::Lowpass,
            1 => BiquadType::Highpass,
            2 => BiquadType::Bandpass,
            3 => BiquadType::Notch,
            4 => BiquadType::Allpass,
            5 => BiquadType::Peaking,
            6 => BiquadType::LowShelf,
            7 => BiquadType::HighShelf,
            _ => BiquadType::Lowpass,
        };
        let coeffs = BiquadCoeffs::compute(ft, self.sample_rate, frequency, q, gain_db);
        match &mut self.filter {
            Some(f) => f.set_coeffs(coeffs),
            None => self.filter = Some(BiquadFilter::new(coeffs)),
        }
    }

    /// Disable the filter.
    pub fn disable_filter(&mut self) {
        self.filter = None;
    }

    /// Process a mono audio buffer in-place.
    /// Called from the AudioWorklet's process() method.
    pub fn process_mono(&mut self, buffer: &mut [f32]) {
        // Apply filter first (if enabled)
        if let Some(ref mut filter) = self.filter {
            filter.process_buffer(buffer);
        }
        // Then gain
        self.gain.process_mono(buffer);
    }

    /// Process interleaved stereo audio buffer in-place.
    /// Samples arranged as [L, R, L, R, ...].
    pub fn process_stereo_interleaved(&mut self, buffer: &mut [f32]) {
        // For stereo, we process all samples through gain
        // Filter is applied per-sample (mono processing on interleaved data)
        if let Some(ref mut filter) = self.filter {
            filter.process_buffer(buffer);
        }
        self.gain.process_stereo_interleaved(buffer);
    }

    /// Get the current gain value.
    pub fn get_gain(&self) -> f32 {
        self.gain.gain()
    }

    /// Reset all processor state (call on seek or transport stop).
    pub fn reset(&mut self) {
        if let Some(ref mut filter) = self.filter {
            filter.reset();
        }
    }
}

/// Version string for debugging.
#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_processor_creation() {
        let proc = DspProcessor::new(48000.0);
        assert_eq!(proc.get_gain(), 1.0);
    }

    #[test]
    fn test_processor_gain() {
        let mut proc = DspProcessor::new(48000.0);
        proc.set_gain(0.5);
        let mut buf = [1.0_f32, -1.0, 0.5, 0.0];
        proc.process_mono(&mut buf);
        assert_eq!(buf, [0.5, -0.5, 0.25, 0.0]);
    }

    #[test]
    fn test_processor_with_filter() {
        let mut proc = DspProcessor::new(48000.0);
        proc.set_filter(0, 1000.0, 0.707, 0.0); // Lowpass at 1kHz
        let mut buf = [1.0_f32; 128];
        proc.process_mono(&mut buf);
        // Filter should process without panic; DC should pass through lowpass
        assert!(buf[127] > 0.5); // DC passes through lowpass
    }

    #[test]
    fn test_processor_disable_filter() {
        let mut proc = DspProcessor::new(48000.0);
        proc.set_filter(0, 1000.0, 0.707, 0.0);
        proc.disable_filter();
        let mut buf = [0.75_f32; 4];
        proc.set_gain(1.0);
        proc.process_mono(&mut buf);
        // With no filter and unity gain, output should equal input
        assert_eq!(buf, [0.75, 0.75, 0.75, 0.75]);
    }

    #[test]
    fn test_processor_reset() {
        let mut proc = DspProcessor::new(48000.0);
        proc.set_filter(0, 1000.0, 0.707, 0.0);
        let mut buf = [1.0_f32; 64];
        proc.process_mono(&mut buf);
        proc.reset(); // Should not panic
    }

    #[test]
    fn test_version() {
        let v = version();
        assert!(!v.is_empty());
        assert!(v.starts_with("0."));
    }
}
