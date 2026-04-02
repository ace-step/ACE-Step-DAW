//! Dattorro Plate Reverb — allpass-loop topology for lush, smooth reverb.
//!
//! Based on Jon Dattorro's "Effect Design Part 1: Reverberator and Other Filters"
//! (JAES 1997). This algorithm uses a figure-of-8 allpass loop tank, which produces
//! a significantly smoother, less metallic sound than Freeverb's parallel-comb topology.
//!
//! Signal flow:
//! ```text
//!   input → pre-delay → input diffusion (4 allpass) → tank
//!
//!   Tank (figure-of-8 loop):
//!     ┌─[delay1]─[mod_ap1]─[delay2]─[damping1]─┐
//!     │                                          ↓
//!     └──────────────[decay]─────────────────────┤
//!     ┌─[delay3]─[mod_ap2]─[delay4]─[damping2]─┐│
//!     │                                          ↓│
//!     └──────────────[decay]─────────────────────┘
//!
//!   output: tapped from multiple points in the tank → stereo
//! ```
//!
//! Parameters:
//! - `room_size` (0.0–1.0): controls decay feedback (longer tail)
//! - `damping` (0.0–1.0): high-frequency absorption in tank
//! - `width` (0.0–1.0): stereo spread
//! - `mod_depth` (0.0–1.0): tank delay modulation for natural diffusion
//! - `pre_delay_ms` (0–100): gap before reverb onset
//! - `wet` / `dry`: mix levels

use crate::ANTI_DENORMAL;

const REFERENCE_RATE: f32 = 29761.0; // Dattorro's reference sample rate

// ── Dattorro delay line lengths (at 29761 Hz reference rate) ───────────
// Input diffusion allpass delays
const INPUT_AP1: usize = 142;
const INPUT_AP2: usize = 107;
const INPUT_AP3: usize = 379;
const INPUT_AP4: usize = 277;

// Tank delays and allpass delays
const TANK_AP1: usize = 672;  // modulated allpass in loop 1
const TANK_DELAY1: usize = 4453;
const TANK_AP2: usize = 908;  // modulated allpass in loop 2
const TANK_DELAY2: usize = 4217;

// Additional tank delays (reserved for future use with extended topology)
const _TANK_PREDELAY1: usize = 908;
const _TANK_PREDELAY2: usize = 672;

// Output tap positions (relative to tank delays, at reference rate)
const TAP_L1: usize = 266;
const TAP_L2: usize = 2974;
const TAP_L3: usize = 1913;
const TAP_L4: usize = 1996;
const TAP_L5: usize = 1990;
const TAP_L6: usize = 187;
const TAP_R1: usize = 353;
const TAP_R2: usize = 3627;
const TAP_R3: usize = 1228;
const TAP_R4: usize = 2058;
const TAP_R5: usize = 2111;
const TAP_R6: usize = 335;

// Input diffusion coefficients
const INPUT_DIFF1: f32 = 0.75;
const INPUT_DIFF2: f32 = 0.625;

// Tank decay diffusion
const DECAY_DIFF1: f32 = 0.7;
const DECAY_DIFF2: f32 = 0.5;

// ── Helper: scale delay length to actual sample rate ──────────────────

fn scale_delay(base: usize, rate: f32) -> usize {
    ((base as f32 * rate / REFERENCE_RATE) as usize).max(1)
}

// ── Simple delay line ─────────────────────────────────────────────────

struct Delay {
    buffer: Vec<f32>,
    write_pos: usize,
}

impl Delay {
    fn new(size: usize) -> Self {
        Self {
            buffer: vec![0.0; size.max(1)],
            write_pos: 0,
        }
    }

    fn len(&self) -> usize {
        self.buffer.len()
    }

    /// Write a sample and return the oldest sample (FIFO delay).
    #[inline]
    fn process(&mut self, input: f32) -> f32 {
        let output = self.buffer[self.write_pos];
        self.buffer[self.write_pos] = input;
        self.write_pos = (self.write_pos + 1) % self.buffer.len();
        output
    }

    /// Read at a fractional delay from the write head (for modulation).
    #[inline]
    fn read_at(&self, delay_samples: f32) -> f32 {
        let len = self.buffer.len() as f32;
        let pos = self.write_pos as f32 - delay_samples;
        let pos = if pos < 0.0 { pos + len } else { pos };
        let idx0 = pos as usize % self.buffer.len();
        let idx1 = (idx0 + 1) % self.buffer.len();
        let frac = pos - pos.floor();
        self.buffer[idx0] * (1.0 - frac) + self.buffer[idx1] * frac
    }

