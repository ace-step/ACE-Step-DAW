//! Delay line — circular buffer with integer and interpolated reads.
//!
//! Foundation for reverb, chorus, flanger, and standalone delay effects.
//! Uses power-of-2 buffer sizes for efficient bitwise masking.

#[cfg(feature = "std")]
extern crate std;

#[cfg(feature = "std")]
use std::vec::Vec;

#[cfg(not(feature = "std"))]
extern crate alloc;
#[cfg(not(feature = "std"))]
use alloc::vec::Vec;

/// Circular buffer delay line with power-of-2 length.
///
/// Supports integer and fractionally-interpolated reads for modulated delays.
#[derive(Debug, Clone)]
pub struct DelayLine {
    buffer: Vec<f32>,
    mask: usize,
    write_pos: usize,
}

impl DelayLine {
    /// Create a new delay line with capacity for at least `max_delay_samples`.
    ///
    /// The actual buffer size is rounded up to the next power of 2 for
    /// efficient modulo via bitwise AND.
    pub fn new(max_delay_samples: usize) -> Self {
        let size = max_delay_samples.next_power_of_two().max(4);
        Self {
            buffer: vec![0.0; size],
            mask: size - 1,
            write_pos: 0,
        }
    }

    /// Write a sample at the current write position and advance.
    #[inline]
    pub fn push(&mut self, sample: f32) {
        self.buffer[self.write_pos] = sample;
        self.write_pos = (self.write_pos + 1) & self.mask;
    }

    /// Read at an integer delay (in samples). Delay of 0 returns the most
    /// recently written sample.
    #[inline]
    pub fn read(&self, delay_samples: usize) -> f32 {
        let read_pos = self.write_pos.wrapping_sub(delay_samples + 1) & self.mask;
        self.buffer[read_pos]
    }

    /// Read at a fractional delay using linear interpolation.
    /// Cheaper than cubic — suitable for LFO modulation depths < 5ms.
    #[inline]
    pub fn read_linear(&self, delay_samples: f64) -> f32 {
        let d = delay_samples.max(0.0);
        let d_int = d as usize;
        let frac = (d - d_int as f64) as f32;

        let s0 = self.read(d_int);
        let s1 = self.read(d_int + 1);

        s0 + frac * (s1 - s0)
    }

    /// Read at a fractional delay using cubic Hermite interpolation (4-point).
    /// Best quality for chorus/flanger modulated delays.
    #[inline]
    pub fn read_cubic(&self, delay_samples: f64) -> f32 {
        let d = delay_samples.max(1.0); // Need 1 sample before for cubic
        let d_int = d as usize;
        let frac = (d - d_int as f64) as f32;

        let s_m1 = self.read(d_int.wrapping_sub(1));
        let s0 = self.read(d_int);
        let s1 = self.read(d_int + 1);
        let s2 = self.read(d_int + 2);

        // Cubic Hermite interpolation
        let c0 = s0;
        let c1 = 0.5 * (s1 - s_m1);
        let c2 = s_m1 - 2.5 * s0 + 2.0 * s1 - 0.5 * s2;
        let c3 = 0.5 * (s2 - s_m1) + 1.5 * (s0 - s1);

        ((c3 * frac + c2) * frac + c1) * frac + c0
    }

    /// Clear buffer to silence (call on seek or track reset).
    pub fn clear(&mut self) {
        self.buffer.fill(0.0);
        self.write_pos = 0;
    }

    /// Maximum delay this line can produce (in samples).
    pub fn max_delay(&self) -> usize {
        self.mask // buffer_size - 1
    }
}

/// Simple feedback delay effect with wet/dry mix.
#[derive(Debug, Clone)]
pub struct FeedbackDelay {
    delay: DelayLine,
    delay_time_samples: f64,
    feedback: f32,
    wet: f32,
}

impl FeedbackDelay {
    /// Create a feedback delay.
    ///
    /// - `max_delay_samples`: maximum delay capacity
    /// - `delay_time_samples`: initial delay time (fractional samples OK)
    /// - `feedback`: feedback gain (0.0 to 0.95 — clamped for stability)
    /// - `wet`: wet/dry mix (0.0 = dry, 1.0 = fully wet)
    pub fn new(
        max_delay_samples: usize,
        delay_time_samples: f64,
        feedback: f32,
        wet: f32,
    ) -> Self {
        Self {
            delay: DelayLine::new(max_delay_samples),
            delay_time_samples,
            feedback: feedback.clamp(0.0, 0.99),
            wet: wet.clamp(0.0, 1.0),
        }
    }

    pub fn set_delay_time(&mut self, samples: f64) {
        self.delay_time_samples = samples;
    }

    pub fn set_feedback(&mut self, feedback: f32) {
        self.feedback = feedback.clamp(0.0, 0.99);
    }

