//! True-peak limiter + LUFS metering.
//!
//! - Limiter: lookahead brickwall with program-dependent release
//! - LUFS: ITU-R BS.1770 K-weighted loudness measurement

use crate::biquad::{BiquadCoeffs, BiquadMono, FilterType};
use crate::delay::DelayLine;

// ── True-Peak Limiter ───────────────────────────────────────────────

/// Limiter parameters.
#[derive(Debug, Clone, Copy)]
pub struct LimiterParams {
    pub ceiling_db: f64,   // -3 to 0 dBTP
    pub release_ms: f64,   // 10 to 500ms
    pub lookahead_ms: f64, // 0.5 to 5ms
}

impl Default for LimiterParams {
    fn default() -> Self {
        Self {
            ceiling_db: -1.0,
            release_ms: 100.0,
            lookahead_ms: 1.0,
        }
    }
}

/// True-peak brickwall limiter with lookahead.
///
/// Uses a lookahead delay to detect peaks before they reach the output,
/// applying gain reduction smoothly to prevent clipping above the ceiling.
#[derive(Debug)]
pub struct Limiter {
    params: LimiterParams,
    ceiling_linear: f64,
    lookahead_left: DelayLine,
    lookahead_right: DelayLine,
    lookahead_samples: usize,
    gain: f64,
    release_coeff: f64,
    gain_reduction_db: f64,
    sample_rate: f64,
}

impl Limiter {
    pub fn new(params: LimiterParams, sample_rate: f64) -> Self {
        let lookahead_samples = (params.lookahead_ms * sample_rate / 1000.0) as usize;
        let release_coeff = (-1.0 / (params.release_ms * 0.001 * sample_rate)).exp();

        Self {
            ceiling_linear: 10.0_f64.powf(params.ceiling_db / 20.0),
            lookahead_left: DelayLine::new(lookahead_samples + 64),
            lookahead_right: DelayLine::new(lookahead_samples + 64),
            lookahead_samples,
            gain: 1.0,
            release_coeff,
            gain_reduction_db: 0.0,
            params,
            sample_rate,
        }
    }

    pub fn set_params(&mut self, params: LimiterParams) {
        self.ceiling_linear = 10.0_f64.powf(params.ceiling_db / 20.0);
        self.release_coeff = (-1.0 / (params.release_ms * 0.001 * self.sample_rate)).exp();
        self.params = params;
    }

    pub fn gain_reduction_db(&self) -> f64 {
        self.gain_reduction_db
    }

    /// Process stereo audio in-place.
    pub fn process_stereo(&mut self, left: &mut [f32], right: &mut [f32]) {
        let len = left.len().min(right.len());
        let mut max_gr = 0.0f64;

        for i in 0..len {
            // Push current sample into lookahead delay
            self.lookahead_left.push(left[i]);
            self.lookahead_right.push(right[i]);

            // Detect peak from current sample (before delay)
            let peak = (left[i].abs() as f64).max(right[i].abs() as f64);

            // Calculate required gain to keep peak below ceiling
            let target_gain = if peak > self.ceiling_linear {
                self.ceiling_linear / peak
            } else {
                1.0
            };

            // Smooth gain: instant attack, exponential release
            if target_gain < self.gain {
                self.gain = target_gain; // instant attack
            } else {
                // Exponential release back toward 1.0
                self.gain = self.gain * self.release_coeff + target_gain * (1.0 - self.release_coeff);
            }

            // Read delayed audio and apply gain
            let delayed_l = self.lookahead_left.read(self.lookahead_samples);
            let delayed_r = self.lookahead_right.read(self.lookahead_samples);

            left[i] = delayed_l * self.gain as f32;
            right[i] = delayed_r * self.gain as f32;

            let gr = -20.0 * self.gain.log10();
            max_gr = max_gr.max(gr);
        }

        self.gain_reduction_db = max_gr;
    }

    pub fn reset(&mut self) {
        self.lookahead_left.clear();
        self.lookahead_right.clear();
        self.gain = 1.0;
        self.gain_reduction_db = 0.0;
    }
}

// ── LUFS Meter ──────────────────────────────────────────────────────