    fn clear(&mut self) {
        self.buffer.fill(0.0);
        self.write_pos = 0;
    }
}

// ── Allpass filter (Schroeder type) ───────────────────────────────────

struct Allpass {
    delay: Delay,
}

impl Allpass {
    fn new(size: usize) -> Self {
        Self {
            delay: Delay::new(size),
        }
    }

    #[inline]
    fn process(&mut self, input: f32, coeff: f32) -> f32 {
        let delayed = self.delay.process(input + ANTI_DENORMAL);
        let v = input - coeff * delayed;
        let len = self.delay.buffer.len();
        let idx = if self.delay.write_pos == 0 {
            len - 1
        } else {
            self.delay.write_pos - 1
        };
        let v_guarded = v + ANTI_DENORMAL;
        self.delay.buffer[idx] = v_guarded;
        delayed + coeff * v_guarded
    }

    fn clear(&mut self) {
        self.delay.clear();
    }
}

// ── Modulated allpass (for tank) ──────────────────────────────────────

struct ModAllpass {
    buffer: Vec<f32>,
    write_pos: usize,
    base_delay: f32,
}

impl ModAllpass {
    fn new(size: usize) -> Self {
        Self {
            buffer: vec![0.0; (size + 32).max(1)], // extra samples for modulation excursion
            write_pos: 0,
            base_delay: size as f32,
        }
    }

    /// Process with modulated delay and return output.
    #[inline]
    fn process(&mut self, input: f32, coeff: f32, mod_offset: f32) -> f32 {
        let len = self.buffer.len();
        let delay = (self.base_delay + mod_offset).max(1.0);

        // Read with linear interpolation
        let read_pos = self.write_pos as f32 - delay;
        let read_pos = if read_pos < 0.0 { read_pos + len as f32 } else { read_pos };
        let idx0 = read_pos as usize % len;
        let idx1 = (idx0 + 1) % len;
        let frac = read_pos - read_pos.floor();
        let delayed = self.buffer[idx0] * (1.0 - frac) + self.buffer[idx1] * frac;

        // Allpass structure
        let v = input - coeff * delayed;
        self.buffer[self.write_pos] = v + ANTI_DENORMAL;
        self.write_pos = (self.write_pos + 1) % len;

        delayed + coeff * v
    }

    fn clear(&mut self) {
        self.buffer.fill(0.0);
        self.write_pos = 0;
    }
}

// ── One-pole lowpass for damping ──────────────────────────────────────

struct OnePole {
    state: f32,
}

impl OnePole {
    fn new() -> Self {
        Self { state: 0.0 }
    }

    /// Process with damping coefficient. damp=0 → no filtering, damp=1 → heavy filtering.
    #[inline]
    fn process(&mut self, input: f32, damp: f32) -> f32 {
        self.state = input * (1.0 - damp) + self.state * damp;
        self.state
    }

    fn clear(&mut self) {
        self.state = 0.0;
    }
}

// ── LFO for tank modulation ──────────────────────────────────────────

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

    #[inline]
    fn next(&mut self) -> f32 {
        let val = (self.phase * core::f32::consts::TAU).sin();
        self.phase += self.phase_inc;
        if self.phase >= 1.0 {
            self.phase -= 1.0;
        }
        val
    }

    fn reset(&mut self) {
        self.phase = 0.0;
    }
}

// ── Public Dattorro Plate Reverb ─────────────────────────────────────

/// Dattorro plate reverb processor.
///
/// Uses the allpass-loop (figure-of-8) topology from Dattorro's JAES 1997 paper.
/// Produces a lush, smooth plate-like reverb without the metallic ringing of
/// parallel-comb designs like Freeverb.
pub struct Reverb {
    // Input path
    pre_delay: Delay,
    input_ap1: Allpass,
    input_ap2: Allpass,
    input_ap3: Allpass,
    input_ap4: Allpass,

    // Tank loop 1
    tank_mod_ap1: ModAllpass,
    tank_delay1: Delay,
    tank_damp1: OnePole,

    // Tank loop 2
    tank_mod_ap2: ModAllpass,
    tank_delay2: Delay,
    tank_damp2: OnePole,

    // Cross-feedback between loops
    tank_feedback1: f32, // stored from end of loop 2
    tank_feedback2: f32, // stored from end of loop 1

    // Modulation
    lfo1: Lfo,
    lfo2: Lfo,

