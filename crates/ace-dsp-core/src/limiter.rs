//! Limiter — brick-wall peak limiter with true lookahead.
//!
//! Uses a sliding-maximum over the lookahead window to predict upcoming peaks
//! and smoothly ramp down gain *before* the peak arrives. This prevents
//! distortion artifacts that occur with instant-attack limiters.
//!
//! Algorithm based on Signalsmith Audio's limiter design:
//! - Sliding maximum finds the worst-case peak in the lookahead window
//! - Linear attack ramp spreads gain reduction over the lookahead period
//! - Exponential release for smooth recovery
//!
//! Parameters:
//! - `ceiling_db`: maximum output level (typically -0.1 to 0.0 dB)
//! - `release_ms`: gain recovery time after limiting
//! - `lookahead_ms`: anticipation window (1–10ms)

use crate::ANTI_DENORMAL;

/// Convert dB to linear.
#[inline]
fn db_to_lin(db: f32) -> f32 {
    10.0_f32.powf(db / 20.0)
}

/// Convert linear to dB.
#[inline]
fn lin_to_db(lin: f32) -> f32 {
    if lin <= 0.0 {
        -120.0
    } else {
        20.0 * lin.log10()
    }
}

/// O(1) amortized sliding maximum using a monotone deque.
/// Tracks the maximum value in a sliding window of fixed size.
struct SlidingMax {
    /// Ring buffer of (value, insertion_index) pairs.
    /// Maintained as a monotone decreasing deque: front is always the max.
    deque: Vec<(f32, u64)>,
    head: usize,   // front of deque
    tail: usize,   // back of deque (next write position)
    count: usize,  // number of valid entries
    capacity: usize,
    window_size: u64,
    /// Use u64 to avoid overflow on wasm32 (usize is 32-bit, wraps after ~27h at 44.1kHz)
    global_idx: u64,
}

impl SlidingMax {
    fn new(window_size: usize) -> Self {
        let capacity = window_size + 1;
        Self {
            deque: vec![(0.0, 0u64); capacity],
            head: 0,
            tail: 0,
            count: 0,
            capacity,
            window_size: window_size as u64,
            global_idx: 0,
        }
    }

    /// Push a new value and return the current maximum over the window.
    #[inline]
    fn push(&mut self, value: f32) -> f32 {
        let idx = self.global_idx;
        self.global_idx += 1;

        // Remove elements from back that are smaller than the new value
        // (they can never be the maximum while this value is in the window)
        while self.count > 0 {
            let back = if self.tail == 0 { self.capacity - 1 } else { self.tail - 1 };
            if self.deque[back].0 <= value {
                self.tail = back;
                self.count -= 1;
            } else {
                break;
            }
        }

        // Add new element at back
        self.deque[self.tail] = (value, idx);
        self.tail = (self.tail + 1) % self.capacity;
        self.count += 1;

        // Remove elements from front that have fallen out of the window
        while self.count > 0 && self.deque[self.head].1 + self.window_size <= idx {
            self.head = (self.head + 1) % self.capacity;
            self.count -= 1;
        }

        // Front is the maximum
        if self.count > 0 {
            self.deque[self.head].0
        } else {
            0.0
        }
    }

    fn reset(&mut self) {
        self.head = 0;
        self.tail = 0;
        self.count = 0;
        self.global_idx = 0;
    }
}

/// Brick-wall peak limiter with true lookahead prediction.
pub struct Limiter {
    ceiling: f32,      // linear ceiling level
    ceiling_db: f32,
    release_coeff: f32,
    /// Delay line for the audio signal (lookahead) — mono/left channel
    delay_buf: Vec<f32>,
    /// Delay line for right channel (stereo processing)
    delay_buf_r: Vec<f32>,
    delay_len: usize,
    write_pos: usize,
    /// Sliding maximum over the lookahead window
    sliding_max: SlidingMax,
    /// Current gain envelope (linear, ≤ 1.0)
    envelope: f32,
    /// Attack increment per sample (1.0 / lookahead_samples)
    attack_step: f32,
    sample_rate: f32,
    release_ms: f32,
    gain_reduction_db: f32,
}

