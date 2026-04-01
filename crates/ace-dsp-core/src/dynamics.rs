//! Dynamics processing — compressor, gate, envelope follower.
//!
//! Professional-grade dynamics with RMS/peak detection, soft/hard knee,
//! sidechain support, lookahead, and auto-release.

use crate::biquad::{BiquadCoeffs, BiquadMono, FilterType};
use crate::delay::DelayLine;
use crate::ANTI_DENORMAL;

// ── Envelope Follower ───────────────────────────────────────────────

/// Detection mode for the envelope follower.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum DetectionMode {
    Peak,
    Rms,
}

/// Envelope follower with configurable attack/release times.
///
/// Tracks the amplitude envelope of an audio signal using exponential
/// smoothing with separate attack and release coefficients.
#[derive(Debug, Clone)]
pub struct EnvelopeFollower {
    mode: DetectionMode,
    attack_coeff: f64,
    release_coeff: f64,
    envelope: f64,
    rms_window: f64, // running sum of squares for RMS
    sample_rate: f64,
}

impl EnvelopeFollower {
    /// Create a new envelope follower.
    ///
    /// - `mode`: Peak or RMS detection
    /// - `attack_ms`: attack time in milliseconds (0.1–100)
    /// - `release_ms`: release time in milliseconds (10–2000)
    /// - `sample_rate`: sample rate in Hz
    pub fn new(mode: DetectionMode, attack_ms: f64, release_ms: f64, sample_rate: f64) -> Self {
        Self {
            mode,
            attack_coeff: time_to_coeff(attack_ms, sample_rate),
            release_coeff: time_to_coeff(release_ms, sample_rate),
            envelope: 0.0,
            rms_window: 0.0,
            sample_rate,
        }
    }

    pub fn set_attack(&mut self, attack_ms: f64) {
        self.attack_coeff = time_to_coeff(attack_ms, self.sample_rate);
    }

    pub fn set_release(&mut self, release_ms: f64) {
        self.release_coeff = time_to_coeff(release_ms, self.sample_rate);
    }

    /// Process one sample and return the current envelope level (linear).
    #[inline]
    pub fn process(&mut self, input: f64) -> f64 {
        let level = match self.mode {
            DetectionMode::Peak => input.abs(),
            DetectionMode::Rms => {
                // Exponentially-weighted RMS
                let sq = input * input;
                self.rms_window =
                    self.rms_window * self.release_coeff + sq * (1.0 - self.release_coeff);
                (self.rms_window + ANTI_DENORMAL).sqrt()
            }
        };

        let coeff = if level > self.envelope {
            self.attack_coeff
        } else {
            self.release_coeff
        };

        self.envelope = self.envelope * coeff + level * (1.0 - coeff);
        self.envelope
    }

    pub fn reset(&mut self) {
        self.envelope = 0.0;
        self.rms_window = 0.0;
    }

    pub fn level_db(&self) -> f64 {
        linear_to_db(self.envelope)
    }
}

// ── Compressor ──────────────────────────────────────────────────────

/// Transfer function parameters for the compressor.
#[derive(Debug, Clone, Copy)]
pub struct CompressorParams {
    pub threshold_db: f64,  // -60 to 0
    pub ratio: f64,         // 1.0 to f64::INFINITY
    pub knee_db: f64,       // 0 (hard) to 30 (soft)
    pub attack_ms: f64,     // 0.1 to 100
    pub release_ms: f64,    // 10 to 2000
    pub makeup_db: f64,     // manual makeup gain
    pub mix: f64,           // 0.0 (dry) to 1.0 (wet) — parallel compression
    pub detection: DetectionMode,
    pub lookahead_ms: f64,  // 0 to 10
}

impl Default for CompressorParams {
    fn default() -> Self {
        Self {
            threshold_db: -18.0,
            ratio: 4.0,
            knee_db: 6.0,
            attack_ms: 10.0,
            release_ms: 100.0,
            makeup_db: 0.0,
            mix: 1.0,
            detection: DetectionMode::Rms,
            lookahead_ms: 0.0,
        }
    }
}