    // Parameters
    room_size: f32,
    damping: f32,
    width: f32,
    mod_depth: f32,
    wet: f32,
    dry: f32,

    // Derived
    decay: f32,
    wet1: f32, // cached: wet * (width * 0.5 + 0.5)
    wet2: f32, // cached: wet * ((1.0 - width) * 0.5)
    sample_rate: f32,

    // Scaled tap positions for output
    tap_l1: usize,
    tap_l2: usize,
    tap_l3: usize,
    tap_l4: usize,
    tap_l5: usize,
    tap_l6: usize,
    tap_r1: usize,
    tap_r2: usize,
    tap_r3: usize,
    tap_r4: usize,
    tap_r5: usize,
    tap_r6: usize,
}

impl Reverb {
    /// Create a new Dattorro plate reverb.
    ///
    /// - `room_size`: 0.0 (small/short) to 1.0 (large/long) — controls decay
    /// - `damping`: 0.0 (bright) to 1.0 (dark)
    /// - `wet`: wet signal level
    /// - `dry`: dry signal level
    pub fn new(sample_rate: f32, room_size: f32, damping: f32, wet: f32, dry: f32) -> Self {
        let room_size = room_size.clamp(0.0, 1.0);
        let damping = damping.clamp(0.0, 1.0);
        let decay = room_size * 0.35 + 0.6; // map 0..1 → 0.6..0.95

        let pre_delay_samples = scale_delay(1, sample_rate); // minimal default pre-delay

        let rev = Self {
            pre_delay: Delay::new(pre_delay_samples.max(1)),
            input_ap1: Allpass::new(scale_delay(INPUT_AP1, sample_rate)),
            input_ap2: Allpass::new(scale_delay(INPUT_AP2, sample_rate)),
            input_ap3: Allpass::new(scale_delay(INPUT_AP3, sample_rate)),
            input_ap4: Allpass::new(scale_delay(INPUT_AP4, sample_rate)),

            tank_mod_ap1: ModAllpass::new(scale_delay(TANK_AP1, sample_rate)),
            tank_delay1: Delay::new(scale_delay(TANK_DELAY1, sample_rate)),
            tank_damp1: OnePole::new(),

            tank_mod_ap2: ModAllpass::new(scale_delay(TANK_AP2, sample_rate)),
            tank_delay2: Delay::new(scale_delay(TANK_DELAY2, sample_rate)),
            tank_damp2: OnePole::new(),

            tank_feedback1: 0.0,
            tank_feedback2: 0.0,

            lfo1: Lfo::new(0.7, sample_rate),
            lfo2: Lfo::new(0.8, sample_rate), // slightly different rate for decorrelation

            room_size,
            damping,
            width: 1.0,
            mod_depth: 0.3,
            wet: wet.clamp(0.0, 1.0),
            dry: dry.clamp(0.0, 1.0),
            decay,
            wet1: wet.clamp(0.0, 1.0) * (1.0 * 0.5 + 0.5), // width=1.0 default
            wet2: wet.clamp(0.0, 1.0) * ((1.0 - 1.0) * 0.5),
            sample_rate,

            tap_l1: scale_delay(TAP_L1, sample_rate),
            tap_l2: scale_delay(TAP_L2, sample_rate),
            tap_l3: scale_delay(TAP_L3, sample_rate),
            tap_l4: scale_delay(TAP_L4, sample_rate),
            tap_l5: scale_delay(TAP_L5, sample_rate),
            tap_l6: scale_delay(TAP_L6, sample_rate),
            tap_r1: scale_delay(TAP_R1, sample_rate),
            tap_r2: scale_delay(TAP_R2, sample_rate),
            tap_r3: scale_delay(TAP_R3, sample_rate),
            tap_r4: scale_delay(TAP_R4, sample_rate),
            tap_r5: scale_delay(TAP_R5, sample_rate),
            tap_r6: scale_delay(TAP_R6, sample_rate),
        };
        rev
    }

    // ── Internal helpers ─────────────────────────────────────────────

    fn update_wet_gains(&mut self) {
        self.wet1 = self.wet * (self.width * 0.5 + 0.5);
        self.wet2 = self.wet * ((1.0 - self.width) * 0.5);
    }

    // ── Parameter setters ────────────────────────────────────────────

    pub fn set_room_size(&mut self, size: f32) {
        self.room_size = size.clamp(0.0, 1.0);
        self.decay = self.room_size * 0.35 + 0.6;
    }

