//! ACE-Step DSP WASM — wasm-bindgen exports for AudioWorklet processing.
//!
//! This crate exposes the DSP engine to JavaScript via wasm-bindgen.
//! The primary consumer is the AudioWorklet processor (`wasm-dsp-processor.js`).

use wasm_bindgen::prelude::*;
use ace_dsp_core::biquad::{BiquadCoeffs, BiquadFilter, BiquadType};
use ace_dsp_core::delay::MonoDelay;
use ace_dsp_core::dynamics::{Compressor, NoiseGate};
use ace_dsp_core::eq::ParametricEq;
use ace_dsp_core::gain::GainProcessor;

/// WASM-exported DSP processor that handles a chain of effects for one track.
///
/// Designed to be instantiated once per AudioWorkletNode and called from
/// the worklet's `process()` method on every audio render quantum (128 frames).
#[wasm_bindgen]
pub struct DspProcessor {
    gain: GainProcessor,
    filter: Option<BiquadFilter>,
    delay: Option<MonoDelay>,
    compressor: Option<Compressor>,
    gate: Option<NoiseGate>,
    eq: Option<ParametricEq>,
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
            delay: None,
            compressor: None,
            gate: None,
            eq: None,
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

    /// Enable a delay effect.
    /// - `delay_ms`: delay time in milliseconds
    /// - `feedback`: feedback amount (0.0 to 0.99)
    /// - `wet`: wet mix level (0.0 to 1.0)
    pub fn set_delay(&mut self, delay_ms: f32, feedback: f32, wet: f32) {
        let delay_samples = delay_ms * self.sample_rate / 1000.0;
        let max_samples = (2.0 * self.sample_rate) as usize; // 2 seconds max
        match &mut self.delay {
            Some(d) => {
                d.set_delay_samples(delay_samples);
                d.set_feedback(feedback);
                d.set_wet(wet);
            }
            None => {
                self.delay = Some(MonoDelay::new(max_samples, delay_samples, feedback, wet));
            }
        }
    }

    /// Update delay parameters without recreating.
    pub fn set_delay_params(&mut self, delay_ms: f32, feedback: f32, wet: f32, dry: f32) {
        if let Some(ref mut d) = self.delay {
            d.set_delay_samples(delay_ms * self.sample_rate / 1000.0);
            d.set_feedback(feedback);
            d.set_wet(wet);
            d.set_dry(dry);
        }
    }

    /// Disable the delay.
    pub fn disable_delay(&mut self) {
        self.delay = None;
    }

    /// Enable compressor.
    /// - `threshold_db`: compression threshold (e.g., -20)
    /// - `ratio`: compression ratio (e.g., 4.0 for 4:1)
    /// - `attack_ms`: attack time in ms
    /// - `release_ms`: release time in ms
    /// - `knee_db`: knee width (0 = hard knee)
    /// - `makeup_db`: makeup gain in dB
    pub fn set_compressor(
        &mut self,
        threshold_db: f32,
        ratio: f32,
        attack_ms: f32,
        release_ms: f32,
        knee_db: f32,
        makeup_db: f32,
    ) {
        match &mut self.compressor {
            Some(c) => {
                c.set_threshold(threshold_db);
                c.set_ratio(ratio);
                c.set_attack(attack_ms);
                c.set_release(release_ms);
                c.set_knee(knee_db);
                c.set_makeup_gain(makeup_db);
            }
            None => {
                self.compressor = Some(Compressor::new(
                    self.sample_rate,
                    threshold_db,
                    ratio,
                    attack_ms,
                    release_ms,
                    knee_db,
                    makeup_db,
                ));
            }
        }
    }

    /// Disable the compressor.
    pub fn disable_compressor(&mut self) {
        self.compressor = None;
    }

    /// Get current compressor gain reduction in dB.
    pub fn compressor_gr_db(&self) -> f32 {
        self.compressor
            .as_ref()
            .map(|c| c.gain_reduction_db())
            .unwrap_or(0.0)
    }

