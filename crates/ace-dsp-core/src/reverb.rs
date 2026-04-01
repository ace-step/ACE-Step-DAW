//! Schroeder reverb — 4 parallel comb filters + 2 series allpass filters.
//!
//! Classic algorithmic reverb design. The comb filters create the dense
//! reflection pattern (tail), while the allpass filters add diffusion
//! without changing the frequency balance.
//!
//! Parameters:
//! - `room_size` (0.0–1.0): scales comb filter feedback → longer tail
//! - `damping` (0.0–1.0): low-pass in comb feedback → darker sound
//! - `wet` / `dry`: mix levels
//!
//! Comb delay times (in samples at 44.1 kHz, scaled for other rates):
//!   1116, 1188, 1277, 1356 — mutually prime to avoid metallic resonance
//! Allpass delay times: 556, 441

use crate::ANTI_DENORMAL;

// ── Tuning constants (Freeverb / Schroeder standard) ──────────────────
const COMB_TUNING: [usize; 4] = [1116, 1188, 1277, 1356];
const ALLPASS_TUNING: [usize; 2] = [556, 441];
const ALLPASS_FEEDBACK: f32 = 0.5;
const REFERENCE_RATE: f32 = 44100.0;

// ── Comb filter with integrated low-pass damping ──────────────────────

struct CombFilter {
    buffer: Vec<f32>,
    index: usize,
    filter_store: f32, // one-pole LPF state
}

impl CombFilter {
    fn new(size: usize) -> Self {
        Self {
            buffer: vec![0.0; size],
            index: 0,
            filter_store: 0.0,
        }
    }

    /// Process one sample: read delayed output, apply damping + feedback, write.
    #[inline]
    fn process(&mut self, input: f32, feedback: f32, damp1: f32, damp2: f32) -> f32 {
        let output = self.buffer[self.index];

        // One-pole low-pass filter in the feedback path
        self.filter_store = output * damp2 + self.filter_store * damp1 + ANTI_DENORMAL;

        self.buffer[self.index] = input + self.filter_store * feedback;

        self.index += 1;
        if self.index >= self.buffer.len() {
            self.index = 0;
        }

        output
    }

    fn clear(&mut self) {
        self.buffer.fill(0.0);
        self.filter_store = 0.0;
        self.index = 0;
    }
}

// ── Allpass filter ────────────────────────────────────────────────────

struct AllpassFilter {
    buffer: Vec<f32>,
    index: usize,
}

impl AllpassFilter {
    fn new(size: usize) -> Self {
        Self {
            buffer: vec![0.0; size],
            index: 0,
        }
    }

    #[inline]
    fn process(&mut self, input: f32) -> f32 {
        let buffered = self.buffer[self.index];
        let output = -input + buffered;
        self.buffer[self.index] = input + buffered * ALLPASS_FEEDBACK + ANTI_DENORMAL;

        self.index += 1;
        if self.index >= self.buffer.len() {
            self.index = 0;
        }

        output
    }

    fn clear(&mut self) {
        self.buffer.fill(0.0);
        self.index = 0;
    }
}

// ── Public reverb struct ─────────────────────────────────────────────

/// Schroeder reverb processor.
///
/// Signal flow:
/// ```text
///   input ──┬─[comb 0]──┐
///            ├─[comb 1]──┤
///            ├─[comb 2]──┼── sum ──[allpass 0]──[allpass 1]── wet
///            └─[comb 3]──┘
///   input ────────────────────────────────────────────────── dry
/// ```
pub struct Reverb {
    combs: Vec<CombFilter>,
    allpasses: Vec<AllpassFilter>,
    room_size: f32,
    damping: f32,
    wet: f32,
    dry: f32,
    // Derived coefficients
    feedback: f32,
    damp1: f32,
    damp2: f32,
}

impl Reverb {
    /// Create a new reverb at the given sample rate.
    ///
    /// - `room_size`: 0.0 (small) to 1.0 (large) — controls decay time
    /// - `damping`: 0.0 (bright) to 1.0 (dark) — high-frequency absorption
    /// - `wet`: wet signal level (0.0–1.0)
    /// - `dry`: dry signal level (0.0–1.0)
    pub fn new(sample_rate: f32, room_size: f32, damping: f32, wet: f32, dry: f32) -> Self {
        let rate_scale = sample_rate / REFERENCE_RATE;

        let combs = COMB_TUNING
            .iter()
            .map(|&t| {
                let size = ((t as f32) * rate_scale) as usize;
                CombFilter::new(size.max(1))
            })
            .collect();

        let allpasses = ALLPASS_TUNING
            .iter()
            .map(|&t| {
                let size = ((t as f32) * rate_scale) as usize;
                AllpassFilter::new(size.max(1))
            })
            .collect();

        let room_size = room_size.clamp(0.0, 1.0);
        let damping = damping.clamp(0.0, 1.0);
        let feedback = room_size * 0.28 + 0.7; // map 0..1 → 0.7..0.98
        let damp1 = damping;
        let damp2 = 1.0 - damping;

        Self {
            combs,
            allpasses,
            room_size,
            damping,
            wet: wet.clamp(0.0, 1.0),
            dry: dry.clamp(0.0, 1.0),
            feedback,
            damp1,
            damp2,
        }
    }

