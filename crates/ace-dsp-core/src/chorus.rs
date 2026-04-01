//! Chorus / Flanger — LFO-modulated delay for thickening and movement.
//!
//! A single voice chorus uses a short delay line (5–30ms) with the read
//! position modulated by a low-frequency oscillator (sine wave). This creates
//! a Doppler-like pitch shift that, when mixed with the dry signal, produces
//! the characteristic "shimmer" of a chorus or the comb-filter sweep of a flanger.
//!
//! Parameters:
//! - `rate_hz`: LFO frequency (0.1–10 Hz, chorus ~0.5–3, flanger ~0.1–5)
//! - `depth_ms`: modulation depth in ms (chorus ~5–15ms, flanger ~1–5ms)
//! - `delay_ms`: base delay time (chorus ~7–20ms, flanger ~1–7ms)
//! - `feedback`: feedback for flanger effect (0.0–0.95)
//! - `wet` / `dry`: mix levels

use crate::delay::DelayLine;

/// Low-frequency oscillator (sine wave) for modulation.
struct Lfo {
    phase: f32,
    phase_inc: f32,
}

impl Lfo {
    fn new(rate_hz: f32, sample_rate: f32) -> Self {
        Self {
            phase: 0.0,
            phase_inc: rate_hz / sample_rate,
        }
    }

    fn set_rate(&mut self, rate_hz: f32, sample_rate: f32) {
        self.phase_inc = rate_hz / sample_rate;
    }

    /// Advance the LFO and return a value in [-1.0, 1.0].
    #[inline]
    fn next(&mut self) -> f32 {
        let value = (self.phase * core::f32::consts::TAU).sin();
        self.phase += self.phase_inc;
        if self.phase >= 1.0 {
            self.phase -= 1.0;
        }
        value
    }

    fn reset(&mut self) {
        self.phase = 0.0;
    }
}

/// Chorus/Flanger processor.
///
/// At low depth + short delay + feedback → flanger.
/// At higher depth + longer delay + no feedback → chorus.
pub struct Chorus {
    delay_line: DelayLine,
    lfo: Lfo,
    sample_rate: f32,
    base_delay_ms: f32,
    depth_ms: f32,
    feedback: f32,
    wet: f32,
    dry: f32,
    fb_sample: f32, // stored feedback sample
}

impl Chorus {
    /// Create a new chorus/flanger processor.
    ///
    /// - `sample_rate`: audio sample rate
    /// - `rate_hz`: LFO rate in Hz (0.1–10)
    /// - `depth_ms`: modulation depth in ms
    /// - `delay_ms`: base delay time in ms
    /// - `feedback`: feedback amount (0.0–0.95, use >0 for flanger)
    /// - `wet`: wet signal level (0.0–1.0)
    /// - `dry`: dry signal level (0.0–1.0)
    pub fn new(
        sample_rate: f32,
        rate_hz: f32,
        depth_ms: f32,
        delay_ms: f32,
        feedback: f32,
        wet: f32,
        dry: f32,
    ) -> Self {
        // Max delay: base + depth + margin
        let max_delay_ms = delay_ms + depth_ms + 5.0;
        let max_delay_samples = ((max_delay_ms * sample_rate / 1000.0) as usize).max(4);

        Self {
            delay_line: DelayLine::new(max_delay_samples),
            lfo: Lfo::new(rate_hz, sample_rate),
            sample_rate,
            base_delay_ms: delay_ms.max(0.1),
            depth_ms: depth_ms.max(0.0),
            feedback: feedback.clamp(0.0, 0.95),
            wet: wet.clamp(0.0, 1.0),
            dry: dry.clamp(0.0, 1.0),
            fb_sample: 0.0,
        }
    }

    /// Set LFO rate in Hz.
    pub fn set_rate(&mut self, rate_hz: f32) {
        self.lfo.set_rate(rate_hz.max(0.01), self.sample_rate);
    }