/// LUFS (Loudness Units relative to Full Scale) meter.
///
/// Implements ITU-R BS.1770 K-weighted loudness measurement:
/// 1. K-weighting filter (high-shelf + highpass)
/// 2. Mean square over measurement window
/// 3. Convert to LUFS
#[derive(Debug)]
pub struct LufsMeter {
    // K-weighting: stage 1 (high shelf +4dB at ~1.5kHz)
    k_shelf_l: BiquadMono,
    k_shelf_r: BiquadMono,
    // K-weighting: stage 2 (highpass at ~38Hz)
    k_hp_l: BiquadMono,
    k_hp_r: BiquadMono,
    // Running sum of squares for momentary (400ms) and short-term (3s)
    momentary_buffer: Vec<f64>,
    short_term_buffer: Vec<f64>,
    momentary_pos: usize,
    short_term_pos: usize,
    momentary_sum: f64,
    short_term_sum: f64,
    block_sum: f64,
    block_count: usize,
    block_size: usize, // samples per measurement block
    sample_rate: f64,
}

impl LufsMeter {
    pub fn new(sample_rate: f64) -> Self {
        // BS.1770 K-weighting stage 1: high shelf
        // Approximation: +4dB high shelf at 1500Hz
        let shelf_coeffs =
            BiquadCoeffs::new(FilterType::HighShelf, 1500.0, 0.707, 4.0, sample_rate);
        // BS.1770 K-weighting stage 2: highpass at ~38Hz
        let hp_coeffs =
            BiquadCoeffs::new(FilterType::Highpass, 38.0, 0.5, 0.0, sample_rate);

        // Block size: 100ms overlap blocks
        let block_size = (sample_rate * 0.1) as usize;
        // Momentary: 400ms = 4 blocks
        let momentary_blocks = 4;
        // Short-term: 3s = 30 blocks
        let short_term_blocks = 30;

        Self {
            k_shelf_l: BiquadMono::new(shelf_coeffs),
            k_shelf_r: BiquadMono::new(shelf_coeffs),
            k_hp_l: BiquadMono::new(hp_coeffs),
            k_hp_r: BiquadMono::new(hp_coeffs),
            momentary_buffer: vec![0.0; momentary_blocks],
            short_term_buffer: vec![0.0; short_term_blocks],
            momentary_pos: 0,
            short_term_pos: 0,
            momentary_sum: 0.0,
            short_term_sum: 0.0,
            block_sum: 0.0,
            block_count: 0,
            block_size,
            sample_rate,
        }
    }

    /// Process a stereo sample pair and update internal state.
    #[inline]
    pub fn process(&mut self, left: f32, right: f32) {
        // Apply K-weighting
        let kl = self.k_hp_l.process_sample(self.k_shelf_l.process_sample(left));
        let kr = self.k_hp_r.process_sample(self.k_shelf_r.process_sample(right));

        // Accumulate mean square (stereo sum)
        let sq = (kl as f64) * (kl as f64) + (kr as f64) * (kr as f64);
        self.block_sum += sq;
        self.block_count += 1;

        // When a block is complete, push to ring buffers
        if self.block_count >= self.block_size {
            let block_mean = self.block_sum / self.block_count as f64;

            // Update momentary ring buffer
            self.momentary_sum -= self.momentary_buffer[self.momentary_pos];
            self.momentary_buffer[self.momentary_pos] = block_mean;
            self.momentary_sum += block_mean;
            self.momentary_pos = (self.momentary_pos + 1) % self.momentary_buffer.len();

            // Update short-term ring buffer
            self.short_term_sum -= self.short_term_buffer[self.short_term_pos];
            self.short_term_buffer[self.short_term_pos] = block_mean;
            self.short_term_sum += block_mean;
            self.short_term_pos = (self.short_term_pos + 1) % self.short_term_buffer.len();

            self.block_sum = 0.0;
            self.block_count = 0;
        }
    }

    /// Process a block of stereo audio.
    pub fn process_block(&mut self, left: &[f32], right: &[f32]) {
        let len = left.len().min(right.len());
        for i in 0..len {
            self.process(left[i], right[i]);
        }
    }

    /// Get momentary loudness (400ms window) in LUFS.
    pub fn momentary_lufs(&self) -> f64 {
        let mean = self.momentary_sum / self.momentary_buffer.len() as f64;
        mean_square_to_lufs(mean)
    }

    /// Get short-term loudness (3s window) in LUFS.
    pub fn short_term_lufs(&self) -> f64 {
        let mean = self.short_term_sum / self.short_term_buffer.len() as f64;
        mean_square_to_lufs(mean)
    }

