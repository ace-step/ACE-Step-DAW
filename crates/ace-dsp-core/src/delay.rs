//! Delay line — circular buffer with integer and fractional (cubic) reads.
//!
//! This is the foundational primitive for reverb, chorus, flanger, and echo effects.
//! Uses a power-of-two sized ring buffer for branchless index wrapping.

use crate::ANTI_DENORMAL;

/// A delay line backed by a circular buffer.
///
/// The buffer size is rounded up to the next power of two for efficient
/// modulo via bitmask. Supports both integer and fractional (cubic Hermite
/// interpolated) reads.
pub struct DelayLine {
    buffer: Vec<f32>,
    mask: usize,
    write_pos: usize,
}

impl DelayLine {
    /// Create a new delay line with at least `max_delay_samples` capacity.
    /// The actual buffer size is rounded up to the next power of two.
    pub fn new(max_delay_samples: usize) -> Self {
        let size = max_delay_samples.next_power_of_two().max(4);
        Self {
            buffer: vec![0.0; size],
            mask: size - 1,
            write_pos: 0,
        }
    }

    /// Maximum delay in samples this line can produce.
    pub fn max_delay(&self) -> usize {
        self.buffer.len() - 1
    }

    /// Push a sample into the delay line and advance the write head.
    #[inline]
    pub fn push(&mut self, sample: f32) {
        self.buffer[self.write_pos] = sample;
        self.write_pos = (self.write_pos + 1) & self.mask;
    }

    /// Read a sample at an integer delay (in samples) behind the write head.
    /// A delay of 0 returns the most recently pushed sample.
    #[inline]
    pub fn read_integer(&self, delay_samples: usize) -> f32 {
        let idx = self.write_pos.wrapping_sub(1).wrapping_sub(delay_samples) & self.mask;
        self.buffer[idx]
    }

    /// Read a sample at a fractional delay using cubic Hermite interpolation.
    /// This provides sub-sample accuracy needed for modulated effects
    /// (chorus, flanger) without audible artifacts.
    #[inline]
    pub fn read_cubic(&self, delay_samples: f32) -> f32 {
        let delay_int = delay_samples as usize;
        let frac = delay_samples - delay_int as f32;

        // Four sample points for cubic interpolation: y[-1], y[0], y[1], y[2]
        let y_m1 = self.read_integer(delay_int.wrapping_sub(1));
        let y_0 = self.read_integer(delay_int);
        let y_1 = self.read_integer(delay_int + 1);
        let y_2 = self.read_integer(delay_int + 2);

        // Cubic Hermite interpolation (Catmull-Rom spline)
        let c0 = y_0;
        let c1 = 0.5 * (y_1 - y_m1);
        let c2 = y_m1 - 2.5 * y_0 + 2.0 * y_1 - 0.5 * y_2;
        let c3 = 0.5 * (y_2 - y_m1) + 1.5 * (y_0 - y_1);

        ((c3 * frac + c2) * frac + c1) * frac + c0
    }

    /// Clear the buffer (call on seek or transport stop).
    pub fn clear(&mut self) {
        self.buffer.fill(0.0);
        self.write_pos = 0;
    }
}

/// A mono delay effect with feedback and wet/dry mix.
pub struct MonoDelay {
    delay_line: DelayLine,
    delay_samples: f32,
    feedback: f32,
    wet: f32,
    dry: f32,
    fb_sample: f32,
}

impl MonoDelay {
    /// Create a mono delay effect.
    /// - `max_delay_samples`: maximum delay length
    /// - `delay_samples`: current delay in samples (can be fractional)
    /// - `feedback`: feedback amount (0.0 = no feedback, 0.95 = long tail)
    /// - `wet`: wet mix level (0.0 to 1.0)
    pub fn new(max_delay_samples: usize, delay_samples: f32, feedback: f32, wet: f32) -> Self {
        Self {
            delay_line: DelayLine::new(max_delay_samples),
            delay_samples,
            feedback: feedback.clamp(0.0, 0.99),
            wet,
            dry: 1.0,
            fb_sample: 0.0,
        }
    }

