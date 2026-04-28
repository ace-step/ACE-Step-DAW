//! Real-time metering — RMS + peak-hold + clip detection.
//!
//! # Design
//!
//! Each meter uses an **exponential moving average (EMA)** for RMS and a
//! **peak-hold with linear decay** for the peak indicator. Both are
//! computed sample-by-sample inside the audio callback with zero
//! allocation — the state is a handful of `f32` fields on the `Meter`
//! struct.
//!
//! The audio callback pushes a [`MeterReading`] snapshot into a
//! lock-free ring buffer after each buffer is processed. The main
//! thread polls the consumer end at UI frame rate (~60 Hz) and only
//! cares about the latest value — older readings are simply skipped.
//!
//! # RMS calibration
//!
//! EMA alpha is calibrated to a ~300 ms integration window at the
//! engine's sample rate, matching VU-style metering behavior. A pure
//! sine at amplitude `A` converges to `RMS ≈ A / √2 ≈ 0.7071 * A`.
//!
//! # Peak hold
//!
//! Peak holds its value for `PEAK_HOLD_SECONDS` (default 1 s) then
//! decays linearly to zero over `PEAK_DECAY_SECONDS` (default 2 s).
//! This matches the visual behavior of Logic Pro and Ableton meters.

use serde::{Deserialize, Serialize};

/// Snapshot of a meter's state at a point in time.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct MeterReading {
    /// RMS level in linear gain (0.0 = silence, 1.0 = full scale).
    pub rms: f32,
    /// Peak level in linear gain. Holds then decays.
    pub peak: f32,
    /// True if any sample in the most recent buffer exceeded 1.0.
    pub clipped: bool,
}

impl Default for MeterReading {
    fn default() -> Self {
        Self {
            rms: 0.0,
            peak: 0.0,
            clipped: false,
        }
    }
}

/// Per-channel meter state. Allocation-free, safe to own in the audio
/// callback. Call [`Meter::process`] once per buffer, then
/// [`Meter::reading`] to snapshot.
pub struct Meter {
    /// EMA of squared samples. `rms = sqrt(rms_ema)`.
    rms_ema: f32,
    /// EMA smoothing coefficient. Derived from sample rate + desired
    /// integration time.
    alpha: f32,
    /// Current peak value (decaying).
    peak: f32,
    /// Samples remaining in the hold phase before decay starts.
    peak_hold_remaining: u32,
    /// Samples of hold time at construction sample rate.
    peak_hold_samples: u32,
    /// Linear decay per sample once hold expires.
    peak_decay_per_sample: f32,
    /// Latched clip flag — set by `process`, cleared by `reset_clip`.
    clipped: bool,
}

/// Default RMS integration window in seconds (VU-style).
const RMS_WINDOW_SECONDS: f32 = 0.3;
/// How long the peak indicator holds before decaying.
const PEAK_HOLD_SECONDS: f32 = 1.0;
/// How long the peak takes to decay from 1.0 to 0.0 after hold.
const PEAK_DECAY_SECONDS: f32 = 2.0;

impl Meter {
    /// Construct a meter calibrated to the given sample rate.
    pub fn new(sample_rate: f32) -> Self {
        // EMA alpha: α = 1 - exp(-1 / (τ * fs))
        // where τ = integration time in seconds.
        let tau = RMS_WINDOW_SECONDS * sample_rate;
        let alpha = if tau > 0.0 { 1.0 - (-1.0 / tau).exp() } else { 1.0 };

        let peak_hold_samples = (PEAK_HOLD_SECONDS * sample_rate) as u32;
        let peak_decay_per_sample = if PEAK_DECAY_SECONDS > 0.0 {
            1.0 / (PEAK_DECAY_SECONDS * sample_rate)
        } else {
            1.0
        };

        Self {
            rms_ema: 0.0,
            alpha,
            peak: 0.0,
            peak_hold_remaining: 0,
            peak_hold_samples,
            peak_decay_per_sample,
            clipped: false,
        }
    }