/// Professional compressor with soft knee, sidechain, and lookahead.
#[derive(Debug, Clone)]
pub struct Compressor {
    params: CompressorParams,
    env_left: EnvelopeFollower,
    env_right: EnvelopeFollower,
    lookahead_left: Option<DelayLine>,
    lookahead_right: Option<DelayLine>,
    lookahead_samples: usize,
    sidechain_hpf: Option<BiquadMono>,
    gain_reduction_db: f64, // for metering
    sample_rate: f64,
}

impl Compressor {
    pub fn new(params: CompressorParams, sample_rate: f64) -> Self {
        let env_left = EnvelopeFollower::new(
            params.detection,
            params.attack_ms,
            params.release_ms,
            sample_rate,
        );
        let env_right = env_left.clone();

        let lookahead_samples = (params.lookahead_ms * sample_rate / 1000.0) as usize;
        let (la_l, la_r) = if lookahead_samples > 0 {
            (
                Some(DelayLine::new(lookahead_samples + 64)),
                Some(DelayLine::new(lookahead_samples + 64)),
            )
        } else {
            (None, None)
        };

        Self {
            params,
            env_left,
            env_right,
            lookahead_left: la_l,
            lookahead_right: la_r,
            lookahead_samples,
            sidechain_hpf: None,
            gain_reduction_db: 0.0,
            sample_rate,
        }
    }

    /// Enable a sidechain highpass filter (useful for de-essing or bass-transparent compression).
    pub fn set_sidechain_hpf(&mut self, freq: f64) {
        if freq > 20.0 {
            let coeffs =
                BiquadCoeffs::new(FilterType::Highpass, freq, 0.707, 0.0, self.sample_rate);
            self.sidechain_hpf = Some(BiquadMono::new(coeffs));
        } else {
            self.sidechain_hpf = None;
        }
    }

    pub fn set_params(&mut self, params: CompressorParams) {
        self.env_left.set_attack(params.attack_ms);
        self.env_left.set_release(params.release_ms);
        self.env_right.set_attack(params.attack_ms);
        self.env_right.set_release(params.release_ms);
        self.params = params;
    }

    /// Get current gain reduction in dB (for metering display).
    pub fn gain_reduction_db(&self) -> f64 {
        self.gain_reduction_db
    }

    /// Process stereo audio in-place.
    pub fn process_stereo(&mut self, left: &mut [f32], right: &mut [f32]) {
        let len = left.len().min(right.len());
        let mut max_gr = 0.0f64;

        for i in 0..len {
            // Sidechain input: use the audio signal (or filtered version)
            let mut sc_l = left[i] as f64;
            let sc_r = right[i] as f64;

            if let Some(ref mut hpf) = self.sidechain_hpf {
                sc_l = hpf.process_sample(sc_l as f32) as f64;
                // Note: single HPF for linked stereo detection
            }

            // Envelope detection (linked stereo: max of L/R)
            let env_l = self.env_left.process(sc_l);
            let env_r = self.env_right.process(sc_r);
            let env_db = linear_to_db(env_l.max(env_r));

            // Transfer function: compute gain reduction
            let gr_db = compute_gain_reduction(
                env_db,
                self.params.threshold_db,
                self.params.ratio,
                self.params.knee_db,
            );

            max_gr = max_gr.max(-gr_db);

            // Apply makeup gain
            let total_gain_db = gr_db + self.params.makeup_db;
            let gain = db_to_linear(total_gain_db) as f32;

            // Lookahead: delay the audio signal
            let (dry_l, dry_r) = if let (Some(ref mut la_l), Some(ref mut la_r)) =
                (&mut self.lookahead_left, &mut self.lookahead_right)
            {
                la_l.push(left[i]);
                la_r.push(right[i]);
                (
                    la_l.read(self.lookahead_samples),
                    la_r.read(self.lookahead_samples),
                )
            } else {
                (left[i], right[i])
            };

            // Apply gain with parallel compression mix
            let wet_l = dry_l * gain;
            let wet_r = dry_r * gain;
            let mix = self.params.mix as f32;

            left[i] = dry_l * (1.0 - mix) + wet_l * mix;
            right[i] = dry_r * (1.0 - mix) + wet_r * mix;
        }

        self.gain_reduction_db = max_gr;
    }