    /// Enable noise gate.
    /// - `threshold_db`: gate threshold
    /// - `attack_ms`: gate open time
    /// - `hold_ms`: hold time after signal drops
    /// - `release_ms`: gate close time
    /// - `range_db`: attenuation when closed (-80 = full gate, -12 = expander)
    pub fn set_gate(
        &mut self,
        threshold_db: f32,
        attack_ms: f32,
        hold_ms: f32,
        release_ms: f32,
        range_db: f32,
    ) {
        match &mut self.gate {
            Some(g) => {
                g.set_threshold(threshold_db);
                g.set_attack(attack_ms);
                g.set_hold(hold_ms);
                g.set_release(release_ms);
                g.set_range(range_db);
            }
            None => {
                self.gate = Some(NoiseGate::new(
                    self.sample_rate,
                    threshold_db,
                    attack_ms,
                    hold_ms,
                    release_ms,
                    range_db,
                ));
            }
        }
    }

    /// Disable the noise gate.
    pub fn disable_gate(&mut self) {
        self.gate = None;
    }

    /// Set a parametric EQ band.
    /// - `band_index`: 0-7
    /// - `filter_type`: 0=LP, 1=HP, 2=BP, 3=Notch, 4=Allpass, 5=Peaking, 6=LowShelf, 7=HighShelf
    /// - `frequency`: center frequency in Hz
    /// - `q`: Q factor
    /// - `gain_db`: gain in dB (for peaking/shelf types)
    /// - `enabled`: whether this band is active
    pub fn set_eq_band(
        &mut self,
        band_index: u8,
        filter_type: u8,
        frequency: f32,
        q: f32,
        gain_db: f32,
        enabled: bool,
    ) {
        let ft = match filter_type {
            0 => BiquadType::Lowpass,
            1 => BiquadType::Highpass,
            2 => BiquadType::Bandpass,
            3 => BiquadType::Notch,
            4 => BiquadType::Allpass,
            5 => BiquadType::Peaking,
            6 => BiquadType::LowShelf,
            7 => BiquadType::HighShelf,
            _ => BiquadType::Peaking,
        };
        let eq = self
            .eq
            .get_or_insert_with(|| ParametricEq::new(self.sample_rate));
        eq.set_band(band_index as usize, ft, frequency, q, gain_db, enabled);
    }

    /// Disable the parametric EQ entirely.
    pub fn disable_eq(&mut self) {
        self.eq = None;
    }

    /// Process a mono audio buffer in-place.
    /// Called from the AudioWorklet's process() method.
    /// Signal chain: Gate → Filter → EQ → Compressor → Delay → Gain
    pub fn process_mono(&mut self, buffer: &mut [f32]) {
        if let Some(ref mut gate) = self.gate {
            gate.process_buffer(buffer);
        }
        if let Some(ref mut filter) = self.filter {
            filter.process_buffer(buffer);
        }
        if let Some(ref mut eq) = self.eq {
            eq.process_buffer(buffer);
        }
        if let Some(ref mut compressor) = self.compressor {
            compressor.process_buffer(buffer);
        }
        if let Some(ref mut delay) = self.delay {
            delay.process_buffer(buffer);
        }
        self.gain.process_mono(buffer);
    }

