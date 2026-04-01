//! Tremolo — amplitude modulation via LFO.
//!
//! Modulates the signal amplitude with a low-frequency oscillator.
//! Multiple waveform shapes available for different tremolo characters.
//!
//! Parameters:
//! - `rate_hz`: LFO speed (0.1–20 Hz)
//! - `depth`: modulation depth (0.0–1.0, where 1.0 = full silence at trough)
//! - `shape`: LFO waveform (Sine, Triangle, Square)

use core::f32::consts::TAU;

/// LFO waveform shape.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum TremoloShape {
    Sine,
    Triangle,
    Square,
}

/// Tremolo processor.
pub struct Tremolo {
    phase: f32,
    phase_inc: f32,
    depth: f32,
    shape: TremoloShape,
    sample_rate: f32,
}

impl Tremolo {
    /// Create a new tremolo.
    ///
    /// - `sample_rate`: audio sample rate
    /// - `rate_hz`: LFO rate (0.1–20 Hz)
    /// - `depth`: modulation depth (0.0–1.0)
    /// - `shape`: LFO waveform
    pub fn new(sample_rate: f32, rate_hz: f32, depth: f32, shape: TremoloShape) -> Self {
        Self {
            phase: 0.0,
            phase_inc: rate_hz.max(0.01) / sample_rate,
            depth: depth.clamp(0.0, 1.0),
            shape,
            sample_rate,
        }
    }

    /// Set LFO rate in Hz.
    pub fn set_rate(&mut self, rate_hz: f32) {
        self.phase_inc = rate_hz.max(0.01) / self.sample_rate;
    }

    /// Set depth (0.0–1.0).
    pub fn set_depth(&mut self, depth: f32) {
        self.depth = depth.clamp(0.0, 1.0);
    }

    /// Set LFO shape.
    pub fn set_shape(&mut self, shape: TremoloShape) {
        self.shape = shape;
    }

    /// Get current shape.
    pub fn shape(&self) -> TremoloShape {
        self.shape
    }

    /// Compute the LFO value (0.0–1.0 range, representing gain multiplier).
    #[inline]
    fn lfo_gain(&mut self) -> f32 {
        let raw = match self.shape {
            TremoloShape::Sine => {
                // Sine: 0..1 mapped from sin output
                (1.0 + (self.phase * TAU).sin()) * 0.5
            }
            TremoloShape::Triangle => {
                // Triangle: 0→1→0 over one cycle
                let p = self.phase;
                if p < 0.5 {
                    p * 2.0
                } else {
                    2.0 - p * 2.0
                }
            }
            TremoloShape::Square => {
                if self.phase < 0.5 { 1.0 } else { 0.0 }
            }
        };

        // Advance phase
        self.phase += self.phase_inc;
        if self.phase >= 1.0 {
            self.phase -= 1.0;
        }

        // Map LFO to gain: 1.0 at peak, (1.0 - depth) at trough
        1.0 - self.depth * (1.0 - raw)
    }

    /// Process a single sample.
    #[inline]
    pub fn process_sample(&mut self, input: f32) -> f32 {
        input * self.lfo_gain()
    }

    /// Process a buffer in-place.
    pub fn process_buffer(&mut self, buffer: &mut [f32]) {
        for sample in buffer.iter_mut() {
            *sample = self.process_sample(*sample);
        }
    }