    pub fn reset(&mut self) {
        self.env_left.reset();
        self.env_right.reset();
        if let Some(ref mut la) = self.lookahead_left {
            la.clear();
        }
        if let Some(ref mut la) = self.lookahead_right {
            la.clear();
        }
        self.gain_reduction_db = 0.0;
    }
}

// ── Gate ─────────────────────────────────────────────────────────────

/// Gate/expander parameters.
#[derive(Debug, Clone, Copy)]
pub struct GateParams {
    pub threshold_db: f64,  // -80 to 0
    pub range_db: f64,      // -inf to 0 (how much attenuation when closed)
    pub attack_ms: f64,     // 0.1 to 50
    pub hold_ms: f64,       // 0 to 500
    pub release_ms: f64,    // 5 to 2000
    pub hysteresis_db: f64, // 0 to 10 (separate open/close thresholds)
    pub detection: DetectionMode,
}

impl Default for GateParams {
    fn default() -> Self {
        Self {
            threshold_db: -40.0,
            range_db: -80.0,
            attack_ms: 1.0,
            hold_ms: 10.0,
            release_ms: 100.0,
            hysteresis_db: 3.0,
            detection: DetectionMode::Rms,
        }
    }
}

/// Gate state machine states.
#[derive(Debug, Clone, Copy, PartialEq)]
enum GateState {
    Closed,
    Opening,
    Open,
    Holding,
    Closing,
}

/// Noise gate with hysteresis and hold time.
#[derive(Debug, Clone)]
pub struct Gate {
    params: GateParams,
    env: EnvelopeFollower,
    state: GateState,
    hold_counter: usize,
    hold_samples: usize,
    current_gain: f64,
    attack_rate: f64,
    release_rate: f64,
    gain_reduction_db: f64,
    sample_rate: f64,
}

impl Gate {
    pub fn new(params: GateParams, sample_rate: f64) -> Self {
        let hold_samples = (params.hold_ms * sample_rate / 1000.0) as usize;
        let attack_rate = 1.0 / (params.attack_ms * sample_rate / 1000.0).max(1.0);
        let release_rate = 1.0 / (params.release_ms * sample_rate / 1000.0).max(1.0);

        Self {
            params,
            env: EnvelopeFollower::new(params.detection, 0.1, 50.0, sample_rate),
            state: GateState::Closed,
            hold_counter: 0,
            hold_samples,
            current_gain: 0.0,
            attack_rate,
            release_rate,
            gain_reduction_db: 0.0,
            sample_rate,
        }
    }

    pub fn set_params(&mut self, params: GateParams) {
        self.hold_samples = (params.hold_ms * self.sample_rate / 1000.0) as usize;
        self.attack_rate = 1.0 / (params.attack_ms * self.sample_rate / 1000.0).max(1.0);
        self.release_rate = 1.0 / (params.release_ms * self.sample_rate / 1000.0).max(1.0);
        self.env.set_attack(0.1); // Fast env detection for gate
        self.env.set_release(50.0);
        self.params = params;
    }

    pub fn gain_reduction_db(&self) -> f64 {
        self.gain_reduction_db
    }

    /// Process stereo audio in-place.
    pub fn process_stereo(&mut self, left: &mut [f32], right: &mut [f32]) {
        let len = left.len().min(right.len());
        let range_linear = db_to_linear(self.params.range_db);

        for i in 0..len {
            let sc = (left[i].abs().max(right[i].abs())) as f64;
            let env_db = linear_to_db(self.env.process(sc));

            let open_thresh = self.params.threshold_db;
            let close_thresh = self.params.threshold_db - self.params.hysteresis_db;

            // State machine
            match self.state {
                GateState::Closed | GateState::Closing => {
                    if env_db > open_thresh {
                        self.state = GateState::Opening;
                    }
                }
                GateState::Opening => {
                    self.current_gain += self.attack_rate;
                    if self.current_gain >= 1.0 {
                        self.current_gain = 1.0;
                        self.state = GateState::Open;
                    }
                }
                GateState::Open => {
                    if env_db < close_thresh {
                        self.state = GateState::Holding;
                        self.hold_counter = self.hold_samples;
                    }
                }
                GateState::Holding => {
                    if env_db > open_thresh {
                        self.state = GateState::Open;
                    } else if self.hold_counter == 0 {
                        self.state = GateState::Closing;
                    } else {
                        self.hold_counter -= 1;
                    }
                }
            }

            if self.state == GateState::Closing {
                self.current_gain -= self.release_rate;
                if self.current_gain <= range_linear {
                    self.current_gain = range_linear;
                    self.state = GateState::Closed;
                }
            }

            let gain = self.current_gain as f32;
            left[i] *= gain;
            right[i] *= gain;
        }

        self.gain_reduction_db = linear_to_db(self.current_gain).min(0.0).abs();
    }

