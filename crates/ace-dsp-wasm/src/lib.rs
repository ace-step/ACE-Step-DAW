//! ACE-Step DSP WASM — wasm-bindgen exports for AudioWorklet processing.
//!
//! This crate exposes the DSP engine to JavaScript via wasm-bindgen.
//! The primary consumer is the AudioWorklet processor (`wasm-dsp-processor.js`).

use wasm_bindgen::prelude::*;
use ace_dsp_core::autopan::{AutoPan, PanShape};
use ace_dsp_core::biquad::{BiquadCoeffs, BiquadFilter, BiquadType};
use ace_dsp_core::chorus::Chorus;
use ace_dsp_core::delay::MonoDelay;
use ace_dsp_core::distortion::{Distortion, DistortionType};
use ace_dsp_core::dynamics::{Compressor, NoiseGate};
use ace_dsp_core::eq::ParametricEq;
use ace_dsp_core::gain::GainProcessor;
use ace_dsp_core::limiter::Limiter;
use ace_dsp_core::phaser::Phaser;
use ace_dsp_core::reverb::Reverb;
use ace_dsp_core::stereo::StereoImager;
use ace_dsp_core::tremolo::{Tremolo, TremoloShape};

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
    reverb: Option<Reverb>,
    chorus: Option<Chorus>,
    distortion: Option<Distortion>,
    stereo_imager: Option<StereoImager>,
    limiter: Option<Limiter>,
    phaser: Option<Phaser>,
    tremolo: Option<Tremolo>,
    autopan: Option<AutoPan>,
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
            reverb: None,
            chorus: None,
            distortion: None,
            stereo_imager: None,
            limiter: None,
            phaser: None,
            tremolo: None,
            autopan: None,
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

    /// Enable reverb effect.
    /// - `room_size`: 0.0 (small) to 1.0 (large)
    /// - `damping`: 0.0 (bright) to 1.0 (dark)
    /// - `wet`: wet signal level (0.0–1.0)
    /// - `dry`: dry signal level (0.0–1.0)
    pub fn set_reverb(&mut self, room_size: f32, damping: f32, wet: f32, dry: f32) {
        match &mut self.reverb {
            Some(r) => {
                r.set_room_size(room_size);
                r.set_damping(damping);
                r.set_wet(wet);
                r.set_dry(dry);
            }
            None => {
                self.reverb = Some(Reverb::new(
                    self.sample_rate,
                    room_size,
                    damping,
                    wet,
                    dry,
                ));
            }
        }
    }

    /// Disable the reverb.
    pub fn disable_reverb(&mut self) {
        self.reverb = None;
    }

    /// Enable chorus/flanger effect.
    /// - `rate_hz`: LFO rate (0.1–10 Hz)
    /// - `depth_ms`: modulation depth in ms
    /// - `delay_ms`: base delay time in ms
    /// - `feedback`: feedback (0.0–0.95, >0 for flanger)
    /// - `wet`: wet level (0.0–1.0)
    /// - `dry`: dry level (0.0–1.0)
    pub fn set_chorus(
        &mut self,
        rate_hz: f32,
        depth_ms: f32,
        delay_ms: f32,
        feedback: f32,
        wet: f32,
        dry: f32,
    ) {
        match &mut self.chorus {
            Some(c) => {
                c.set_rate(rate_hz);
                c.set_depth(depth_ms);
                c.set_delay(delay_ms);
                c.set_feedback(feedback);
                c.set_wet(wet);
                c.set_dry(dry);
            }
            None => {
                self.chorus = Some(Chorus::new(
                    self.sample_rate,
                    rate_hz,
                    depth_ms,
                    delay_ms,
                    feedback,
                    wet,
                    dry,
                ));
            }
        }
    }

    /// Disable the chorus/flanger.
    pub fn disable_chorus(&mut self) {
        self.chorus = None;
    }

    /// Enable distortion/waveshaper.
    /// - `dist_type`: 0=HardClip, 1=SoftClip, 2=Overdrive, 3=Fuzz, 4=Bitcrush
    /// - `drive`: input gain (1.0–100.0)
    /// - `mix`: wet/dry (0.0–1.0)
    /// - `output_gain`: post level (0.0–2.0)
    /// - `bit_depth`: for Bitcrush mode (1.0–16.0)
    pub fn set_distortion(
        &mut self,
        dist_type: u8,
        drive: f32,
        mix: f32,
        output_gain: f32,
        bit_depth: f32,
    ) {
        let dt = match dist_type {
            0 => DistortionType::HardClip,
            1 => DistortionType::SoftClip,
            2 => DistortionType::Overdrive,
            3 => DistortionType::Fuzz,
            4 => DistortionType::Bitcrush,
            _ => DistortionType::SoftClip,
        };
        match &mut self.distortion {
            Some(d) => {
                d.set_type(dt);
                d.set_drive(drive);
                d.set_mix(mix);
                d.set_output_gain(output_gain);
                d.set_bit_depth(bit_depth);
            }
            None => {
                let mut d = Distortion::new(dt, drive, mix, output_gain);
                d.set_bit_depth(bit_depth);
                self.distortion = Some(d);
            }
        }
    }

    /// Disable the distortion.
    pub fn disable_distortion(&mut self) {
        self.distortion = None;
    }

    /// Set stereo imager width.
    /// - `width`: 0.0 (mono) to 2.0 (extra wide), 1.0 = unchanged
    pub fn set_stereo_width(&mut self, width: f32) {
        match &mut self.stereo_imager {
            Some(si) => si.set_width(width),
            None => self.stereo_imager = Some(StereoImager::new(width)),
        }
    }

    /// Disable the stereo imager.
    pub fn disable_stereo_imager(&mut self) {
        self.stereo_imager = None;
    }

    /// Enable limiter.
    /// - `ceiling_db`: max output level (≤ 0.0 dB)
    /// - `release_ms`: gain recovery time
    /// - `lookahead_ms`: anticipation window (1–10ms)
    pub fn set_limiter(&mut self, ceiling_db: f32, release_ms: f32, lookahead_ms: f32) {
        match &mut self.limiter {
            Some(l) => {
                l.set_ceiling(ceiling_db);
                l.set_release(release_ms);
            }
            None => {
                self.limiter = Some(Limiter::new(
                    self.sample_rate,
                    ceiling_db,
                    release_ms,
                    lookahead_ms,
                ));
            }
        }
    }

    /// Disable the limiter.
    pub fn disable_limiter(&mut self) {
        self.limiter = None;
    }

    /// Get current limiter gain reduction in dB.
    pub fn limiter_gr_db(&self) -> f32 {
        self.limiter
            .as_ref()
            .map(|l| l.gain_reduction_db())
            .unwrap_or(0.0)
    }

    /// Enable phaser.
    /// - `rate_hz`: LFO rate (0.05–10 Hz)
    /// - `depth`: modulation depth (0.0–1.0)
    /// - `feedback`: resonance (0.0–0.95)
    /// - `stages`: allpass stages (2–12, even)
    /// - `mix`: wet/dry (0.0–1.0)
    pub fn set_phaser(
        &mut self,
        rate_hz: f32,
        depth: f32,
        feedback: f32,
        stages: u8,
        mix: f32,
    ) {
        match &mut self.phaser {
            Some(p) => {
                p.set_rate(rate_hz);
                p.set_depth(depth);
                p.set_feedback(feedback);
                p.set_stages(stages as usize);
                p.set_mix(mix);
            }
            None => {
                self.phaser = Some(Phaser::new(
                    self.sample_rate,
                    rate_hz,
                    depth,
                    feedback,
                    stages as usize,
                    mix,
                ));
            }
        }
    }

    /// Disable the phaser.
    pub fn disable_phaser(&mut self) {
        self.phaser = None;
    }

    /// Enable tremolo.
    /// - `rate_hz`: LFO rate (0.1–20 Hz)
    /// - `depth`: modulation depth (0.0–1.0)
    /// - `shape`: 0=Sine, 1=Triangle, 2=Square
    pub fn set_tremolo(&mut self, rate_hz: f32, depth: f32, shape: u8) {
        let sh = match shape {
            0 => TremoloShape::Sine,
            1 => TremoloShape::Triangle,
            2 => TremoloShape::Square,
            _ => TremoloShape::Sine,
        };
        match &mut self.tremolo {
            Some(t) => {
                t.set_rate(rate_hz);
                t.set_depth(depth);
                t.set_shape(sh);
            }
            None => {
                self.tremolo = Some(Tremolo::new(self.sample_rate, rate_hz, depth, sh));
            }
        }
    }

    /// Disable the tremolo.
    pub fn disable_tremolo(&mut self) {
        self.tremolo = None;
    }

    /// Enable auto-pan.
    /// - `rate_hz`: LFO rate (0.05–20 Hz)
    /// - `depth`: panning depth (0.0–1.0)
    /// - `shape`: 0=Sine, 1=Triangle
    pub fn set_autopan(&mut self, rate_hz: f32, depth: f32, shape: u8) {
        let sh = match shape {
            0 => PanShape::Sine,
            1 => PanShape::Triangle,
            _ => PanShape::Sine,
        };
        match &mut self.autopan {
            Some(ap) => {
                ap.set_rate(rate_hz);
                ap.set_depth(depth);
                ap.set_shape(sh);
            }
            None => {
                self.autopan = Some(AutoPan::new(self.sample_rate, rate_hz, depth, sh));
            }
        }
    }

    /// Disable auto-pan.
    pub fn disable_autopan(&mut self) {
        self.autopan = None;
    }

    /// Process a mono audio buffer in-place.
    /// Called from the AudioWorklet's process() method.
    /// Signal chain: Gate → Filter → EQ → Distortion → Compressor → Chorus → Phaser → Delay → Reverb → Gain
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
        if let Some(ref d) = self.distortion {
            d.process_buffer(buffer);
        }
        if let Some(ref mut tremolo) = self.tremolo {
            tremolo.process_buffer(buffer);
        }
        if let Some(ref mut compressor) = self.compressor {
            compressor.process_buffer(buffer);
        }
        if let Some(ref mut chorus) = self.chorus {
            chorus.process_buffer(buffer);
        }
        if let Some(ref mut phaser) = self.phaser {
            phaser.process_buffer(buffer);
        }
        if let Some(ref mut delay) = self.delay {
            delay.process_buffer(buffer);
        }
        if let Some(ref mut reverb) = self.reverb {
            reverb.process_buffer(buffer);
        }
        self.gain.process_mono(buffer);
        if let Some(ref mut limiter) = self.limiter {
            limiter.process_buffer(buffer);
        }
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
        if let Some(ref d) = self.distortion {
            d.process_buffer(buffer);
        }
        if let Some(ref mut tremolo) = self.tremolo {
            tremolo.process_buffer(buffer);
        }
        if let Some(ref mut compressor) = self.compressor {
            compressor.process_buffer(buffer);
        }
        if let Some(ref mut chorus) = self.chorus {
            chorus.process_buffer(buffer);
        }
        if let Some(ref mut phaser) = self.phaser {
            phaser.process_buffer(buffer);
        }
        if let Some(ref mut delay) = self.delay {
            delay.process_buffer(buffer);
        }
        if let Some(ref mut reverb) = self.reverb {
            reverb.process_buffer(buffer);
        }
        if let Some(ref si) = self.stereo_imager {
            si.process_interleaved(buffer);
        }
        if let Some(ref mut autopan) = self.autopan {
            autopan.process_interleaved(buffer);
        }
        self.gain.process_stereo_interleaved(buffer);
        if let Some(ref mut limiter) = self.limiter {
            limiter.process_buffer(buffer);
        }
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
        if let Some(ref mut reverb) = self.reverb {
            reverb.reset();
        }
        if let Some(ref mut chorus) = self.chorus {
            chorus.reset();
        }
        if let Some(ref mut limiter) = self.limiter {
            limiter.reset();
        }
        if let Some(ref mut phaser) = self.phaser {
            phaser.reset();
        }
        if let Some(ref mut tremolo) = self.tremolo {
            tremolo.reset();
        }
        if let Some(ref mut autopan) = self.autopan {
            autopan.reset();
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
    fn test_processor_reverb() {
        let mut proc = DspProcessor::new(44100.0);
        proc.set_reverb(0.7, 0.4, 1.0, 0.0); // Large room, wet only
        proc.set_gain(1.0);

        // Feed impulse + silence
        let mut buf = [0.0_f32; 4410];
        buf[0] = 1.0;
        proc.process_mono(&mut buf);

        // Reverb tail should have energy
        let tail_energy: f32 = buf[100..].iter().map(|s| s * s).sum();
        assert!(tail_energy > 0.01, "Reverb tail energy: {tail_energy}");
    }

    #[test]
    fn test_processor_disable_reverb() {
        let mut proc = DspProcessor::new(44100.0);
        proc.set_reverb(0.5, 0.5, 1.0, 0.0);
        proc.disable_reverb();
        let mut buf = [0.5_f32; 4];
        proc.set_gain(1.0);
        proc.process_mono(&mut buf);
        assert_eq!(buf, [0.5, 0.5, 0.5, 0.5]);
    }

    #[test]
    fn test_processor_tremolo() {
        let mut proc = DspProcessor::new(44100.0);
        proc.set_tremolo(5.0, 1.0, 0); // Sine, full depth
        proc.set_gain(1.0);
        let mut buf = [1.0_f32; 8820]; // one full LFO cycle
        proc.process_mono(&mut buf);
        let min = buf.iter().cloned().fold(f32::INFINITY, f32::min);
        let max = buf.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
        assert!(min < 0.1, "Tremolo should reach near 0: {min}");
        assert!(max > 0.9, "Tremolo should reach near 1: {max}");
    }

    #[test]
    fn test_processor_autopan() {
        let mut proc = DspProcessor::new(44100.0);
        proc.set_autopan(2.0, 1.0, 0); // Sine, full depth
        proc.set_gain(1.0);
        // Interleaved stereo: constant signal
        let samples = (44100.0 / 2.0) as usize; // one LFO cycle
        let mut buf: Vec<f32> = vec![0.5; samples * 2]; // L,R pairs
        proc.process_stereo_interleaved(&mut buf);
        // Left channel should vary (auto-pan sweeps)
        let left_vals: Vec<f32> = buf.iter().step_by(2).cloned().collect();
        let min_l = left_vals.iter().cloned().fold(f32::INFINITY, f32::min);
        let max_l = left_vals.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
        assert!(max_l - min_l > 0.3, "AutoPan should sweep L: range={}", max_l - min_l);
    }

    #[test]
    fn test_processor_disable_autopan() {
        let mut proc = DspProcessor::new(44100.0);
        proc.set_autopan(2.0, 1.0, 0);
        proc.disable_autopan();
        let mut buf = [0.5_f32, 0.5, 0.5, 0.5];
        proc.set_gain(1.0);
        proc.process_stereo_interleaved(&mut buf);
        // Disabled → passthrough
        assert!((buf[0] - 0.5).abs() < 0.01);
        assert!((buf[1] - 0.5).abs() < 0.01);
    }

    #[test]
    fn test_processor_disable_tremolo() {
        let mut proc = DspProcessor::new(44100.0);
        proc.set_tremolo(5.0, 1.0, 0);
        proc.disable_tremolo();
        let mut buf = [0.5_f32; 4];
        proc.set_gain(1.0);
        proc.process_mono(&mut buf);
        assert_eq!(buf, [0.5, 0.5, 0.5, 0.5]);
    }

    #[test]
    fn test_processor_phaser() {
        let mut proc = DspProcessor::new(44100.0);
        proc.set_phaser(2.0, 1.0, 0.5, 6, 1.0);
        proc.set_gain(1.0);
        // Feed sine wave — phaser sweep should alter it
        let mut buf: Vec<f32> = (0..4410)
            .map(|i| (i as f32 * 440.0 * std::f32::consts::TAU / 44100.0).sin() * 0.5)
            .collect();
        proc.process_mono(&mut buf);
        // Should process without panic and produce non-zero output
        let energy: f32 = buf.iter().map(|s| s * s).sum();
        assert!(energy > 0.1, "Phaser should produce output: energy={energy}");
    }

    #[test]
    fn test_processor_disable_phaser() {
        let mut proc = DspProcessor::new(44100.0);
        proc.set_phaser(1.0, 0.5, 0.3, 4, 0.5);
        proc.disable_phaser();
        let mut buf = [0.5_f32; 4];
        proc.set_gain(1.0);
        proc.process_mono(&mut buf);
        assert_eq!(buf, [0.5, 0.5, 0.5, 0.5]);
    }

    #[test]
    fn test_processor_limiter() {
        let mut proc = DspProcessor::new(44100.0);
        proc.set_limiter(-1.0, 100.0, 5.0);
        proc.set_gain(2.0); // boost to trigger limiting

        // Feed loud signal
        let mut buf = [0.8_f32; 4410];
        proc.process_mono(&mut buf);

        // After settling, output should not exceed ceiling (-1dB ≈ 0.891)
        let max_out = buf[1000..].iter().cloned().fold(0.0_f32, |a, b| a.max(b.abs()));
        assert!(max_out <= 0.91, "Should be limited: {max_out}");
    }

    #[test]
    fn test_processor_disable_limiter() {
        let mut proc = DspProcessor::new(44100.0);
        proc.set_limiter(-1.0, 100.0, 5.0);
        proc.disable_limiter();
        assert_eq!(proc.limiter_gr_db(), 0.0);
    }

    #[test]
    fn test_processor_stereo_imager() {
        let mut proc = DspProcessor::new(44100.0);
        proc.set_stereo_width(0.0); // mono
        proc.set_gain(1.0);
        // Interleaved stereo: [L=1.0, R=0.0, L=1.0, R=0.0]
        let mut buf = [1.0_f32, 0.0, 1.0, 0.0];
        proc.process_stereo_interleaved(&mut buf);
        // Mono: both channels should be 0.5
        assert!((buf[0] - 0.5).abs() < 0.01, "Stereo→mono L: {}", buf[0]);
        assert!((buf[1] - 0.5).abs() < 0.01, "Stereo→mono R: {}", buf[1]);
    }

    #[test]
    fn test_processor_disable_stereo_imager() {
        let mut proc = DspProcessor::new(44100.0);
        proc.set_stereo_width(0.0);
        proc.disable_stereo_imager();
        let mut buf = [0.8_f32, 0.2, 0.8, 0.2];
        proc.set_gain(1.0);
        proc.process_stereo_interleaved(&mut buf);
        // Disabled → passthrough
        assert!((buf[0] - 0.8).abs() < 0.01);
        assert!((buf[1] - 0.2).abs() < 0.01);
    }

    #[test]
    fn test_processor_distortion() {
        let mut proc = DspProcessor::new(44100.0);
        proc.set_distortion(1, 5.0, 1.0, 1.0, 8.0); // SoftClip
        proc.set_gain(1.0);
        let mut buf = [0.5_f32; 4];
        proc.process_mono(&mut buf);
        // tanh(0.5 * 5) = tanh(2.5) ≈ 0.987
        assert!(buf[0] > 0.9, "Soft clip: {}", buf[0]);
    }

    #[test]
    fn test_processor_disable_distortion() {
        let mut proc = DspProcessor::new(44100.0);
        proc.set_distortion(0, 10.0, 1.0, 1.0, 8.0);
        proc.disable_distortion();
        let mut buf = [0.5_f32; 4];
        proc.set_gain(1.0);
        proc.process_mono(&mut buf);
        assert_eq!(buf, [0.5, 0.5, 0.5, 0.5]);
    }

    #[test]
    fn test_processor_chorus() {
        let mut proc = DspProcessor::new(44100.0);
        proc.set_chorus(1.5, 5.0, 10.0, 0.0, 1.0, 0.0);
        proc.set_gain(1.0);

        // Feed constant signal, modulation should create variation
        let mut buf = [0.5_f32; 4410];
        proc.process_mono(&mut buf);
        let min = buf[441..].iter().cloned().fold(f32::INFINITY, f32::min);
        let max = buf[441..].iter().cloned().fold(f32::NEG_INFINITY, f32::max);
        assert!(max - min > 0.001, "Chorus should modulate: range={}", max - min);
    }

    #[test]
    fn test_processor_disable_chorus() {
        let mut proc = DspProcessor::new(44100.0);
        proc.set_chorus(1.0, 5.0, 10.0, 0.0, 0.5, 0.5);
        proc.disable_chorus();
        let mut buf = [0.5_f32; 4];
        proc.set_gain(1.0);
        proc.process_mono(&mut buf);
        assert_eq!(buf, [0.5, 0.5, 0.5, 0.5]);
    }

    #[test]
    fn test_version() {
        let v = version();
        assert!(!v.is_empty());
        assert!(v.starts_with("0."));
    }
}