    /// Set room size (0.0–1.0).
    pub fn set_room_size(&mut self, size: f32) {
        self.room_size = size.clamp(0.0, 1.0);
        self.feedback = self.room_size * 0.28 + 0.7;
    }

    /// Get current room size.
    pub fn room_size(&self) -> f32 {
        self.room_size
    }

    /// Set damping (0.0–1.0).
    pub fn set_damping(&mut self, damping: f32) {
        self.damping = damping.clamp(0.0, 1.0);
        self.damp1 = self.damping;
        self.damp2 = 1.0 - self.damping;
    }

    /// Get current damping.
    pub fn damping(&self) -> f32 {
        self.damping
    }

    /// Set wet level (0.0–1.0).
    pub fn set_wet(&mut self, wet: f32) {
        self.wet = wet.clamp(0.0, 1.0);
    }

    /// Set dry level (0.0–1.0).
    pub fn set_dry(&mut self, dry: f32) {
        self.dry = dry.clamp(0.0, 1.0);
    }

    /// Process a single sample, returning the mixed output.
    #[inline]
    pub fn process_sample(&mut self, input: f32) -> f32 {
        // Sum of parallel comb filters, normalized by count
        let mut comb_sum = 0.0_f32;
        for comb in &mut self.combs {
            comb_sum += comb.process(input, self.feedback, self.damp1, self.damp2);
        }
        comb_sum *= 0.25; // normalize: 1/4 combs

        // Series allpass filters for diffusion
        let mut out = comb_sum;
        for ap in &mut self.allpasses {
            out = ap.process(out);
        }

        // Wet/dry mix
        input * self.dry + out * self.wet
    }

    /// Process a buffer in-place.
    pub fn process_buffer(&mut self, buffer: &mut [f32]) {
        for sample in buffer.iter_mut() {
            *sample = self.process_sample(*sample);
        }
    }