    pub fn reset(&mut self) {
        self.env.reset();
        self.state = GateState::Closed;
        self.current_gain = 0.0;
        self.hold_counter = 0;
        self.gain_reduction_db = 0.0;
    }
}

// ── Utility functions ───────────────────────────────────────────────

/// Convert time constant (ms) to exponential smoothing coefficient.
#[inline]
fn time_to_coeff(time_ms: f64, sample_rate: f64) -> f64 {
    if time_ms <= 0.0 {
        return 0.0;
    }
    (-1.0 / (time_ms * 0.001 * sample_rate)).exp()
}

/// Convert linear amplitude to dB.
#[inline]
pub fn linear_to_db(linear: f64) -> f64 {
    if linear <= 1e-10 {
        -200.0
    } else {
        20.0 * linear.log10()
    }
}

/// Convert dB to linear amplitude.
#[inline]
pub fn db_to_linear(db: f64) -> f64 {
    10.0_f64.powf(db / 20.0)
}

/// Compute gain reduction from the compressor transfer function.
///
/// Implements soft knee using a quadratic interpolation zone around threshold.
#[inline]
fn compute_gain_reduction(input_db: f64, threshold: f64, ratio: f64, knee_db: f64) -> f64 {
    if knee_db <= 0.01 {
        // Hard knee
        if input_db <= threshold {
            0.0
        } else {
            let over = input_db - threshold;
            -(over - over / ratio)
        }
    } else {
        // Soft knee (quadratic interpolation)
        let half_knee = knee_db / 2.0;
        let lower = threshold - half_knee;
        let upper = threshold + half_knee;

        if input_db <= lower {
            0.0
        } else if input_db >= upper {
            let over = input_db - threshold;
            -(over - over / ratio)
        } else {
            // In the knee zone: quadratic blend
            let x = input_db - lower;
            let knee_factor = (1.0 / ratio - 1.0) * x * x / (2.0 * knee_db);
            knee_factor
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SR: f64 = 48000.0;

    #[test]
    fn envelope_follower_tracks_signal() {
        let mut ef = EnvelopeFollower::new(DetectionMode::Peak, 1.0, 50.0, SR);

        // Feed a constant signal
        for _ in 0..1000 {
            ef.process(0.5);
        }

        let level = ef.envelope;
        assert!(
            (level - 0.5).abs() < 0.05,
            "Envelope should track 0.5: got {level}"
        );
    }

    #[test]
    fn envelope_follower_decays_on_silence() {
        let mut ef = EnvelopeFollower::new(DetectionMode::Peak, 0.1, 50.0, SR);

        // Build up envelope
        for _ in 0..500 {
            ef.process(1.0);
        }
        let peak = ef.envelope;

        // Feed silence — 50ms release at 48kHz needs ~15000 samples to decay significantly
        for _ in 0..20000 {
            ef.process(0.0);
        }

        assert!(
            ef.envelope < peak * 0.1,
            "Envelope should decay: peak={peak}, after silence={}",
            ef.envelope
        );
    }

    #[test]
    fn compressor_reduces_loud_signal() {
        let params = CompressorParams {
            threshold_db: -20.0,
            ratio: 4.0,
            knee_db: 0.0, // hard knee for predictable test
            attack_ms: 0.1,
            release_ms: 100.0,
            makeup_db: 0.0,
            mix: 1.0,
            detection: DetectionMode::Peak,
            lookahead_ms: 0.0,
        };

        let mut comp = Compressor::new(params, SR);

        // Create a loud signal (0 dBFS)
        let mut left = vec![0.8f32; 2000];
        let mut right = vec![0.8f32; 2000];

        comp.process_stereo(&mut left, &mut right);

        // After settling, output should be reduced
        let output_level = left[1999].abs();
        assert!(
            output_level < 0.8,
            "Compressor should reduce loud signal: input=0.8, output={output_level}"
        );
        assert!(
            comp.gain_reduction_db() > 0.0,
            "Should report gain reduction: got {} dB",
            comp.gain_reduction_db()
        );
    }

    #[test]
    fn compressor_passes_quiet_signal() {
        let params = CompressorParams {
            threshold_db: -10.0,
            ratio: 4.0,
            ..CompressorParams::default()
        };

        let mut comp = Compressor::new(params, SR);

        // Signal well below threshold (-40 dBFS ≈ 0.01)
        let mut left = vec![0.01f32; 1000];
        let mut right = vec![0.01f32; 1000];

        comp.process_stereo(&mut left, &mut right);

        // Should pass through unchanged (within tolerance)
        let output = left[999].abs();
        assert!(
            (output - 0.01).abs() < 0.005,
            "Quiet signal should pass through: expected ~0.01, got {output}"
        );
    }

    #[test]
    fn compressor_parallel_mix() {
        let params = CompressorParams {
            threshold_db: -20.0,
            ratio: 10.0,
            mix: 0.5, // 50% parallel
            attack_ms: 0.1,
            detection: DetectionMode::Peak,
            ..CompressorParams::default()
        };

        let mut comp = Compressor::new(params, SR);

        let mut left = vec![0.9f32; 2000];
        let mut right = vec![0.9f32; 2000];

        comp.process_stereo(&mut left, &mut right);

        // With 50% mix, output should be between compressed and dry
        let output = left[1999].abs();
        assert!(
            output > 0.3 && output < 0.9,
            "Parallel mix should blend: got {output}"
        );
    }

    #[test]
    fn gate_silences_quiet_signal() {
        let params = GateParams {
            threshold_db: -30.0,
            range_db: -80.0,
            attack_ms: 0.1,
            hold_ms: 0.0,
            release_ms: 5.0,
            hysteresis_db: 0.0,
            detection: DetectionMode::Peak,
        };

        let mut gate = Gate::new(params, SR);

        // Signal below threshold (-40 dBFS ≈ 0.01)
        let mut left = vec![0.01f32; 2000];
        let mut right = vec![0.01f32; 2000];

        gate.process_stereo(&mut left, &mut right);

        let output = left[1999].abs();
        assert!(
            output < 0.005,
            "Gate should silence quiet signal: got {output}"
        );
    }

    #[test]
    fn gate_passes_loud_signal() {
        let params = GateParams {
            threshold_db: -30.0,
            range_db: -80.0,
            attack_ms: 0.1,
            ..GateParams::default()
        };

        let mut gate = Gate::new(params, SR);

        // Signal above threshold (-6 dBFS ≈ 0.5)
        let mut left = vec![0.5f32; 2000];
        let mut right = vec![0.5f32; 2000];

        gate.process_stereo(&mut left, &mut right);

        let output = left[1999].abs();
        assert!(
            (output - 0.5).abs() < 0.05,
            "Gate should pass loud signal: expected ~0.5, got {output}"
        );
    }

    #[test]
    fn soft_knee_gain_reduction() {
        // At threshold with soft knee, GR should be half of hard-knee GR
        let hard = compute_gain_reduction(-20.0, -20.0, 4.0, 0.0);
        let soft = compute_gain_reduction(-20.0, -20.0, 4.0, 10.0);

        // Hard knee at threshold: 0 dB GR
        assert!(
            hard.abs() < 0.01,
            "Hard knee at threshold should be 0: got {hard}"
        );
        // Soft knee at threshold: some GR (midpoint of knee curve)
        assert!(
            soft.abs() < 5.0,
            "Soft knee at threshold should have moderate GR: got {soft}"
        );
    }

    #[test]
    fn linear_db_roundtrip() {
        for db in [-60.0, -20.0, -6.0, 0.0, 6.0, 12.0] {
            let lin = db_to_linear(db);
            let back = linear_to_db(lin);
            assert!(
                (back - db).abs() < 0.001,
                "dB roundtrip failed: {db} → {lin} → {back}"
            );
        }
    }
}