    /// Set modulation depth in ms.
    pub fn set_depth(&mut self, depth_ms: f32) {
        self.depth_ms = depth_ms.max(0.0);
    }

    /// Set base delay time in ms.
    pub fn set_delay(&mut self, delay_ms: f32) {
        self.base_delay_ms = delay_ms.max(0.1);
    }

    /// Set feedback (0.0–0.95).
    pub fn set_feedback(&mut self, feedback: f32) {
        self.feedback = feedback.clamp(0.0, 0.95);
    }

    /// Set wet level (0.0–1.0).
    pub fn set_wet(&mut self, wet: f32) {
        self.wet = wet.clamp(0.0, 1.0);
    }

    /// Set dry level (0.0–1.0).
    pub fn set_dry(&mut self, dry: f32) {
        self.dry = dry.clamp(0.0, 1.0);
    }

    /// Process a single sample.
    #[inline]
    pub fn process_sample(&mut self, input: f32) -> f32 {
        // Push input + feedback into delay line
        self.delay_line.push(input + self.fb_sample);

        // Modulated delay time
        let lfo_val = self.lfo.next();
        let mod_delay_ms = self.base_delay_ms + lfo_val * self.depth_ms;
        let mod_delay_samples = (mod_delay_ms * self.sample_rate / 1000.0).max(1.0);

        // Read from delay line with cubic interpolation for smooth modulation
        let delayed = self.delay_line.read_cubic(mod_delay_samples);

        // Store feedback for next sample
        self.fb_sample = delayed * self.feedback;

        // Mix
        input * self.dry + delayed * self.wet
    }

    /// Process a buffer in-place.
    pub fn process_buffer(&mut self, buffer: &mut [f32]) {
        for sample in buffer.iter_mut() {
            *sample = self.process_sample(*sample);
        }
    }