    /// Reset LFO phase.
    pub fn reset(&mut self) {
        self.phase = 0.0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_creation() {
        let t = Tremolo::new(44100.0, 5.0, 0.5, TremoloShape::Sine);
        assert_eq!(t.shape(), TremoloShape::Sine);
    }

    #[test]
    fn test_zero_depth_passthrough() {
        let mut t = Tremolo::new(44100.0, 5.0, 0.0, TremoloShape::Sine);
        let mut buf = [0.5_f32; 512];
        t.process_buffer(&mut buf);
        for &s in &buf {
            assert!((s - 0.5).abs() < 0.001, "Zero depth: {s}");
        }
    }

    #[test]
    fn test_full_depth_sine_has_silence() {
        let mut t = Tremolo::new(44100.0, 5.0, 1.0, TremoloShape::Sine);
        let mut min_out = f32::INFINITY;
        let mut max_out = f32::NEG_INFINITY;
        // One full LFO cycle at 5Hz = 44100/5 = 8820 samples
        for _ in 0..8820 {
            let s = t.process_sample(1.0);
            min_out = min_out.min(s);
            max_out = max_out.max(s);
        }
        // Full depth: should reach near 0 at trough and 1.0 at peak
        assert!(min_out < 0.05, "Min should be near 0: {min_out}");
        assert!(max_out > 0.95, "Max should be near 1: {max_out}");
    }

    #[test]
    fn test_square_wave_on_off() {
        let mut t = Tremolo::new(44100.0, 5.0, 1.0, TremoloShape::Square);
        // First half of cycle should be full volume, second half silence
        let samples_per_cycle = (44100.0 / 5.0) as usize;
        let half = samples_per_cycle / 2;

        let mut on_samples = 0;
        let mut off_samples = 0;
        for _ in 0..samples_per_cycle {
            let s = t.process_sample(1.0);
            if s > 0.5 {
                on_samples += 1;
            } else {
                off_samples += 1;
            }
        }
        // Should be roughly 50/50
        assert!(on_samples > half - 10, "On: {on_samples}");
        assert!(off_samples > half - 10, "Off: {off_samples}");
    }

    #[test]
    fn test_triangle_smooth() {
        let mut t = Tremolo::new(44100.0, 5.0, 1.0, TremoloShape::Triangle);
        let mut prev = t.process_sample(1.0);
        let mut max_jump = 0.0_f32;
        for _ in 1..8820 {
            let s = t.process_sample(1.0);
            max_jump = max_jump.max((s - prev).abs());
            prev = s;
        }
        // Triangle should change smoothly (no jumps > small threshold)
        assert!(
            max_jump < 0.01,
            "Triangle should be smooth: max_jump={max_jump}"
        );
    }

    #[test]
    fn test_silence_passthrough() {
        let mut t = Tremolo::new(44100.0, 5.0, 1.0, TremoloShape::Sine);
        let mut buf = [0.0_f32; 512];
        t.process_buffer(&mut buf);
        for &s in &buf {
            assert!(s.abs() < 1e-10, "Silence: {s}");
        }
    }

    #[test]
    fn test_output_never_exceeds_input() {
        let mut t = Tremolo::new(44100.0, 3.0, 0.8, TremoloShape::Sine);
        for _ in 0..44100 {
            let s = t.process_sample(0.5);
            assert!(s <= 0.501, "Should not exceed input: {s}");
            assert!(s >= 0.0, "Should not go negative: {s}");
        }
    }

    #[test]
    fn test_parameter_setters() {
        let mut t = Tremolo::new(44100.0, 5.0, 0.5, TremoloShape::Sine);
        t.set_rate(10.0);
        t.set_depth(0.8);
        t.set_shape(TremoloShape::Square);
        assert_eq!(t.shape(), TremoloShape::Square);
    }

    #[test]
    fn test_depth_clamping() {
        let t = Tremolo::new(44100.0, 5.0, 2.0, TremoloShape::Sine);
        assert_eq!(t.depth, 1.0);
        let t2 = Tremolo::new(44100.0, 5.0, -0.5, TremoloShape::Sine);
        assert_eq!(t2.depth, 0.0);
    }

    #[test]
    fn test_reset() {
        let mut t = Tremolo::new(44100.0, 5.0, 0.5, TremoloShape::Sine);
        for _ in 0..1000 {
            t.process_sample(1.0);
        }
        t.reset();
        assert_eq!(t.phase, 0.0);
    }

    #[test]
    fn test_48khz() {
        let mut t = Tremolo::new(48000.0, 5.0, 0.5, TremoloShape::Sine);
        let mut buf = [0.5_f32; 480];
        t.process_buffer(&mut buf);
        // Should work without panic
    }
}
