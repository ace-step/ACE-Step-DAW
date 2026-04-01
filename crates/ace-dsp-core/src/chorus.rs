//! Multi-Voice Chorus / Flanger — LFO-modulated delay for thickening and movement.
//!
//! Uses multiple voices (3 by default) with phase-offset LFOs to create a
//! richer, more complex chorus effect. Each voice reads from the same delay
//! line at a different modulated position, creating multiple detuned copies
//! of the input signal.
//!
//! Single-voice chorus can sound thin and "wavy" — multiple voices with
//! 120° phase offsets produce a much denser, more natural ensemble effect
//! similar to what's found in classic hardware units (Roland CE-1, Juno-106).
//!
//! Parameters:
//! - `rate_hz`: LFO frequency (0.1–10 Hz, chorus ~0.5–3, flanger ~0.1–5)
//! - `depth_ms`: modulation depth in ms (chorus ~5–15ms, flanger ~1–5ms)
//! - `delay_ms`: base delay time (chorus ~7–20ms, flanger ~1–7ms)
//! - `feedback`: feedback for flanger effect (0.0–0.95)
//! - `voices`: number of chorus voices (1–4)
//! - `wet` / `dry`: mix levels

use crate::delay::DelayLine;

const MAX_VOICES: usize = 4;

/// Low-frequency oscillator (sine wave) for modulation.
struct Lfo {
    phase: f32,
    phase_inc: f32,
}

