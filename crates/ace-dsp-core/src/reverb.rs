//! Freeverb — full Schroeder/Moorer reverb with stereo decorrelation.
//!
//! Industry-standard algorithmic reverb based on Jezar's Freeverb design:
//! - 8 parallel comb filters with low-pass damping in feedback path
//! - 4 series allpass filters for diffusion
//! - Stereo decorrelation via offset delay lengths for L/R channels
//!
//! This is a significant upgrade from a basic 4-comb Schroeder reverb:
//! - 8 combs provide denser, more natural reflection patterns
//! - 4 allpasses give better diffusion (less metallic ringing)
//! - Stereo spread creates wide spatial image
//! - Mutually prime delay lengths minimize metallic coloration
//!
//! Parameters:
//! - `room_size` (0.0–1.0): scales comb filter feedback → longer tail
//! - `damping` (0.0–1.0): low-pass in comb feedback → darker sound
//! - `width` (0.0–1.0): stereo spread (0=mono, 1=full stereo)
//! - `wet` / `dry`: mix levels

use crate::ANTI_DENORMAL;

// ── Freeverb tuning constants ────────────────────────────────────────
// Delay lengths chosen to be mutually prime, minimizing metallic resonance.
// These are the standard Freeverb values at 44100 Hz.
const COMB_TUNING: [usize; 8] = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const ALLPASS_TUNING: [usize; 4] = [556, 441, 341, 225];
const STEREO_SPREAD: usize = 23; // offset for right channel decorrelation
const ALLPASS_FEEDBACK: f32 = 0.5;
const REFERENCE_RATE: f32 = 44100.0;

// Room size mapping: maps 0..1 user param to 0.7..0.98 feedback range
const ROOM_SCALE: f32 = 0.28;
const ROOM_OFFSET: f32 = 0.7;

// ── Comb filter with integrated low-pass damping ─────────────────────

struct CombFilter {
    buffer: Vec<f32>,
    index: usize,
    filter_store: f32, // one-pole LPF state for damping
}

impl CombFilter {
    fn new(size: usize) -> Self {
        Self {
            buffer: vec![0.0; size.max(1)],
            index: 0,
            filter_store: 0.0,
        }
    }