    pub fn room_size(&self) -> f32 {
        self.room_size
    }

    pub fn set_damping(&mut self, damping: f32) {
        self.damping = damping.clamp(0.0, 1.0);
    }

    pub fn damping(&self) -> f32 {
        self.damping
    }

    pub fn set_width(&mut self, width: f32) {
        self.width = width.clamp(0.0, 1.0);
        self.update_wet_gains();
    }

    pub fn width(&self) -> f32 {
        self.width
    }

    pub fn set_mod_depth(&mut self, depth: f32) {
        self.mod_depth = depth.clamp(0.0, 1.0);
    }

    pub fn set_wet(&mut self, wet: f32) {
        self.wet = wet.clamp(0.0, 1.0);
        self.update_wet_gains();
    }

    pub fn set_dry(&mut self, dry: f32) {
        self.dry = dry.clamp(0.0, 1.0);
    }

    /// Set pre-delay in milliseconds (clamped to 0–100ms). Resizes the pre-delay buffer.
    pub fn set_pre_delay(&mut self, ms: f32) {
        let samples = ((ms.clamp(0.0, 100.0) * self.sample_rate / 1000.0) as usize).max(1);
        if samples != self.pre_delay.len() {
            self.pre_delay = Delay::new(samples);
        }
    }

    // ── Processing ───────────────────────────────────────────────────

    /// Process a mono sample, returning mono output.
    #[inline]
    pub fn process_sample(&mut self, input: f32) -> f32 {
        let (l, r) = self.process_stereo(input, input);
        (l + r) * 0.5
    }

    /// Process a stereo sample pair, returning (left, right).
    #[inline]
    pub fn process_stereo(&mut self, input_l: f32, input_r: f32) -> (f32, f32) {
        let input = (input_l + input_r) * 0.5;

        // Pre-delay
        let pre = self.pre_delay.process(input);

        // Input diffusion: 4 series allpass filters
        let d1 = self.input_ap1.process(pre, INPUT_DIFF1);
        let d2 = self.input_ap2.process(d1, INPUT_DIFF1);
        let d3 = self.input_ap3.process(d2, INPUT_DIFF2);
        let d4 = self.input_ap4.process(d3, INPUT_DIFF2);

        // Tank modulation
        let max_excursion = self.mod_depth * 16.0; // max ±16 samples
        let mod1 = self.lfo1.next() * max_excursion;
        let mod2 = self.lfo2.next() * max_excursion;

        // ── Tank Loop 1 ──────────────────────────────────────────
        // Input to loop 1 = diffused input + decay feedback from loop 2
        let tank1_in = d4 + self.tank_feedback1 * self.decay;

        // Modulated allpass
        let tank1_ap = self.tank_mod_ap1.process(tank1_in, DECAY_DIFF1, mod1);

        // Delay
        let tank1_del = self.tank_delay1.process(tank1_ap);

        // Damping
        let tank1_damp = self.tank_damp1.process(tank1_del, self.damping);

        // Store for loop 2's feedback
        self.tank_feedback2 = tank1_damp;

        // ── Tank Loop 2 ──────────────────────────────────────────
        let tank2_in = d4 + self.tank_feedback2 * self.decay;

        // Modulated allpass
        let tank2_ap = self.tank_mod_ap2.process(tank2_in, DECAY_DIFF2, mod2);

        // Delay
        let tank2_del = self.tank_delay2.process(tank2_ap);

        // Damping
        let tank2_damp = self.tank_damp2.process(tank2_del, self.damping);

        // Store for loop 1's feedback
        self.tank_feedback1 = tank2_damp;

        // ── Output taps ──────────────────────────────────────────
        // Tap from various positions in the tank delays
        let d1_len = self.tank_delay1.len() as f32;
        let d2_len = self.tank_delay2.len() as f32;

        let out_l = self.tank_delay1.read_at((self.tap_l1 as f32).min(d1_len - 1.0))
            + self.tank_delay1.read_at((self.tap_l2 as f32).min(d1_len - 1.0))
            - self.tank_delay2.read_at((self.tap_l3 as f32).min(d2_len - 1.0))
            + self.tank_delay2.read_at((self.tap_l4 as f32).min(d2_len - 1.0))
            - self.tank_delay1.read_at((self.tap_l5 as f32).min(d1_len - 1.0))
            - self.tank_delay2.read_at((self.tap_l6 as f32).min(d2_len - 1.0));

        let out_r = self.tank_delay2.read_at((self.tap_r1 as f32).min(d2_len - 1.0))
            + self.tank_delay2.read_at((self.tap_r2 as f32).min(d2_len - 1.0))
            - self.tank_delay1.read_at((self.tap_r3 as f32).min(d1_len - 1.0))
            + self.tank_delay1.read_at((self.tap_r4 as f32).min(d1_len - 1.0))
            - self.tank_delay2.read_at((self.tap_r5 as f32).min(d2_len - 1.0))
            - self.tank_delay1.read_at((self.tap_r6 as f32).min(d1_len - 1.0));

        // Normalize output taps
        let out_l = out_l * 0.15;
        let out_r = out_r * 0.15;

        // Stereo width (wet1/wet2 cached, updated in set_wet/set_width)
        let wet_l = out_l * self.wet1 + out_r * self.wet2;
        let wet_r = out_r * self.wet1 + out_l * self.wet2;

        (input_l * self.dry + wet_l, input_r * self.dry + wet_r)
    }