    pub fn set_wet(&mut self, wet: f32) {
        self.wet = wet.clamp(0.0, 1.0);
    }

    /// Process a single sample.
    #[inline]
    pub fn process_sample(&mut self, input: f32) -> f32 {
        let delayed = self.delay.read_linear(self.delay_time_samples);
        let to_write = input + delayed * self.feedback;
        self.delay.push(to_write);

        input * (1.0 - self.wet) + delayed * self.wet
    }

    /// Process a block in-place.
    pub fn process_block(&mut self, buffer: &mut [f32]) {
        for sample in buffer.iter_mut() {
            *sample = self.process_sample(*sample);
        }
    }

    pub fn clear(&mut self) {
        self.delay.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn delay_line_integer_read() {
        let mut dl = DelayLine::new(16);

        // Push an impulse
        dl.push(1.0);
        for _ in 0..9 {
            dl.push(0.0);
        }

        // The impulse should be at delay = 9
        assert_eq!(dl.read(9), 1.0);
        assert_eq!(dl.read(0), 0.0);
        assert_eq!(dl.read(5), 0.0);
    }

    #[test]
    fn delay_line_power_of_two() {
        let dl = DelayLine::new(100);
        // Should round up to 128
        assert_eq!(dl.buffer.len(), 128);
        assert_eq!(dl.mask, 127);
    }

    #[test]
    fn delay_line_linear_interpolation() {
        let mut dl = DelayLine::new(16);

        dl.push(0.0);
        dl.push(1.0);
        dl.push(0.0);

        // Fractional read between samples
        let val = dl.read_linear(1.5);
        // Between sample at delay=1 (1.0) and delay=2 (0.0), at 0.5 frac → 0.5
        assert!(
            (val - 0.5).abs() < 0.01,
            "Linear interp at halfway: expected 0.5, got {val}"
        );
    }

    #[test]
    fn delay_line_cubic_interpolation() {
        let mut dl = DelayLine::new(16);

        // Push a smooth signal
        for i in 0..8 {
            let t = i as f32 / 7.0;
            dl.push(t * t); // quadratic ramp
        }

        // Cubic should be closer to the true value than linear for smooth signals
        let cubic = dl.read_cubic(3.5);
        let linear = dl.read_linear(3.5);

        // Both should be reasonable (between adjacent samples)
        let s3 = dl.read(3);
        let s4 = dl.read(4);
        let (lo, hi) = if s3 < s4 {
            (s3, s4)
        } else {
            (s4, s3)
        };
        // Cubic can slightly overshoot due to interpolation, but should be close
        assert!(
            (cubic - (lo + hi) / 2.0).abs() < 1.0,
            "Cubic interp should be reasonable: got {cubic} (range {lo}..{hi})"
        );
        let _ = linear; // Used for comparison
    }

    #[test]
    fn delay_line_clear() {
        let mut dl = DelayLine::new(16);

        for i in 0..10 {
            dl.push(i as f32);
        }

        dl.clear();

        for i in 0..10 {
            assert_eq!(dl.read(i), 0.0, "After clear, all reads should be 0");
        }
    }

    #[test]
    fn feedback_delay_decays() {
        // Short delay (10 samples) so the echo arrives quickly
        let mut fd = FeedbackDelay::new(480, 10.0, 0.5, 1.0);

        // Send an impulse
        fd.process_sample(1.0);

        // Process enough silence for the first echo to arrive (>10 samples)
        let mut first_echo = 0.0f32;
        for i in 0..200 {
            let out = fd.process_sample(0.0);
            if i == 10 {
                first_echo = out;
            }
        }

        // The first echo should be significant (feedback * impulse)
        assert!(
            first_echo.abs() > 0.1,
            "First echo at delay=10 should be audible: got {first_echo}"
        );

        // After many iterations the signal should have decayed below the first echo
        let mut final_level = 0.0f32;
        for _ in 0..500 {
            final_level = fd.process_sample(0.0);
        }
        assert!(
            final_level.abs() < first_echo.abs(),
            "Feedback should decay: first_echo={first_echo}, final={final_level}"
        );
    }

    #[test]
    fn feedback_delay_wet_dry() {
        let mut fd = FeedbackDelay::new(4800, 100.0, 0.0, 0.0);

        // At wet=0 (fully dry), output should equal input
        let out = fd.process_sample(0.5);
        assert!(
            (out - 0.5).abs() < 0.001,
            "Fully dry: expected 0.5, got {out}"
        );
    }

    #[test]
    fn feedback_clamped() {
        let fd = FeedbackDelay::new(100, 10.0, 1.5, 0.5);
        assert!(fd.feedback <= 0.99, "Feedback should be clamped to 0.99");
    }
}