    /// Clear all internal state.
    pub fn reset(&mut self) {
        self.delay_line.clear();
        self.lfo.reset();
        self.fb_sample = 0.0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chorus_creation() {
        let ch = Chorus::new(44100.0, 1.0, 5.0, 10.0, 0.0, 0.5, 1.0);
        assert_eq!(ch.base_delay_ms, 10.0);
        assert_eq!(ch.depth_ms, 5.0);
        assert_eq!(ch.feedback, 0.0);
    }

    #[test]
    fn test_chorus_silence_in_silence_out() {
        let mut ch = Chorus::new(44100.0, 1.0, 5.0, 10.0, 0.0, 0.5, 0.0);
        let mut buf = [0.0_f32; 512];
        ch.process_buffer(&mut buf);
        for s in &buf {
            assert!(s.abs() < 1e-10, "Expected silence, got {s}");
        }
    }

    #[test]
    fn test_chorus_dry_passthrough() {
        let mut ch = Chorus::new(44100.0, 1.0, 5.0, 10.0, 0.0, 0.0, 1.0);
        let mut buf = [0.5_f32; 128];
        ch.process_buffer(&mut buf);
        // Dry only → first samples before delay kicks in should be dry signal
        assert!(
            (buf[0] - 0.5).abs() < 0.01,
            "Dry passthrough: {}",
            buf[0]
        );
    }

    #[test]
    fn test_chorus_wet_signal_delayed() {
        let mut ch = Chorus::new(44100.0, 0.0, 0.0, 10.0, 0.0, 1.0, 0.0);
        // Rate=0, depth=0 → fixed 10ms delay, wet only
        // Feed impulse
        let out0 = ch.process_sample(1.0);
        // First sample should be near-zero (delayed)
        assert!(out0.abs() < 0.01, "First sample should be delayed: {out0}");

        // Process silence until we pass 10ms (441 samples at 44100)
        let mut found_impulse = false;
        for i in 1..600 {
            let s = ch.process_sample(0.0);
            if s.abs() > 0.3 {
                // Impulse should appear around sample 441
                assert!(
                    i > 400 && i < 500,
                    "Impulse at wrong position: {i}"
                );
                found_impulse = true;
                break;
            }
        }
        assert!(found_impulse, "Should find delayed impulse");
    }

    #[test]
    fn test_chorus_modulation_creates_variation() {
        // With modulation on a varying signal, chorus should change the output
        // compared to a fixed-delay version.
        // Feed a ramp signal — the modulated read position will read different
        // values than a fixed position.
        let mut ch_mod = Chorus::new(44100.0, 3.0, 8.0, 10.0, 0.0, 1.0, 0.0);
        let mut ch_fix = Chorus::new(44100.0, 0.0, 0.0, 10.0, 0.0, 1.0, 0.0);

        // Generate a ramp signal
        let mut diff_sum = 0.0_f32;
        for i in 0..8820 {
            let input = (i as f32 / 8820.0) * 2.0 - 1.0; // -1 to 1 ramp
            let out_mod = ch_mod.process_sample(input);
            let out_fix = ch_fix.process_sample(input);
            diff_sum += (out_mod - out_fix).abs();
        }

        assert!(
            diff_sum > 1.0,
            "Modulated chorus should differ from fixed delay: diff_sum={diff_sum}"
        );
    }

    #[test]
    fn test_flanger_feedback() {
        // Flanger = short delay + feedback
        let mut flanger = Chorus::new(44100.0, 0.5, 2.0, 3.0, 0.7, 1.0, 0.0);

        // Feed impulse and collect tail
        flanger.process_sample(1.0);
        let mut tail_energy = 0.0_f32;
        for _ in 0..4410 {
            let s = flanger.process_sample(0.0);
            tail_energy += s * s;
        }

        // Feedback should create a resonant tail
        assert!(
            tail_energy > 0.01,
            "Flanger feedback tail: {tail_energy}"
        );
    }

    #[test]
    fn test_chorus_feedback_clamping() {
        let ch = Chorus::new(44100.0, 1.0, 5.0, 10.0, 1.5, 0.5, 1.0);
        assert_eq!(ch.feedback, 0.95);

        let ch2 = Chorus::new(44100.0, 1.0, 5.0, 10.0, -0.5, 0.5, 1.0);
        assert_eq!(ch2.feedback, 0.0);
    }

    #[test]
    fn test_chorus_parameter_setters() {
        let mut ch = Chorus::new(44100.0, 1.0, 5.0, 10.0, 0.0, 0.5, 1.0);
        ch.set_rate(2.0);
        ch.set_depth(8.0);
        assert_eq!(ch.depth_ms, 8.0);
        ch.set_delay(15.0);
        assert_eq!(ch.base_delay_ms, 15.0);
        ch.set_feedback(0.6);
        assert_eq!(ch.feedback, 0.6);
        ch.set_wet(0.7);
        ch.set_dry(0.3);
    }

    #[test]
    fn test_chorus_reset() {
        let mut ch = Chorus::new(44100.0, 1.0, 5.0, 10.0, 0.5, 1.0, 0.0);
        // Build up state
        for _ in 0..1000 {
            ch.process_sample(1.0);
        }
        ch.reset();
        let s = ch.process_sample(0.0);
        assert!(s.abs() < 1e-10, "After reset: {s}");
    }

    #[test]
    fn test_chorus_48khz() {
        let mut ch = Chorus::new(48000.0, 1.5, 7.0, 12.0, 0.3, 0.5, 0.5);
        let mut buf = [0.5_f32; 480];
        ch.process_buffer(&mut buf);
        // Should process without panic
    }

    #[test]
    fn test_chorus_output_bounded() {
        let mut ch = Chorus::new(44100.0, 2.0, 8.0, 12.0, 0.7, 0.5, 1.0);
        let mut max_out = 0.0_f32;
        for _ in 0..44100 {
            let s = ch.process_sample(0.5);
            max_out = max_out.max(s.abs());
        }
        assert!(max_out < 5.0, "Output should be bounded: {max_out}");
    }
}
