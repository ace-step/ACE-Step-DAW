//! Limiter — brick-wall peak limiter with lookahead.
//!
//! Prevents the output from ever exceeding the ceiling level. Uses a
//! lookahead delay buffer so gain reduction can be applied *before* the
//! peak arrives, avoiding distortion artifacts.
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

/// Brick-wall peak limiter with lookahead.
pub struct Limiter {
    ceiling: f32,      // linear ceiling level
    ceiling_db: f32,
    release_coeff: f32,
    lookahead_buf: Vec<f32>,
    lookahead_len: usize,
    write_pos: usize,
    envelope: f32, // current gain reduction envelope (linear, ≤1.0)
    sample_rate: f32,
    release_ms: f32,
    gain_reduction_db: f32, // for metering
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
            lookahead_buf: vec![0.0; lookahead_samples],
            lookahead_len: lookahead_samples,
            write_pos: 0,
            envelope: 1.0,
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
    #[inline]
    pub fn process_sample(&mut self, input: f32) -> f32 {
        // Write to lookahead buffer, read delayed sample
        let delayed = self.lookahead_buf[self.write_pos];
        self.lookahead_buf[self.write_pos] = input;
        self.write_pos += 1;
        if self.write_pos >= self.lookahead_len {
            self.write_pos = 0;
        }

        // Compute required gain for the incoming sample
        let abs_in = input.abs() + ANTI_DENORMAL;
        let desired_gain = if abs_in > self.ceiling {
            self.ceiling / abs_in
        } else {
            1.0
        };

        // Envelope: instant attack (take minimum), smooth release
        if desired_gain < self.envelope {
            self.envelope = desired_gain; // instant attack
        } else {
            self.envelope = desired_gain + self.release_coeff * (self.envelope - desired_gain);
        }

        // Track gain reduction for metering
        self.gain_reduction_db = lin_to_db(self.envelope).min(0.0);

        // Apply gain to the delayed (lookahead) sample
        delayed * self.envelope
    }

    /// Process a buffer in-place.
    pub fn process_buffer(&mut self, buffer: &mut [f32]) {
        for sample in buffer.iter_mut() {
            *sample = self.process_sample(*sample);
        }
    }

    /// Clear internal state.
    pub fn reset(&mut self) {
        self.lookahead_buf.fill(0.0);
        self.write_pos = 0;
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

        // Feed loud signal
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
        // Feed very loud signal
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
        // Should not panic, release coeff updated
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
        // Should work without panic
        assert!(lim.gain_reduction_db() < 0.0);
    }

    #[test]
    fn test_ceiling_positive_clamped() {
        let lim = Limiter::new(44100.0, 3.0, 100.0, 5.0);
        assert!(lim.ceiling_db() <= 0.0, "Ceiling should be ≤0: {}", lim.ceiling_db());
    }
}