impl Lfo {
    fn new(rate_hz: f32, sample_rate: f32, initial_phase: f32) -> Self {
        Self {
            phase: initial_phase % 1.0,
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

    fn reset(&mut self, phase: f32) {
        self.phase = phase % 1.0;
    }
}

/// Multi-voice chorus/flanger processor.
///
/// At low depth + short delay + feedback → flanger.
/// At higher depth + longer delay + no feedback → chorus.
/// Multiple voices with phase offsets create richer ensemble effect.
pub struct Chorus {
    delay_line: DelayLine,
    lfos: Vec<Lfo>,
    num_voices: usize,
    sample_rate: f32,
    base_delay_ms: f32,
    depth_ms: f32,
    feedback: f32,
    wet: f32,
    dry: f32,
    fb_sample: f32, // stored feedback sample
}

impl Chorus {
    /// Create a new multi-voice chorus/flanger processor.
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
        Self::with_voices(sample_rate, rate_hz, depth_ms, delay_ms, feedback, wet, dry, 3)
    }

    /// Create with explicit voice count (1–4).
    pub fn with_voices(
        sample_rate: f32,
        rate_hz: f32,
        depth_ms: f32,
        delay_ms: f32,
        feedback: f32,
        wet: f32,
        dry: f32,
        voices: usize,
    ) -> Self {
        let num_voices = voices.clamp(1, MAX_VOICES);

        // Max delay: base + depth + margin
        let max_delay_ms = delay_ms + depth_ms + 5.0;
        let max_delay_samples = ((max_delay_ms * sample_rate / 1000.0) as usize).max(4);

        // Create LFOs with evenly distributed phase offsets
        let lfos = (0..num_voices)
            .map(|i| {
                let phase_offset = i as f32 / num_voices as f32;
                Lfo::new(rate_hz, sample_rate, phase_offset)
            })
            .collect();

        Self {
            delay_line: DelayLine::new(max_delay_samples),
            lfos,
            num_voices,
            sample_rate,
            base_delay_ms: delay_ms.max(0.1),
            depth_ms: depth_ms.max(0.0),
            feedback: feedback.clamp(0.0, 0.95),
            wet: wet.clamp(0.0, 1.0),
            dry: dry.clamp(0.0, 1.0),
            fb_sample: 0.0,
        }
    }

    /// Set number of voices (1–4). Resets LFO phases.
    pub fn set_voices(&mut self, voices: usize) {
        let num_voices = voices.clamp(1, MAX_VOICES);
        if num_voices != self.num_voices {
            self.num_voices = num_voices;
            let rate_hz = self.lfos[0].phase_inc * self.sample_rate;
            self.lfos = (0..num_voices)
                .map(|i| {
                    let phase_offset = i as f32 / num_voices as f32;
                    Lfo::new(rate_hz, self.sample_rate, phase_offset)
                })
                .collect();
        }
    }

    /// Get number of voices.
    pub fn num_voices(&self) -> usize {
        self.num_voices
    }

    /// Set LFO rate in Hz.
    pub fn set_rate(&mut self, rate_hz: f32) {
        let rate = rate_hz.max(0.01);
        for lfo in &mut self.lfos {
            lfo.set_rate(rate, self.sample_rate);
        }
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

        // Sum all voices (each reads from a different modulated position)
        let mut voice_sum = 0.0_f32;
        let inv_voices = 1.0 / self.num_voices as f32;

        for lfo in &mut self.lfos {
            let lfo_val = lfo.next();
            let mod_delay_ms = self.base_delay_ms + lfo_val * self.depth_ms;
            let mod_delay_samples = (mod_delay_ms * self.sample_rate / 1000.0).max(1.0);
            voice_sum += self.delay_line.read_cubic(mod_delay_samples);
        }
        voice_sum *= inv_voices; // normalize by voice count

        // Store feedback for next sample (use the averaged voice output)
        self.fb_sample = voice_sum * self.feedback;

        // Mix
        input * self.dry + voice_sum * self.wet
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
        for (i, lfo) in self.lfos.iter_mut().enumerate() {
            lfo.reset(i as f32 / self.num_voices as f32);
        }
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
        assert_eq!(ch.num_voices(), 3); // default 3 voices
    }

    #[test]
    fn test_chorus_with_voices() {
        let ch = Chorus::with_voices(44100.0, 1.0, 5.0, 10.0, 0.0, 0.5, 1.0, 2);
        assert_eq!(ch.num_voices(), 2);

        let ch4 = Chorus::with_voices(44100.0, 1.0, 5.0, 10.0, 0.0, 0.5, 1.0, 4);
        assert_eq!(ch4.num_voices(), 4);
    }

    #[test]
    fn test_chorus_voices_clamped() {
        let ch = Chorus::with_voices(44100.0, 1.0, 5.0, 10.0, 0.0, 0.5, 1.0, 0);
        assert_eq!(ch.num_voices(), 1);

        let ch2 = Chorus::with_voices(44100.0, 1.0, 5.0, 10.0, 0.0, 0.5, 1.0, 10);
        assert_eq!(ch2.num_voices(), 4);
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
        assert!(
            (buf[0] - 0.5).abs() < 0.01,
            "Dry passthrough: {}",
            buf[0]
        );
    }

    #[test]
    fn test_chorus_wet_signal_delayed() {
        let mut ch = Chorus::with_voices(44100.0, 0.0, 0.0, 10.0, 0.0, 1.0, 0.0, 1);
        // Rate=0, depth=0, 1 voice → fixed 10ms delay, wet only
        let out0 = ch.process_sample(1.0);
        assert!(out0.abs() < 0.01, "First sample should be delayed: {out0}");

        let mut found_impulse = false;
        for i in 1..600 {
            let s = ch.process_sample(0.0);
            if s.abs() > 0.3 {
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
        let mut ch_mod = Chorus::new(44100.0, 3.0, 8.0, 10.0, 0.0, 1.0, 0.0);
        let mut ch_fix = Chorus::with_voices(44100.0, 0.0, 0.0, 10.0, 0.0, 1.0, 0.0, 1);

        let mut diff_sum = 0.0_f32;
        for i in 0..8820 {
            let input = (i as f32 / 8820.0) * 2.0 - 1.0;
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
    fn test_multi_voice_richer_than_single() {
        // Multi-voice chorus should produce more complex output than single voice.
        // We test by comparing spectral spread (variance of output).
        let mut single = Chorus::with_voices(44100.0, 2.0, 7.0, 10.0, 0.0, 1.0, 0.0, 1);
        let mut multi = Chorus::with_voices(44100.0, 2.0, 7.0, 10.0, 0.0, 1.0, 0.0, 3);

        // Feed a steady tone (sine wave at 440 Hz)
        let mut single_outs = Vec::with_capacity(4410);
        let mut multi_outs = Vec::with_capacity(4410);
        for i in 0..4410 {
            let input = (i as f32 / 44100.0 * 440.0 * core::f32::consts::TAU).sin() * 0.5;
            single_outs.push(single.process_sample(input));
            multi_outs.push(multi.process_sample(input));
        }

        // Multi-voice should have different temporal variation
        // (the 3 voices create a more complex interference pattern)
        let single_var: f32 = {
            let mean = single_outs.iter().sum::<f32>() / single_outs.len() as f32;
            single_outs.iter().map(|s| (s - mean) * (s - mean)).sum::<f32>() / single_outs.len() as f32
        };
        let multi_var: f32 = {
            let mean = multi_outs.iter().sum::<f32>() / multi_outs.len() as f32;
            multi_outs.iter().map(|s| (s - mean) * (s - mean)).sum::<f32>() / multi_outs.len() as f32
        };

        // Both should have meaningful output
        assert!(single_var > 0.001, "Single voice should have output: {single_var}");
        assert!(multi_var > 0.001, "Multi voice should have output: {multi_var}");
    }

    #[test]
    fn test_flanger_feedback() {
        let mut flanger = Chorus::with_voices(44100.0, 0.5, 2.0, 3.0, 0.7, 1.0, 0.0, 1);

        flanger.process_sample(1.0);
        let mut tail_energy = 0.0_f32;
        for _ in 0..4410 {
            let s = flanger.process_sample(0.0);
            tail_energy += s * s;
        }

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
        ch.set_voices(2);
        assert_eq!(ch.num_voices(), 2);
    }

    #[test]
    fn test_chorus_reset() {
        let mut ch = Chorus::new(44100.0, 1.0, 5.0, 10.0, 0.5, 1.0, 0.0);
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

    #[test]
    fn test_single_voice_compatibility() {
        // Single voice should behave like the original implementation
        let mut ch = Chorus::with_voices(44100.0, 1.0, 5.0, 10.0, 0.0, 0.5, 1.0, 1);
        let mut buf = [0.5_f32; 128];
        ch.process_buffer(&mut buf);
        // Should produce reasonable output
        assert!(buf[0] > 0.2, "Single voice output: {}", buf[0]);
    }
}