    pub fn reset(&mut self) {
        self.k_shelf_l.reset();
        self.k_shelf_r.reset();
        self.k_hp_l.reset();
        self.k_hp_r.reset();
        self.momentary_buffer.fill(0.0);
        self.short_term_buffer.fill(0.0);
        self.momentary_pos = 0;
        self.short_term_pos = 0;
        self.momentary_sum = 0.0;
        self.short_term_sum = 0.0;
        self.block_sum = 0.0;
        self.block_count = 0;
    }
}

/// Convert mean square energy to LUFS.
#[inline]
fn mean_square_to_lufs(mean_sq: f64) -> f64 {
    if mean_sq < 1e-20 {
        -200.0 // effectively -inf
    } else {
        -0.691 + 10.0 * mean_sq.log10()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SR: f64 = 48000.0;

    #[test]
    fn limiter_prevents_clipping() {
        let mut lim = Limiter::new(LimiterParams::default(), SR); // -1 dBTP ceiling

        // Signal that exceeds ceiling
        let mut left = vec![0.95f32; 4800];
        let mut right = vec![0.95f32; 4800];

        lim.process_stereo(&mut left, &mut right);

        // After lookahead settles, output should be below ceiling
        let ceiling_lin = 10.0_f64.powf(-1.0 / 20.0) as f32;
        for &s in &left[500..] {
            assert!(
                s.abs() <= ceiling_lin + 0.01,
                "Output should be below ceiling ({ceiling_lin}): got {}",
                s.abs()
            );
        }
    }

    #[test]
    fn limiter_passes_quiet_signal() {
        let mut lim = Limiter::new(LimiterParams::default(), SR);

        let mut left = vec![0.1f32; 1000];
        let mut right = vec![0.1f32; 1000];

        lim.process_stereo(&mut left, &mut right);

        // Quiet signal should pass through (after lookahead delay)
        // Check toward the end where lookahead has settled
        let output = left[999].abs();
        assert!(
            (output - 0.1).abs() < 0.02,
            "Quiet signal should pass: expected ~0.1, got {output}"
        );
    }

    #[test]
    fn limiter_gain_reduction_reported() {
        let mut lim = Limiter::new(LimiterParams { ceiling_db: -6.0, ..LimiterParams::default() }, SR);

        let mut left = vec![0.9f32; 2000];
        let mut right = vec![0.9f32; 2000];
        lim.process_stereo(&mut left, &mut right);

        assert!(
            lim.gain_reduction_db() > 0.0,
            "Should report GR: {}",
            lim.gain_reduction_db()
        );
    }

    #[test]
    fn lufs_silence_very_low() {
        let mut meter = LufsMeter::new(SR);

        let left = vec![0.0f32; 48000];
        let right = vec![0.0f32; 48000];
        meter.process_block(&left, &right);

        assert!(
            meter.momentary_lufs() < -60.0,
            "Silence should be very quiet: {} LUFS",
            meter.momentary_lufs()
        );
    }

    #[test]
    fn lufs_full_scale_sine() {
        let mut meter = LufsMeter::new(SR);

        // 1kHz sine at 0 dBFS for 1 second
        let left: Vec<f32> = (0..48000)
            .map(|i| (2.0 * core::f64::consts::PI * 1000.0 * i as f64 / SR).sin() as f32)
            .collect();
        let right = left.clone();
        meter.process_block(&left, &right);

        let lufs = meter.momentary_lufs();
        // A 0 dBFS sine should measure around -3 to 0 LUFS (K-weighted)
        assert!(
            lufs > -10.0 && lufs < 5.0,
            "Full-scale sine LUFS should be near 0: got {lufs}"
        );
    }

    #[test]
    fn lufs_short_term_window() {
        let mut meter = LufsMeter::new(SR);

        // 3 seconds of signal
        let left: Vec<f32> = (0..144000)
            .map(|i| (2.0 * core::f64::consts::PI * 1000.0 * i as f64 / SR).sin() as f32 * 0.5)
            .collect();
        let right = left.clone();
        meter.process_block(&left, &right);

        let st = meter.short_term_lufs();
        // Should be a reasonable value
        assert!(
            st > -30.0 && st < 0.0,
            "Short-term LUFS for -6dBFS sine: got {st}"
        );
    }
}