    /// Process one sample: read delayed output, apply damping + feedback, write.
    #[inline]
    fn process(&mut self, input: f32, feedback: f32, damp1: f32, damp2: f32) -> f32 {
        let output = self.buffer[self.index];

        // One-pole low-pass filter in the feedback path for damping
        // damp1 = damping amount, damp2 = 1 - damping
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

// ── Allpass filter ───────────────────────────────────────────────────

struct AllpassFilter {
    buffer: Vec<f32>,
    index: usize,
}

impl AllpassFilter {
    fn new(size: usize) -> Self {
        Self {
            buffer: vec![0.0; size.max(1)],
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

// ── Public Freeverb struct ───────────────────────────────────────────

/// Full Freeverb stereo reverb processor.
///
/// Signal flow (per channel):
/// ```text
///   input ──┬─[comb 0]──┐
///            ├─[comb 1]──┤
///            ├─[comb 2]──┤
///            ├─[comb 3]──┤
///            ├─[comb 4]──┼── sum ──[ap 0]──[ap 1]──[ap 2]──[ap 3]── wet
///            ├─[comb 5]──┤
///            ├─[comb 6]──┤
///            └─[comb 7]──┘
///   input ──────────────────────────────────────────────────────────── dry
/// ```
///
/// Left and right channels use different delay lengths (offset by STEREO_SPREAD)
/// to create stereo decorrelation.
pub struct Reverb {
    combs_l: Vec<CombFilter>,
    combs_r: Vec<CombFilter>,
    allpasses_l: Vec<AllpassFilter>,
    allpasses_r: Vec<AllpassFilter>,
    room_size: f32,
    damping: f32,
    width: f32,
    wet: f32,
    dry: f32,
    // Derived coefficients
    feedback: f32,
    damp1: f32,
    damp2: f32,
    // Wet gain coefficients for stereo width
    wet1: f32,
    wet2: f32,
}

impl Reverb {
    /// Create a new Freeverb at the given sample rate.
    ///
    /// - `room_size`: 0.0 (small) to 1.0 (large) — controls decay time
    /// - `damping`: 0.0 (bright) to 1.0 (dark) — high-frequency absorption
    /// - `wet`: wet signal level (0.0–1.0)
    /// - `dry`: dry signal level (0.0–1.0)
    pub fn new(sample_rate: f32, room_size: f32, damping: f32, wet: f32, dry: f32) -> Self {
        let rate_scale = sample_rate / REFERENCE_RATE;

        let combs_l = COMB_TUNING
            .iter()
            .map(|&t| {
                let size = ((t as f32) * rate_scale) as usize;
                CombFilter::new(size)
            })
            .collect();

        let combs_r = COMB_TUNING
            .iter()
            .map(|&t| {
                let size = ((t as f32 + STEREO_SPREAD as f32) * rate_scale) as usize;
                CombFilter::new(size)
            })
            .collect();

        let allpasses_l = ALLPASS_TUNING
            .iter()
            .map(|&t| {
                let size = ((t as f32) * rate_scale) as usize;
                AllpassFilter::new(size)
            })
            .collect();

        let allpasses_r = ALLPASS_TUNING
            .iter()
            .map(|&t| {
                let size = ((t as f32 + STEREO_SPREAD as f32) * rate_scale) as usize;
                AllpassFilter::new(size)
            })
            .collect();

        let room_size = room_size.clamp(0.0, 1.0);
        let damping = damping.clamp(0.0, 1.0);
        let width = 1.0; // default full stereo
        let feedback = room_size * ROOM_SCALE + ROOM_OFFSET;
        let damp1 = damping;
        let damp2 = 1.0 - damping;
        let wet1 = wet.clamp(0.0, 1.0) * (width * 0.5 + 0.5);
        let wet2 = wet.clamp(0.0, 1.0) * ((1.0 - width) * 0.5);

        Self {
            combs_l,
            combs_r,
            allpasses_l,
            allpasses_r,
            room_size,
            damping,
            width,
            wet: wet.clamp(0.0, 1.0),
            dry: dry.clamp(0.0, 1.0),
            feedback,
            damp1,
            damp2,
            wet1,
            wet2,
        }
    }

    fn update_wet_gains(&mut self) {
        self.wet1 = self.wet * (self.width * 0.5 + 0.5);
        self.wet2 = self.wet * ((1.0 - self.width) * 0.5);
    }

    /// Set room size (0.0–1.0).
    pub fn set_room_size(&mut self, size: f32) {
        self.room_size = size.clamp(0.0, 1.0);
        self.feedback = self.room_size * ROOM_SCALE + ROOM_OFFSET;
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

    /// Set stereo width (0.0 = mono, 1.0 = full stereo).
    pub fn set_width(&mut self, width: f32) {
        self.width = width.clamp(0.0, 1.0);
        self.update_wet_gains();
    }

    /// Get current width.
    pub fn width(&self) -> f32 {
        self.width
    }

    /// Set wet level (0.0–1.0).
    pub fn set_wet(&mut self, wet: f32) {
        self.wet = wet.clamp(0.0, 1.0);
        self.update_wet_gains();
    }

    /// Set dry level (0.0–1.0).
    pub fn set_dry(&mut self, dry: f32) {
        self.dry = dry.clamp(0.0, 1.0);
    }

    /// Process a single mono sample, returning mono output.
    /// For stereo processing, use `process_stereo`.
    #[inline]
    pub fn process_sample(&mut self, input: f32) -> f32 {
        let (l, r) = self.process_stereo(input, input);
        (l + r) * 0.5
    }

    /// Process a stereo sample pair, returning (left, right).
    #[inline]
    pub fn process_stereo(&mut self, input_l: f32, input_r: f32) -> (f32, f32) {
        let input_mixed = (input_l + input_r) * 0.5;

        // Parallel comb filters (left channel)
        let mut comb_sum_l = 0.0_f32;
        for comb in &mut self.combs_l {
            comb_sum_l += comb.process(input_mixed, self.feedback, self.damp1, self.damp2);
        }
        comb_sum_l *= 0.125; // normalize: 1/8 combs

        // Parallel comb filters (right channel, offset delay lengths)
        let mut comb_sum_r = 0.0_f32;
        for comb in &mut self.combs_r {
            comb_sum_r += comb.process(input_mixed, self.feedback, self.damp1, self.damp2);
        }
        comb_sum_r *= 0.125; // normalize: 1/8 combs

        // Series allpass filters (left)
        let mut out_l = comb_sum_l;
        for ap in &mut self.allpasses_l {
            out_l = ap.process(out_l);
        }

        // Series allpass filters (right)
        let mut out_r = comb_sum_r;
        for ap in &mut self.allpasses_r {
            out_r = ap.process(out_r);
        }

        // Stereo width mixing + wet/dry
        let wet_l = out_l * self.wet1 + out_r * self.wet2;
        let wet_r = out_r * self.wet1 + out_l * self.wet2;

        (input_l * self.dry + wet_l, input_r * self.dry + wet_r)
    }

    /// Process a mono buffer in-place.
    pub fn process_buffer(&mut self, buffer: &mut [f32]) {
        for sample in buffer.iter_mut() {
            *sample = self.process_sample(*sample);
        }
    }

    /// Process an interleaved stereo buffer in-place [L, R, L, R, ...].
    pub fn process_stereo_buffer(&mut self, buffer: &mut [f32]) {
        let len = buffer.len();
        let mut i = 0;
        while i + 1 < len {
            let (l, r) = self.process_stereo(buffer[i], buffer[i + 1]);
            buffer[i] = l;
            buffer[i + 1] = r;
            i += 2;
        }
    }

    /// Clear all internal delay buffers (call on seek/stop).
    pub fn reset(&mut self) {
        for comb in &mut self.combs_l {
            comb.clear();
        }
        for comb in &mut self.combs_r {
            comb.clear();
        }
        for ap in &mut self.allpasses_l {
            ap.clear();
        }
        for ap in &mut self.allpasses_r {
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
        // No damping = bright
        let mut bright = Reverb::new(44100.0, 0.7, 0.0, 1.0, 0.0);
        bright.process_sample(1.0);
        let mut bright_energy = 0.0_f32;
        for _ in 0..4410 {
            let s = bright.process_sample(0.0);
            bright_energy += s * s;
        }

        // Full damping = dark
        let mut dark = Reverb::new(44100.0, 0.7, 1.0, 1.0, 0.0);
        dark.process_sample(1.0);
        let mut dark_energy = 0.0_f32;
        for _ in 0..4410 {
            let s = dark.process_sample(0.0);
            dark_energy += s * s;
        }

        assert!(
            bright_energy > dark_energy,
            "Bright ({bright_energy}) should have more energy than dark ({dark_energy})"
        );
    }

    #[test]
    fn test_reverb_reset_clears_tail() {
        let mut rev = Reverb::new(44100.0, 0.8, 0.3, 1.0, 0.0);
        rev.process_sample(1.0);
        for _ in 0..1000 {
            rev.process_sample(0.0);
        }
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
        rev.set_width(0.5);
        assert_eq!(rev.width(), 0.5);
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
        rev.set_width(2.0);
        assert_eq!(rev.width(), 1.0);
    }

    #[test]
    fn test_reverb_48khz() {
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
        let mut max_output = 0.0_f32;
        for _ in 0..44100 {
            let s = rev.process_sample(0.5);
            max_output = max_output.max(s.abs());
        }
        assert!(
            max_output < 5.0,
            "Output should be bounded: {max_output}"
        );
    }

    #[test]
    fn test_stereo_decorrelation() {
        // With full width, L and R channels should differ
        let mut rev = Reverb::new(44100.0, 0.7, 0.3, 1.0, 0.0);

        // Feed impulse through stereo
        let (_l0, _r0) = rev.process_stereo(1.0, 1.0);

        // Collect stereo tail
        let mut diff_energy = 0.0_f32;
        for _ in 0..4410 {
            let (l, r) = rev.process_stereo(0.0, 0.0);
            diff_energy += (l - r) * (l - r);
        }

        // L and R should be different (stereo spread)
        assert!(
            diff_energy > 0.001,
            "Stereo channels should differ: diff_energy={diff_energy}"
        );
    }

    #[test]
    fn test_mono_width_collapses_stereo() {
        // Width = 0 should produce identical L and R
        let mut rev = Reverb::new(44100.0, 0.7, 0.3, 1.0, 0.0);
        rev.set_width(0.0);

        rev.process_stereo(1.0, 1.0);
        let mut max_diff = 0.0_f32;
        for _ in 0..4410 {
            let (l, r) = rev.process_stereo(0.0, 0.0);
            max_diff = max_diff.max((l - r).abs());
        }

        assert!(
            max_diff < 0.01,
            "Mono width should collapse stereo: max_diff={max_diff}"
        );
    }

    #[test]
    fn test_8_combs_denser_than_4() {
        // The 8-comb Freeverb should have more reflection density than a 4-comb version.
        // We test indirectly: the tail should be smoother (lower peak-to-RMS ratio).
        let mut rev = Reverb::new(44100.0, 0.7, 0.3, 1.0, 0.0);
        rev.process_sample(1.0);

        let mut samples = Vec::with_capacity(4410);
        for _ in 0..4410 {
            samples.push(rev.process_sample(0.0));
        }

        let rms = (samples.iter().map(|s| s * s).sum::<f32>() / samples.len() as f32).sqrt();
        let peak = samples.iter().cloned().fold(0.0_f32, |a, b| a.max(b.abs()));

        // Crest factor (peak/RMS) should be reasonable for dense reverb
        let crest = if rms > 1e-10 { peak / rms } else { 0.0 };
        assert!(
            crest < 20.0,
            "Reverb should be dense (low crest factor): crest={crest}, peak={peak}, rms={rms}"
        );
    }

    #[test]
    fn test_stereo_buffer_processing() {
        let mut rev = Reverb::new(44100.0, 0.5, 0.5, 0.5, 1.0);
        let mut buf = [0.5_f32, 0.5, 0.5, 0.5, 0.0, 0.0, 0.0, 0.0];
        rev.process_stereo_buffer(&mut buf);
        // First pair should have dry signal
        assert!(buf[0] > 0.2, "Stereo buffer L: {}", buf[0]);
        assert!(buf[1] > 0.2, "Stereo buffer R: {}", buf[1]);
    }

    #[test]
    fn test_silence_stereo() {
        let mut rev = Reverb::new(44100.0, 0.5, 0.5, 1.0, 0.0);
        let mut buf = [0.0_f32; 64];
        rev.process_stereo_buffer(&mut buf);
        for &s in &buf {
            assert!(s.abs() < 1e-10, "Stereo silence: {s}");
        }
    }
}