    /// Process a mono buffer in-place.
    pub fn process_mono_buffer(&mut self, buffer: &mut [f32]) {
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
        self.pre_delay.clear();
        self.input_ap1.clear();
        self.input_ap2.clear();
        self.input_ap3.clear();
        self.input_ap4.clear();
        self.tank_mod_ap1.clear();
        self.tank_delay1.clear();
        self.tank_damp1.clear();
        self.tank_mod_ap2.clear();
        self.tank_delay2.clear();
        self.tank_damp2.clear();
        self.tank_feedback1 = 0.0;
        self.tank_feedback2 = 0.0;
        self.lfo1.reset();
        self.lfo2.reset();
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
        rev.process_mono_buffer(&mut buf);
        for s in &buf {
            assert!(s.abs() < 1e-6, "Expected silence, got {s}");
        }
    }

    #[test]
    fn test_reverb_impulse_response_has_tail() {
        let mut rev = Reverb::new(44100.0, 0.8, 0.3, 1.0, 0.0);

        let _out0 = rev.process_sample(1.0);
        let mut tail_energy = 0.0_f32;
        for _ in 0..4410 {
            let s = rev.process_sample(0.0);
            tail_energy += s * s;
        }

        assert!(
            tail_energy > 0.001,
            "Reverb tail should have energy: {tail_energy}"
        );
    }