    /// Process a mono buffer of samples. Call once per audio callback.
    /// Zero allocation, no branches that could panic.
    pub fn process(&mut self, samples: &[f32]) {
        for &s in samples {
            let sq = s * s;
            // EMA update: rms_ema ← α·s² + (1−α)·rms_ema
            self.rms_ema += self.alpha * (sq - self.rms_ema);

            let abs = s.abs();
            if abs >= self.peak {
                self.peak = abs;
                self.peak_hold_remaining = self.peak_hold_samples;
            } else if self.peak_hold_remaining > 0 {
                self.peak_hold_remaining -= 1;
            } else {
                // Decay phase
                self.peak = (self.peak - self.peak_decay_per_sample).max(0.0);
            }

            if abs > 1.0 {
                self.clipped = true;
            }
        }
    }

    /// Snapshot the current meter state.
    #[inline]
    pub fn reading(&self) -> MeterReading {
        MeterReading {
            rms: self.rms_ema.sqrt(),
            peak: self.peak,
            clipped: self.clipped,
        }
    }

    /// Clear the clip indicator. Called when the user clicks the clip
    /// LED in the UI.
    pub fn reset_clip(&mut self) {
        self.clipped = false;
    }

    /// Reset all state to silence. Used on engine restart.
    pub fn reset(&mut self) {
        self.rms_ema = 0.0;
        self.peak = 0.0;
        self.peak_hold_remaining = 0;
        self.clipped = false;
    }
}