impl Limiter {
    /// Create a new limiter.
    ///
    /// - `sample_rate`: audio sample rate
    /// - `ceiling_db`: max output level in dB (e.g., -0.1)
    /// - `release_ms`: gain recovery time (10–500ms)
    /// - `lookahead_ms`: anticipation window (1–10ms)
    pub fn new(sample_rate: f32, ceiling_db: f32, release_ms: f32, lookahead_ms: f32) -> Self {
        let ceiling_db = ceiling_db.min(0.0);
        let lookahead_samples = ((lookahead_ms * sample_rate / 1000.0) as usize).max(1);
        let release_coeff = (-1.0 / (release_ms * sample_rate / 1000.0)).exp();

        Self {
            ceiling: db_to_lin(ceiling_db),
            ceiling_db,
            release_coeff,
            delay_buf: vec![0.0; lookahead_samples],
            delay_buf_r: vec![0.0; lookahead_samples],
            delay_len: lookahead_samples,
            write_pos: 0,
            sliding_max: SlidingMax::new(lookahead_samples),
            envelope: 1.0,
            attack_step: 1.0 / lookahead_samples as f32,
            sample_rate,
            release_ms,
            gain_reduction_db: 0.0,
        }
    }

    /// Set ceiling in dB.
    pub fn set_ceiling(&mut self, ceiling_db: f32) {
        self.ceiling_db = ceiling_db.min(0.0);
        self.ceiling = db_to_lin(self.ceiling_db);
    }

    /// Get ceiling in dB.
    pub fn ceiling_db(&self) -> f32 {
        self.ceiling_db
    }

    /// Set release time in ms.
    pub fn set_release(&mut self, release_ms: f32) {
        self.release_ms = release_ms.max(1.0);
        self.release_coeff = (-1.0 / (self.release_ms * self.sample_rate / 1000.0)).exp();
    }

    /// Get current gain reduction in dB (for metering, always ≤ 0).
    pub fn gain_reduction_db(&self) -> f32 {
        self.gain_reduction_db
    }

    /// Process a single sample.
    ///
    /// The algorithm:
    /// 1. Feed incoming |sample| into sliding maximum over lookahead window
    /// 2. Compute the target gain from the worst-case peak in the window
    /// 3. Smoothly approach the target: linear ramp down (attack), exp ramp up (release)
    /// 4. Output the delayed sample × gain envelope
    #[inline]
    pub fn process_sample(&mut self, input: f32) -> f32 {
        // Write to delay buffer, read delayed sample
        let delayed = self.delay_buf[self.write_pos];
        self.delay_buf[self.write_pos] = input;
        self.write_pos += 1;
        if self.write_pos >= self.delay_len {
            self.write_pos = 0;
        }

        // Find the maximum peak in the lookahead window
        let peak = self.sliding_max.push(input.abs() + ANTI_DENORMAL);

        // Compute target gain to keep the peak at or below ceiling
        let target_gain = if peak > self.ceiling {
            self.ceiling / peak
        } else {
            1.0
        };

        // Envelope follower with linear attack (spread over lookahead) and exp release
        if target_gain < self.envelope {
            // Attack: linear ramp down — decrease by 1/lookahead_samples per sample.
            // This guarantees the envelope reaches any target within the lookahead window,
            // since from 1.0 it reaches 0.0 in exactly lookahead_samples steps.
            self.envelope = (self.envelope - self.attack_step).max(target_gain);
        } else {
            // Release: exponential recovery
            self.envelope = target_gain + self.release_coeff * (self.envelope - target_gain);
        }

        // Track gain reduction for metering
        self.gain_reduction_db = lin_to_db(self.envelope).min(0.0);

        // Apply gain to the delayed sample
        delayed * self.envelope
    }

    /// Process a mono buffer in-place.
    pub fn process_buffer(&mut self, buffer: &mut [f32]) {
        for sample in buffer.iter_mut() {
            *sample = self.process_sample(*sample);
        }
    }