    /// Clear all internal delay buffers (call on seek/stop).
    pub fn reset(&mut self) {
        for comb in &mut self.combs {
            comb.clear();
        }
        for ap in &mut self.allpasses {
            ap.clear();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_reverb_creation() {
        let rev = Reverb::new(44100.0, 0.5, 0.5, 0.3, 1.0);
        assert_eq!(rev.room_size(), 0.5);
        assert_eq!(rev.damping(), 0.5);
    }

    #[test]
    fn test_reverb_silence_in_silence_out() {
        let mut rev = Reverb::new(44100.0, 0.5, 0.5, 1.0, 0.0);
        let mut buf = [0.0_f32; 512];
        rev.process_buffer(&mut buf);
        for s in &buf {
            assert!(s.abs() < 1e-10, "Expected silence, got {s}");
        }
    }

    #[test]
    fn test_reverb_impulse_response_has_tail() {
        let mut rev = Reverb::new(44100.0, 0.8, 0.3, 1.0, 0.0);

        // Feed an impulse
        let out0 = rev.process_sample(1.0);
        // Process many samples of silence to let the tail develop
        let mut tail_energy = 0.0_f32;
        for _ in 0..4410 {
            let s = rev.process_sample(0.0);
            tail_energy += s * s;
        }

        // The impulse should create a reverb tail with significant energy
        assert!(
            tail_energy > 0.01,
            "Reverb tail should have energy: {tail_energy}"
        );
        // First output should be near zero (combs haven't echoed yet)
        assert!(
            out0.abs() < 0.01,
            "First sample should be near-zero: {out0}"
        );
    }

    #[test]
    fn test_reverb_dry_passthrough() {
        let mut rev = Reverb::new(44100.0, 0.5, 0.5, 0.0, 1.0);
        let mut buf = [0.5_f32; 128];
        rev.process_buffer(&mut buf);
        // With 0 wet and 1.0 dry, output should equal input (plus tiny anti-denormal)
        for &s in &buf {
            assert!(
                (s - 0.5).abs() < 0.01,
                "Dry passthrough failed: {s}"
            );
        }
    }

    #[test]
    fn test_reverb_wet_only_no_immediate_output() {
        let mut rev = Reverb::new(44100.0, 0.5, 0.5, 1.0, 0.0);
        // With only wet signal, the first few samples should be near-zero
        // because the comb filters haven't produced output yet
        let out = rev.process_sample(1.0);
        assert!(
            out.abs() < 0.01,
            "Wet-only first sample should be near-zero: {out}"
        );
    }

    #[test]
    fn test_reverb_room_size_affects_decay() {
        // Small room = shorter decay
        let mut small = Reverb::new(44100.0, 0.1, 0.5, 1.0, 0.0);
        small.process_sample(1.0);
        let mut small_energy = 0.0_f32;
        for _ in 0..44100 {
            let s = small.process_sample(0.0);
            small_energy += s * s;
        }

        // Large room = longer decay
        let mut large = Reverb::new(44100.0, 0.9, 0.5, 1.0, 0.0);
        large.process_sample(1.0);
        let mut large_energy = 0.0_f32;
        for _ in 0..44100 {
            let s = large.process_sample(0.0);
            large_energy += s * s;
        }

        assert!(
            large_energy > small_energy,
            "Large room ({large_energy}) should have more energy than small ({small_energy})"
        );
    }

    #[test]
    fn test_reverb_damping_affects_brightness() {
        // No damping = bright (more high frequency content)
        let mut bright = Reverb::new(44100.0, 0.7, 0.0, 1.0, 0.0);
        bright.process_sample(1.0);
        let mut bright_energy = 0.0_f32;
        for _ in 0..4410 {
            let s = bright.process_sample(0.0);
            bright_energy += s * s;
        }

        // Full damping = dark (less high frequency, also less total energy)
        let mut dark = Reverb::new(44100.0, 0.7, 1.0, 1.0, 0.0);
        dark.process_sample(1.0);
        let mut dark_energy = 0.0_f32;
        for _ in 0..4410 {
            let s = dark.process_sample(0.0);
            dark_energy += s * s;
        }

        // With damping, the tail should have less energy
        assert!(
            bright_energy > dark_energy,
            "Bright ({bright_energy}) should have more energy than dark ({dark_energy})"
        );
    }

    #[test]
    fn test_reverb_reset_clears_tail() {
        let mut rev = Reverb::new(44100.0, 0.8, 0.3, 1.0, 0.0);
        // Build up some reverb tail
        rev.process_sample(1.0);
        for _ in 0..1000 {
            rev.process_sample(0.0);
        }
        // Reset should clear it
        rev.reset();
        let s = rev.process_sample(0.0);
        assert!(s.abs() < 1e-10, "After reset, output should be silence: {s}");
    }

    #[test]
    fn test_reverb_parameter_setters() {
        let mut rev = Reverb::new(44100.0, 0.5, 0.5, 0.5, 0.5);
        rev.set_room_size(0.9);
        assert_eq!(rev.room_size(), 0.9);
        rev.set_damping(0.8);
        assert_eq!(rev.damping(), 0.8);
        rev.set_wet(0.7);
        rev.set_dry(0.3);
    }

    #[test]
    fn test_reverb_clamping() {
        let mut rev = Reverb::new(44100.0, 0.5, 0.5, 0.5, 0.5);
        rev.set_room_size(2.0);
        assert_eq!(rev.room_size(), 1.0);
        rev.set_room_size(-1.0);
        assert_eq!(rev.room_size(), 0.0);
        rev.set_damping(5.0);
        assert_eq!(rev.damping(), 1.0);
    }

    #[test]
    fn test_reverb_48khz() {
        // Should work at 48kHz without panic
        let mut rev = Reverb::new(48000.0, 0.5, 0.5, 1.0, 0.0);
        rev.process_sample(1.0);
        let mut energy = 0.0_f32;
        for _ in 0..4800 {
            let s = rev.process_sample(0.0);
            energy += s * s;
        }
        assert!(energy > 0.01, "48kHz reverb should work: {energy}");
    }

    #[test]
    fn test_reverb_output_bounded() {
        let mut rev = Reverb::new(44100.0, 0.8, 0.5, 0.5, 1.0);
        // Feed a sustained signal
        let mut max_output = 0.0_f32;
        for _ in 0..44100 {
            let s = rev.process_sample(0.5);
            max_output = max_output.max(s.abs());
        }
        // Output should stay reasonable (feedback < 1.0, so it converges)
        assert!(
            max_output < 5.0,
            "Output should be bounded: {max_output}"
        );
    }
}