/// Generate a mono sine wave into a pre-allocated buffer.
/// Zero allocation — suitable for the audio callback when
/// `InjectTestSignal` is active.
///
/// `phase` is updated in place so successive calls produce a
/// continuous waveform. Returns the updated phase.
pub fn generate_sine(
    buffer: &mut [f32],
    frequency: f32,
    amplitude: f32,
    sample_rate: f32,
    phase: &mut f32,
) {
    let step = frequency * std::f32::consts::TAU / sample_rate;
    for sample in buffer.iter_mut() {
        *sample = amplitude * phase.sin();
        *phase += step;
        // Wrap phase to avoid float precision loss over long runs.
        if *phase > std::f32::consts::TAU {
            *phase -= std::f32::consts::TAU;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SR: f32 = 48_000.0;

    fn sine_buffer(freq: f32, amplitude: f32, duration_secs: f32) -> Vec<f32> {
        let len = (SR * duration_secs) as usize;
        let mut buf = vec![0.0_f32; len];
        let mut phase = 0.0_f32;
        generate_sine(&mut buf, freq, amplitude, SR, &mut phase);
        buf
    }

    #[test]
    fn rms_of_unity_sine_converges_to_one_over_sqrt2() {
        let mut meter = Meter::new(SR);
        // Feed several seconds of sine to let the EMA converge.
        let buf = sine_buffer(440.0, 1.0, 2.0);
        // Process in chunks matching a typical buffer size.
        for chunk in buf.chunks(256) {
            meter.process(chunk);
        }
        let reading = meter.reading();
        // 1/√2 ≈ 0.7071
        assert!(
            (reading.rms - std::f32::consts::FRAC_1_SQRT_2).abs() < 0.02,
            "rms {} should be ≈ 0.7071",
            reading.rms
        );
    }

    #[test]
    fn peak_of_unity_sine_is_one() {
        let mut meter = Meter::new(SR);
        let buf = sine_buffer(440.0, 1.0, 0.5);
        for chunk in buf.chunks(256) {
            meter.process(chunk);
        }
        assert!(
            (meter.reading().peak - 1.0).abs() < 0.01,
            "peak {} should be ≈ 1.0",
            meter.reading().peak
        );
    }

    #[test]
    fn clip_detected_when_amplitude_exceeds_one() {
        let mut meter = Meter::new(SR);
        let buf = sine_buffer(440.0, 1.5, 0.1);
        meter.process(&buf);
        assert!(meter.reading().clipped, "should detect clipping at 1.5x");
    }

    #[test]
    fn no_clip_at_unity_amplitude() {
        let mut meter = Meter::new(SR);
        let buf = sine_buffer(440.0, 1.0, 0.5);
        for chunk in buf.chunks(256) {
            meter.process(chunk);
        }
        assert!(!meter.reading().clipped);
    }

    #[test]
    fn reset_clip_clears_flag() {
        let mut meter = Meter::new(SR);
        meter.process(&[2.0]); // clip
        assert!(meter.reading().clipped);
        meter.reset_clip();
        assert!(!meter.reading().clipped);
    }

    #[test]
    fn silence_reads_zero() {
        let meter = Meter::new(SR);
        let r = meter.reading();
        assert_eq!(r.rms, 0.0);
        assert_eq!(r.peak, 0.0);
        assert!(!r.clipped);
    }

    #[test]
    fn reset_returns_to_silence() {
        let mut meter = Meter::new(SR);
        meter.process(&[0.5, 0.8, 1.2]);
        meter.reset();
        let r = meter.reading();
        assert_eq!(r.rms, 0.0);
        assert_eq!(r.peak, 0.0);
        assert!(!r.clipped);
    }

    #[test]
    fn rms_scales_with_amplitude() {
        let mut m_half = Meter::new(SR);
        let mut m_full = Meter::new(SR);
        let buf_half = sine_buffer(440.0, 0.5, 2.0);
        let buf_full = sine_buffer(440.0, 1.0, 2.0);
        for chunk in buf_half.chunks(256) {
            m_half.process(chunk);
        }
        for chunk in buf_full.chunks(256) {
            m_full.process(chunk);
        }
        // RMS should be roughly proportional to amplitude.
        let ratio = m_full.reading().rms / m_half.reading().rms;
        assert!(
            (ratio - 2.0).abs() < 0.1,
            "ratio {} should be ≈ 2.0",
            ratio
        );
    }

    #[test]
    fn generate_sine_produces_correct_frequency() {
        // Generate 1 second of 1 Hz at SR=100. The buffer should
        // contain exactly one full cycle: starting at 0, peaking at
        // +1 around sample 25, crossing 0 at sample 50, dipping to
        // -1 around sample 75, returning to ~0 at sample 100.
        let mut buf = vec![0.0_f32; 100];
        let mut phase = 0.0;
        generate_sine(&mut buf, 1.0, 1.0, 100.0, &mut phase);
        // Sample 0: sin(0) ≈ 0
        assert!(buf[0].abs() < 0.01);
        // Sample 25: sin(π/2) ≈ 1
        assert!((buf[25] - 1.0).abs() < 0.1);
        // Sample 75: sin(3π/2) ≈ -1
        assert!((buf[75] + 1.0).abs() < 0.1);
    }

    #[test]
    fn generate_sine_phase_continuity() {
        // Two consecutive generate_sine calls should produce a
        // continuous waveform (no discontinuity at the boundary).
        let mut buf1 = vec![0.0_f32; 256];
        let mut buf2 = vec![0.0_f32; 256];
        let mut phase = 0.0;
        generate_sine(&mut buf1, 440.0, 1.0, SR, &mut phase);
        let last = buf1[255];
        generate_sine(&mut buf2, 440.0, 1.0, SR, &mut phase);
        let first = buf2[0];
        // The step between consecutive samples at 440 Hz / 48 kHz is
        // small enough that the values should be very close.
        assert!(
            (first - last).abs() < 0.1,
            "discontinuity: {last} → {first}"
        );
    }

    #[test]
    fn meter_reading_round_trips_through_serde() {
        let r = MeterReading {
            rms: 0.707,
            peak: 0.95,
            clipped: true,
        };
        let json = serde_json::to_string(&r).unwrap();
        let back: MeterReading = serde_json::from_str(&json).unwrap();
        assert_eq!(r, back);
    }
}