    /// Process an interleaved stereo buffer [L, R, L, R, ...] in-place.
    /// Uses max(|L|, |R|) for linked peak detection so both channels get
    /// identical gain and delay, avoiding inter-channel mismatch.
    pub fn process_stereo_interleaved(&mut self, buffer: &mut [f32]) {
        let len = buffer.len();
        let mut i = 0;
        while i + 1 < len {
            let l_in = buffer[i];
            let r_in = buffer[i + 1];

            // Linked peak = max of both channels
            let peak = l_in.abs().max(r_in.abs());

            // Feed linked peak into sliding max
            let lookahead_peak = self.sliding_max.push(peak);

            // Target gain from lookahead peak
            let target_gain = if lookahead_peak > self.ceiling {
                self.ceiling / lookahead_peak
            } else {
                1.0
            };

            // Envelope follower
            if target_gain < self.envelope {
                self.envelope = (self.envelope - self.attack_step).max(target_gain);
            } else {
                self.envelope = target_gain + self.release_coeff * (self.envelope - target_gain);
            }

            self.gain_reduction_db = lin_to_db(self.envelope).min(0.0);

            // Read delayed L and R from separate delay buffers
            let delayed_l = self.delay_buf[self.write_pos];
            let delayed_r = self.delay_buf_r[self.write_pos];

            // Write current L/R into delay buffers
            self.delay_buf[self.write_pos] = l_in;
            self.delay_buf_r[self.write_pos] = r_in;
            self.write_pos = (self.write_pos + 1) % self.delay_len;

            // Apply same gain to both channels
            buffer[i] = delayed_l * self.envelope;
            buffer[i + 1] = delayed_r * self.envelope;

            i += 2;
        }
    }