    /// Process interleaved stereo audio buffer in-place.
    /// Samples arranged as [L, R, L, R, ...].
    pub fn process_stereo_interleaved(&mut self, buffer: &mut [f32]) {
        if let Some(ref mut gate) = self.gate {
            gate.process_buffer(buffer);
        }
        if let Some(ref mut filter) = self.filter {
            filter.process_buffer(buffer);
        }
        if let Some(ref mut eq) = self.eq {
            eq.process_buffer(buffer);
        }
        if let Some(ref mut compressor) = self.compressor {
            compressor.process_buffer(buffer);
        }
        if let Some(ref mut delay) = self.delay {
            delay.process_buffer(buffer);
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
        if let Some(ref mut delay) = self.delay {
            delay.reset();
        }
        if let Some(ref mut compressor) = self.compressor {
            compressor.reset();
        }
        if let Some(ref mut gate) = self.gate {
            gate.reset();
        }
        if let Some(ref mut eq) = self.eq {
            eq.reset();
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
    fn test_processor_delay() {
        let mut proc = DspProcessor::new(48000.0);
        proc.set_delay(10.0, 0.0, 1.0); // 10ms delay, no feedback, full wet
        proc.set_gain(1.0);

        // Process an impulse followed by silence
        let mut output = Vec::new();
        let mut buf = [1.0_f32];
        proc.process_mono(&mut buf);
        output.push(buf[0]);
        for _ in 1..600 {
            let mut buf = [0.0_f32];
            proc.process_mono(&mut buf);
            output.push(buf[0]);
        }

        // 10ms at 48kHz = 480 samples delay
        // The impulse should appear around sample 480
        assert!(output[480].abs() > 0.3, "Delayed impulse at 480: {}", output[480]);
    }

    #[test]
    fn test_processor_disable_delay() {
        let mut proc = DspProcessor::new(48000.0);
        proc.set_delay(10.0, 0.0, 1.0);
        proc.disable_delay();
        let mut buf = [0.5_f32; 4];
        proc.set_gain(1.0);
        proc.process_mono(&mut buf);
        // Dry signal should pass through unchanged (delay disabled)
        assert_eq!(buf, [0.5, 0.5, 0.5, 0.5]);
    }

    #[test]
    fn test_processor_compressor() {
        let mut proc = DspProcessor::new(48000.0);
        proc.set_compressor(-20.0, 4.0, 0.1, 50.0, 0.0, 0.0);
        let mut buf = [1.0_f32; 4800];
        proc.process_mono(&mut buf);
        // Loud signal should be compressed
        let last = buf[4799];
        assert!(last < 0.9, "Compressor should reduce: {last}");
        assert!(last > 0.01, "Should not silence: {last}");
        // GR should be reported
        assert!(proc.compressor_gr_db() < -1.0);
    }

    #[test]
    fn test_processor_gate() {
        let mut proc = DspProcessor::new(48000.0);
        proc.set_gate(-20.0, 0.1, 0.0, 10.0, -80.0);
        // Feed very quiet signal
        let mut buf = [0.001_f32; 48000];
        proc.process_mono(&mut buf);
        let last = buf[47999];
        assert!(last < 0.0005, "Gate should attenuate: {last}");
    }

    #[test]
    fn test_processor_eq() {
        let mut proc = DspProcessor::new(48000.0);
        // Set a peaking band at 1kHz with +6dB
        proc.set_eq_band(0, 5, 1000.0, 1.0, 6.0, true);
        let mut buf = [0.5_f32; 128];
        proc.process_mono(&mut buf);
        // Should process without panic
    }

    #[test]
    fn test_processor_disable_eq() {
        let mut proc = DspProcessor::new(48000.0);
        proc.set_eq_band(0, 5, 1000.0, 1.0, 6.0, true);
        proc.disable_eq();
        // After disabling, should pass through
        let mut buf = [0.5_f32; 4];
        proc.set_gain(1.0);
        proc.process_mono(&mut buf);
        assert_eq!(buf, [0.5, 0.5, 0.5, 0.5]);
    }

    #[test]
    fn test_processor_disable_compressor() {
        let mut proc = DspProcessor::new(48000.0);
        proc.set_compressor(-20.0, 4.0, 0.1, 50.0, 0.0, 0.0);
        proc.disable_compressor();
        assert_eq!(proc.compressor_gr_db(), 0.0);
    }

    #[test]
    fn test_version() {
        let v = version();
        assert!(!v.is_empty());
        assert!(v.starts_with("0."));
    }
}