    pub fn set_delay_samples(&mut self, samples: f32) {
        self.delay_samples = samples;
    }

    pub fn set_feedback(&mut self, feedback: f32) {
        self.feedback = feedback.clamp(0.0, 0.99);
    }

    pub fn set_wet(&mut self, wet: f32) {
        self.wet = wet;
    }

    pub fn set_dry(&mut self, dry: f32) {
        self.dry = dry;
    }

    /// Process a single sample through the delay.
    /// Uses push-then-read so delay=N means the impulse arrives at sample N.
    #[inline]
    pub fn process_sample(&mut self, input: f32) -> f32 {
        // Push input + stored feedback from previous read
        self.delay_line.push(input + self.fb_sample);
        let delayed = self.delay_line.read_cubic(self.delay_samples);
        // Anti-denormal guard in feedback path; store for next call
        self.fb_sample = delayed * self.feedback + ANTI_DENORMAL - ANTI_DENORMAL;
        input * self.dry + delayed * self.wet
    }

    /// Process a buffer in-place.
    #[inline]
    pub fn process_buffer(&mut self, buffer: &mut [f32]) {
        for sample in buffer.iter_mut() {
            *sample = self.process_sample(*sample);
        }
    }

    /// Reset delay state.
    pub fn reset(&mut self) {
        self.delay_line.clear();
        self.fb_sample = 0.0;
    }
}

/// A stereo delay with independent L/R times and optional cross-feedback (ping-pong).
pub struct StereoDelay {
    left: DelayLine,
    right: DelayLine,
    delay_left: f32,
    delay_right: f32,
    feedback: f32,
    cross_feedback: f32,
    wet: f32,
    dry: f32,
    fb_left: f32,
    fb_right: f32,
}

impl StereoDelay {
    /// Create a stereo delay.
    /// - `cross_feedback`: amount of L→R and R→L cross-feed (0.0 for normal, >0 for ping-pong)
    pub fn new(
        max_delay_samples: usize,
        delay_left: f32,
        delay_right: f32,
        feedback: f32,
        cross_feedback: f32,
        wet: f32,
    ) -> Self {
        Self {
            left: DelayLine::new(max_delay_samples),
            right: DelayLine::new(max_delay_samples),
            delay_left,
            delay_right,
            feedback: feedback.clamp(0.0, 0.99),
            cross_feedback: cross_feedback.clamp(0.0, 0.99),
            wet,
            dry: 1.0,
            fb_left: 0.0,
            fb_right: 0.0,
        }
    }

    pub fn set_delay_left(&mut self, samples: f32) {
        self.delay_left = samples;
    }

    pub fn set_delay_right(&mut self, samples: f32) {
        self.delay_right = samples;
    }

    pub fn set_feedback(&mut self, feedback: f32) {
        self.feedback = feedback.clamp(0.0, 0.99);
    }

    pub fn set_cross_feedback(&mut self, cross_feedback: f32) {
        self.cross_feedback = cross_feedback.clamp(0.0, 0.99);
    }

    pub fn set_wet(&mut self, wet: f32) {
        self.wet = wet;
    }

    pub fn set_dry(&mut self, dry: f32) {
        self.dry = dry;
    }

    /// Process a stereo sample pair.
    /// Returns (left_out, right_out).
    #[inline]
    pub fn process_sample(&mut self, left_in: f32, right_in: f32) -> (f32, f32) {
        // Push input + stored feedback from previous read
        self.left.push(left_in + self.fb_left);
        self.right.push(right_in + self.fb_right);

        let del_l = self.left.read_cubic(self.delay_left);
        let del_r = self.right.read_cubic(self.delay_right);

        // Feedback with cross-feed and anti-denormal; store for next call
        self.fb_left = (del_l * self.feedback + del_r * self.cross_feedback)
            + ANTI_DENORMAL - ANTI_DENORMAL;
        self.fb_right = (del_r * self.feedback + del_l * self.cross_feedback)
            + ANTI_DENORMAL - ANTI_DENORMAL;

        (
            left_in * self.dry + del_l * self.wet,
            right_in * self.dry + del_r * self.wet,
        )
    }