    /// Clear internal state.
    pub fn reset(&mut self) {
        self.delay_buf.fill(0.0);
        self.delay_buf_r.fill(0.0);
        self.write_pos = 0;
        self.sliding_max.reset();
        self.envelope = 1.0;
        self.gain_reduction_db = 0.0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_creation() {
        let lim = Limiter::new(44100.0, -0.1, 100.0, 5.0);
        assert!((lim.ceiling_db() - -0.1).abs() < 0.01);
    }

    #[test]
    fn test_quiet_signal_passthrough() {
        let mut lim = Limiter::new(44100.0, -0.1, 100.0, 5.0);
        // Signal well below ceiling should pass through (after lookahead delay)
        for _ in 0..500 {
            lim.process_sample(0.1);
        }
        let out = lim.process_sample(0.1);
        assert!(
            (out - 0.1).abs() < 0.01,
            "Quiet signal should pass: {out}"
        );
    }

    #[test]
    fn test_loud_signal_limited() {
        let mut lim = Limiter::new(44100.0, -1.0, 50.0, 5.0);
        // ceiling = -1dB ≈ 0.891
        let ceiling = db_to_lin(-1.0);

        // Feed loud signal long enough to settle
        for _ in 0..4410 {
            lim.process_sample(1.0);
        }

        // After settling, output should not exceed ceiling
        let mut max_out = 0.0_f32;
        for _ in 0..4410 {
            let s = lim.process_sample(1.0);
            max_out = max_out.max(s.abs());
        }
        assert!(
            max_out <= ceiling + 0.01,
            "Should be limited to {ceiling}: max={max_out}"
        );
    }

    #[test]
    fn test_gain_reduction_reported() {
        let mut lim = Limiter::new(44100.0, -3.0, 100.0, 5.0);
        for _ in 0..4410 {
            lim.process_sample(1.0);
        }
        assert!(
            lim.gain_reduction_db() < -0.5,
            "Should report GR: {}",
            lim.gain_reduction_db()
        );
    }

    #[test]
    fn test_no_gr_when_quiet() {
        let mut lim = Limiter::new(44100.0, -0.1, 100.0, 5.0);
        for _ in 0..1000 {
            lim.process_sample(0.01);
        }
        assert!(
            lim.gain_reduction_db() > -0.5,
            "No GR expected: {}",
            lim.gain_reduction_db()
        );
    }

    #[test]
    fn test_lookahead_delay() {
        let mut lim = Limiter::new(44100.0, 0.0, 100.0, 5.0);
        // 5ms at 44100 = 220 samples of lookahead
        // First output should be 0 (from empty buffer)
        let out0 = lim.process_sample(1.0);
        assert!(
            out0.abs() < 0.01,
            "Lookahead should delay: {out0}"
        );
    }

    #[test]
    fn test_release_recovery() {
        let mut lim = Limiter::new(44100.0, -6.0, 50.0, 2.0);
        // Feed loud signal to engage limiting
        for _ in 0..4410 {
            lim.process_sample(1.0);
        }
        let gr_during = lim.gain_reduction_db();

        // Feed silence, let release happen
        for _ in 0..44100 {
            lim.process_sample(0.0);
        }
        let gr_after = lim.gain_reduction_db();

        assert!(
            gr_after > gr_during,
            "Release should recover: during={gr_during}, after={gr_after}"
        );
    }

    #[test]
    fn test_set_ceiling() {
        let mut lim = Limiter::new(44100.0, -0.1, 100.0, 5.0);
        lim.set_ceiling(-3.0);
        assert!((lim.ceiling_db() - -3.0).abs() < 0.01);
    }

    #[test]
    fn test_set_release() {
        let mut lim = Limiter::new(44100.0, -0.1, 100.0, 5.0);
        lim.set_release(200.0);
    }

    #[test]
    fn test_reset() {
        let mut lim = Limiter::new(44100.0, -3.0, 100.0, 5.0);
        for _ in 0..4410 {
            lim.process_sample(1.0);
        }
        lim.reset();
        assert!((lim.gain_reduction_db() - 0.0).abs() < 0.01);
        let out = lim.process_sample(0.0);
        assert!(out.abs() < 1e-10, "After reset: {out}");
    }

    #[test]
    fn test_silence_passthrough() {
        let mut lim = Limiter::new(44100.0, -0.1, 100.0, 5.0);
        let mut buf = [0.0_f32; 512];
        lim.process_buffer(&mut buf);
        for s in &buf {
            assert!(s.abs() < 1e-10, "Silence: {s}");
        }
    }

    #[test]
    fn test_48khz() {
        let mut lim = Limiter::new(48000.0, -1.0, 100.0, 5.0);
        for _ in 0..4800 {
            lim.process_sample(1.0);
        }
        assert!(lim.gain_reduction_db() < 0.0);
    }

    #[test]
    fn test_ceiling_positive_clamped() {
        let lim = Limiter::new(44100.0, 3.0, 100.0, 5.0);
        assert!(lim.ceiling_db() <= 0.0, "Ceiling should be ≤0: {}", lim.ceiling_db());
    }

    #[test]
    fn test_transient_no_click() {
        // Verify that a sudden transient doesn't produce a click
        // because the lookahead allows smooth gain ramp
        let mut lim = Limiter::new(44100.0, -6.0, 100.0, 5.0);
        let ceiling = db_to_lin(-6.0);

        // Feed silence first to fill lookahead
        for _ in 0..500 {
            lim.process_sample(0.0);
        }

        // Sudden loud transient
        let mut outputs = Vec::new();
        for _ in 0..500 {
            outputs.push(lim.process_sample(1.0));
        }

        // Check that output never exceeds ceiling after settling
        // (first lookahead_samples may overshoot slightly due to the delay)
        let lookahead = (5.0 * 44100.0 / 1000.0) as usize; // ~220 samples
        for (i, &s) in outputs[lookahead..].iter().enumerate() {
            assert!(
                s.abs() <= ceiling + 0.02,
                "Sample {} exceeds ceiling: {} > {}",
                i + lookahead, s, ceiling
            );
        }

        // Verify smooth ramp within the limited signal portion
        // (skip the silence→signal transition at the lookahead boundary)
        let signal_portion = &outputs[lookahead..];
        let max_jump = signal_portion.windows(2)
            .map(|w| (w[1] - w[0]).abs())
            .fold(0.0_f32, f32::max);
        // Within the limited signal, jumps should be small and smooth
        assert!(
            max_jump < 0.05,
            "Attack should be smooth, max jump: {max_jump}"
        );
    }

    #[test]
    fn test_sliding_max_correctness() {
        let mut sm = SlidingMax::new(4);
        assert!((sm.push(1.0) - 1.0).abs() < 1e-6);
        assert!((sm.push(3.0) - 3.0).abs() < 1e-6);
        assert!((sm.push(2.0) - 3.0).abs() < 1e-6);
        assert!((sm.push(1.0) - 3.0).abs() < 1e-6);
        // Now 1.0 falls out of window, 3.0 is still in
        assert!((sm.push(0.5) - 3.0).abs() < 1e-6);
        // 3.0 falls out
        assert!((sm.push(0.5) - 2.0).abs() < 1e-6);
    }
}