    #[test]
    fn test_reverb_dry_passthrough() {
        let mut rev = Reverb::new(44100.0, 0.5, 0.5, 0.0, 1.0);
        let mut buf = [0.5_f32; 128];
        rev.process_mono_buffer(&mut buf);
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
            out.abs() < 0.1,
            "Wet-only first sample should be near-zero: {out}"
        );
    }

    #[test]
    fn test_reverb_room_size_affects_decay() {
        let mut small = Reverb::new(44100.0, 0.1, 0.5, 1.0, 0.0);
        small.process_sample(1.0);
        let mut small_energy = 0.0_f32;
        for _ in 0..44100 {
            let s = small.process_sample(0.0);
            small_energy += s * s;
        }

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
        // Need enough samples for multiple tank recirculations (tank loop ~7600 samples at 44100)
        let num_samples = 44100; // 1 second — several tank loops
        let mut bright = Reverb::new(44100.0, 0.7, 0.0, 1.0, 0.0);
        bright.process_sample(1.0);
        let mut bright_energy = 0.0_f32;
        for _ in 0..num_samples {
            let s = bright.process_sample(0.0);
            bright_energy += s * s;
        }

        let mut dark = Reverb::new(44100.0, 0.7, 1.0, 1.0, 0.0);
        dark.process_sample(1.0);
        let mut dark_energy = 0.0_f32;
        for _ in 0..num_samples {
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
        assert!(s.abs() < 1e-6, "After reset, output should be silence: {s}");
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
        assert!(energy > 0.001, "48kHz reverb should work: {energy}");
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
        let mut rev = Reverb::new(44100.0, 0.7, 0.3, 1.0, 0.0);

        let (_l0, _r0) = rev.process_stereo(1.0, 1.0);
        let mut diff_energy = 0.0_f32;
        for _ in 0..4410 {
            let (l, r) = rev.process_stereo(0.0, 0.0);
            diff_energy += (l - r) * (l - r);
        }

        assert!(
            diff_energy > 0.0001,
            "Stereo channels should differ: diff_energy={diff_energy}"
        );
    }

    #[test]
    fn test_mono_width_collapses_stereo() {
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
    fn test_stereo_buffer_processing() {
        let mut rev = Reverb::new(44100.0, 0.5, 0.5, 0.5, 1.0);
        let mut buf = [0.5_f32, 0.5, 0.5, 0.5, 0.0, 0.0, 0.0, 0.0];
        rev.process_stereo_buffer(&mut buf);
        assert!(buf[0] > 0.2, "Stereo buffer L: {}", buf[0]);
        assert!(buf[1] > 0.2, "Stereo buffer R: {}", buf[1]);
    }

    #[test]
    fn test_silence_stereo() {
        let mut rev = Reverb::new(44100.0, 0.5, 0.5, 1.0, 0.0);
        let mut buf = [0.0_f32; 64];
        rev.process_stereo_buffer(&mut buf);
        for &s in &buf {
            assert!(s.abs() < 1e-6, "Stereo silence: {s}");
        }
    }

    // ── New Dattorro-specific tests ──────────────────────────────────

    #[test]
    fn test_dattorro_smoothness_no_metallic_ringing() {
        // Dattorro should produce smoother impulse response than Freeverb.
        // Test: the crest factor (peak/RMS) should be low, indicating dense reflections.
        let mut rev = Reverb::new(44100.0, 0.7, 0.3, 1.0, 0.0);
        rev.process_sample(1.0);

        let mut samples = Vec::with_capacity(4410);
        for _ in 0..4410 {
            samples.push(rev.process_sample(0.0));
        }

        let rms = (samples.iter().map(|s| s * s).sum::<f32>() / samples.len() as f32).sqrt();
        let peak = samples.iter().cloned().fold(0.0_f32, |a, b| a.max(b.abs()));

        let crest = if rms > 1e-10 { peak / rms } else { 0.0 };
        assert!(
            crest < 20.0,
            "Dattorro should be dense (low crest factor): crest={crest}, peak={peak}, rms={rms}"
        );
    }

    #[test]
    fn test_modulation_creates_variation() {
        // With modulation, consecutive impulse responses should differ slightly
        let mut rev = Reverb::new(44100.0, 0.7, 0.3, 1.0, 0.0);
        rev.set_mod_depth(1.0); // max modulation

        // First impulse
        rev.process_sample(1.0);
        let mut ir1 = Vec::with_capacity(1000);
        for _ in 0..1000 {
            ir1.push(rev.process_sample(0.0));
        }

        // Wait for tail to decay, then second impulse
        for _ in 0..44100 {
            rev.process_sample(0.0);
        }
        rev.process_sample(1.0);
        let mut ir2 = Vec::with_capacity(1000);
        for _ in 0..1000 {
            ir2.push(rev.process_sample(0.0));
        }

        // IRs should differ due to LFO phase being different
        let diff: f32 = ir1.iter().zip(ir2.iter())
            .map(|(a, b)| (a - b).abs())
            .sum();

        assert!(
            diff > 0.001,
            "Modulated reverb should produce varying IRs: diff={diff}"
        );
    }

    #[test]
    fn test_pre_delay() {
        let mut rev = Reverb::new(44100.0, 0.5, 0.3, 1.0, 0.0);
        rev.set_pre_delay(50.0); // 50ms pre-delay

        // Feed impulse
        rev.process_sample(1.0);

        // For the first ~50ms (2205 samples), output should be near-zero
        let mut early_energy = 0.0_f32;
        for _ in 0..2000 {
            let s = rev.process_sample(0.0);
            early_energy += s * s;
        }

        // After the pre-delay, tail should develop
        let mut late_energy = 0.0_f32;
        for _ in 0..4410 {
            let s = rev.process_sample(0.0);
            late_energy += s * s;
        }

        assert!(
            late_energy > early_energy * 2.0,
            "Pre-delay should cause late energy > early: early={early_energy}, late={late_energy}"
        );
    }

    #[test]
    fn test_input_diffusion_smooths_impulse() {
        // The 4-stage input diffusion should spread the impulse energy
        // across time, preventing sharp peaks in the early reflections.
        let mut rev = Reverb::new(44100.0, 0.5, 0.3, 1.0, 0.0);

        rev.process_sample(1.0);
        let mut peak = 0.0_f32;
        for _ in 0..4410 {
            let s = rev.process_sample(0.0);
            peak = peak.max(s.abs());
        }

        // Peak should be much lower than input (diffused across time)
        assert!(
            peak < 0.5,
            "Diffusion should spread energy, peak should be low: {peak}"
        );
    }
}