    /// Process separate L/R buffers in-place.
    #[inline]
    pub fn process_buffers(&mut self, left: &mut [f32], right: &mut [f32]) {
        debug_assert_eq!(left.len(), right.len());
        for (l, r) in left.iter_mut().zip(right.iter_mut()) {
            let (out_l, out_r) = self.process_sample(*l, *r);
            *l = out_l;
            *r = out_r;
        }
    }

    /// Reset delay state.
    pub fn reset(&mut self) {
        self.left.clear();
        self.right.clear();
        self.fb_left = 0.0;
        self.fb_right = 0.0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_delay_line_basic() {
        let mut dl = DelayLine::new(8);
        // Push values 1..=8
        for i in 1..=8 {
            dl.push(i as f32);
        }
        // read_integer(0) = most recent = 8
        assert_eq!(dl.read_integer(0), 8.0);
        // read_integer(1) = second most recent = 7
        assert_eq!(dl.read_integer(1), 7.0);
        // read_integer(7) = oldest = 1
        assert_eq!(dl.read_integer(7), 1.0);
    }

    #[test]
    fn test_delay_line_wrapping() {
        let mut dl = DelayLine::new(4);
        // Push 10 values to force wrapping
        for i in 1..=10 {
            dl.push(i as f32);
        }
        assert_eq!(dl.read_integer(0), 10.0);
        assert_eq!(dl.read_integer(1), 9.0);
        assert_eq!(dl.read_integer(2), 8.0);
        assert_eq!(dl.read_integer(3), 7.0);
    }

    #[test]
    fn test_delay_line_clear() {
        let mut dl = DelayLine::new(8);
        for i in 1..=8 {
            dl.push(i as f32);
        }
        dl.clear();
        assert_eq!(dl.read_integer(0), 0.0);
        assert_eq!(dl.read_integer(4), 0.0);
    }

    #[test]
    fn test_cubic_interpolation_at_integer_points() {
        let mut dl = DelayLine::new(16);
        // Push a known sequence
        for i in 0..16 {
            dl.push(i as f32);
        }
        // At integer delay points, cubic should closely match integer read
        let int_val = dl.read_integer(4);
        let cubic_val = dl.read_cubic(4.0);
        assert!(
            (int_val - cubic_val).abs() < 0.001,
            "Cubic at integer point should match: int={int_val}, cubic={cubic_val}"
        );
    }

    #[test]
    fn test_cubic_interpolation_midpoint() {
        let mut dl = DelayLine::new(16);
        // Push a linear ramp: 0, 1, 2, ..., 15
        for i in 0..16 {
            dl.push(i as f32);
        }
        // For a linear signal, cubic interpolation at 4.5 should give
        // the midpoint between read_integer(4) and read_integer(5)
        let mid = dl.read_cubic(4.5);
        let expected = (dl.read_integer(4) + dl.read_integer(5)) / 2.0;
        assert!(
            (mid - expected).abs() < 0.01,
            "Cubic midpoint of linear ramp: got {mid}, expected {expected}"
        );
    }

    #[test]
    fn test_mono_delay_dry_only() {
        let mut delay = MonoDelay::new(100, 10.0, 0.0, 0.0);
        // wet=0, dry=1 → output should equal input
        let mut buf = [1.0_f32, 0.5, -0.5];
        let orig = buf;
        delay.process_buffer(&mut buf);
        assert_eq!(buf, orig);
    }

    #[test]
    fn test_mono_delay_wet_signal_appears() {
        let mut delay = MonoDelay::new(100, 4.0, 0.0, 1.0);
        delay.set_dry(0.0); // wet only

        // Push an impulse then silence
        let mut output = Vec::new();
        output.push(delay.process_sample(1.0)); // sample 0: impulse
        for _ in 1..10 {
            output.push(delay.process_sample(0.0)); // silence
        }

        // The impulse should appear at delay=4 samples
        // output[0..4] should be ~0 (delayed), output[4] should be ~1.0
        assert!(output[0].abs() < 0.01, "Before delay: {}", output[0]);
        assert!(output[1].abs() < 0.01);
        assert!(output[2].abs() < 0.01);
        assert!(output[3].abs() < 0.01);
        // At sample 4, the delayed impulse arrives (cubic interpolation may spread it slightly)
        assert!(
            output[4].abs() > 0.5,
            "Impulse should arrive at delay=4: {}",
            output[4]
        );
    }

    #[test]
    fn test_mono_delay_feedback() {
        let mut delay = MonoDelay::new(100, 4.0, 0.5, 1.0);
        delay.set_dry(0.0);

        let mut output = Vec::new();
        output.push(delay.process_sample(1.0)); // impulse
        for _ in 1..20 {
            output.push(delay.process_sample(0.0));
        }

        // First echo at sample 4
        assert!(output[4].abs() > 0.5);
        // Second echo at sample 9 (feedback stored from t=4, written at t=5, delayed 4 → t=9)
        assert!(output[9].abs() > 0.2, "Second echo at 9: {}", output[9]);
        // Echoes should decay
        assert!(output[9].abs() < output[4].abs());
    }

    #[test]
    fn test_stereo_delay_independent_channels() {
        let mut delay = StereoDelay::new(100, 4.0, 8.0, 0.0, 0.0, 1.0);
        delay.set_dry(0.0);

        let mut left_out = Vec::new();
        let mut right_out = Vec::new();

        // Impulse on both channels
        let (l, r) = delay.process_sample(1.0, 1.0);
        left_out.push(l);
        right_out.push(r);

        for _ in 1..12 {
            let (l, r) = delay.process_sample(0.0, 0.0);
            left_out.push(l);
            right_out.push(r);
        }

        // Left delay = 4 samples
        assert!(left_out[4].abs() > 0.5, "Left echo at 4: {}", left_out[4]);
        // Right delay = 8 samples
        assert!(
            right_out[8].abs() > 0.5,
            "Right echo at 8: {}",
            right_out[8]
        );
        // Left should NOT have significant signal at sample 8 (no cross-feedback)
        assert!(
            left_out[8].abs() < 0.1,
            "Left should be quiet at 8: {}",
            left_out[8]
        );
    }

    #[test]
    fn test_stereo_delay_cross_feedback() {
        let mut delay = StereoDelay::new(100, 4.0, 4.0, 0.0, 0.5, 1.0);
        delay.set_dry(0.0);

        // Impulse on LEFT only
        let mut right_out = Vec::new();
        let (_, r) = delay.process_sample(1.0, 0.0);
        right_out.push(r);
        for _ in 1..12 {
            let (_, r) = delay.process_sample(0.0, 0.0);
            right_out.push(r);
        }

        // With cross_feedback=0.5, left's delayed signal feeds into right
        // Right should have signal at sample 9 (L delay 4 → stored fb at t=5 → R delay 4 → t=9)
        assert!(
            right_out[9].abs() > 0.1,
            "Cross-feedback should appear on right: {}",
            right_out[9]
        );
    }

    #[test]
    fn test_stereo_delay_reset() {
        let mut delay = StereoDelay::new(100, 4.0, 4.0, 0.5, 0.0, 1.0);
        delay.set_dry(0.0);

        // Push some signal
        for _ in 0..20 {
            delay.process_sample(1.0, 1.0);
        }
        delay.reset();

        // After reset, output should be silent
        let (l, r) = delay.process_sample(0.0, 0.0);
        assert_eq!(l, 0.0);
        assert_eq!(r, 0.0);
    }

    #[test]
    fn test_feedback_clamping() {
        let mut delay = MonoDelay::new(100, 10.0, 1.5, 1.0);
        // Feedback should be clamped to 0.99
        assert!(delay.feedback <= 0.99);

        delay.set_feedback(-0.5);
        assert!(delay.feedback >= 0.0);
    }

    #[test]
    fn test_max_delay() {
        let dl = DelayLine::new(1000);
        // Power of two rounding: 1000 → 1024, max_delay = 1023
        assert_eq!(dl.max_delay(), 1023);
    }
}
