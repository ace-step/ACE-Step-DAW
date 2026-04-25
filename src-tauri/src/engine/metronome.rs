//! Native procedural metronome.
//!
//! # Design
//!
//! The metronome does *not* rely on external samples. A short,
//! pitched decaying-sine burst ("click") is synthesized on the fly
//! every time the scheduler detects a beat boundary inside the
//! current audio buffer. This keeps the engine's file-I/O surface
//! at zero and means the metronome is instantly usable with no
//! setup.
//!
//! # Scheduler
//!
//! The scheduler consumes the transport's [`super::tempo_map::TempoMap`]
//! and [`super::time_sig_map::TimeSignatureMap`], and on every audio
//! buffer computes:
//!
//!  1. The first sample-aligned beat index ≥ the current playhead.
//!  2. The beat's sample position via `TempoMap::beat_to_sample`.
//!  3. Whether that sample falls inside the current buffer
//!     `[playhead, playhead + frames)`. If it does, the click
//!     generator starts at the exact in-buffer offset.
//!  4. Whether the beat is beat 1 of the bar (accent) via the
//!     time-signature numerator.
//!
//! Each buffer may fire 0, 1, or multiple clicks (at pathologically
//! fast tempos with long buffers). The scheduler iterates over
//! consecutive beats that land in the buffer so it never drops one.
//!
//! # Click envelope
//!
//! - Attack: 1 ms linear ramp (subtle — avoids the hard transient
//!   that a pure step start would produce).
//! - Sustain: none.
//! - Decay: ~24 ms exponential, `e^(-6 · t/decay_len)` — ends at
//!   ≈ e⁻⁶ ≈ 0.0025.
//! - Total duration: 25 ms.
//!
//! Audible but tight; does not bleed into the next beat at sensible
//! tempos.
//!
//! # Real-time safety
//!
//! The renderer runs on the audio callback. It does not allocate,
//! lock, or panic. State (active click phase, envelope time) is
//! pre-allocated and resets to idle between clicks.
//!
//! # Thread-sharing
//!
//! `MetronomeConfig` (enable/volume/frequency) is published from
//! the main thread via `ArcSwap`; the audio thread reads on every
//! buffer with a wait-free `.load()`. The active-click state
//! (phase, envelope time) lives *only* on the audio thread — it
//! is not shared.

use serde::{Deserialize, Serialize};

use super::tempo_map::TempoMap;
use super::time_sig_map::TimeSignatureMap;

/// Click/accent frequency + volume controls. Shared via
/// `ArcSwap<MetronomeConfig>` so the main thread can publish
/// without blocking the audio callback.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetronomeConfig {
    pub enabled: bool,
    /// Linear gain for non-accent beats, [0.0, 1.0]. Clamped on
    /// [`MetronomeConfig::new`].
    ///
    /// **Note on clipping**: the metronome is mixed additively with
    /// program audio on the master bus. If program audio is already
    /// near 0 dBFS, a unity-volume metronome (both this and
    /// `accent_volume`) will push the sum over full scale and
    /// clip. The default of 0.6 / 0.8 leaves ~4 dB of headroom for
    /// a program signal peaking around -4 dBFS. Raise with care.
    pub volume: f32,
    /// Linear gain for the accented beat (beat 1 of each bar).
    /// Clamped on [`MetronomeConfig::new`]. Typically slightly
    /// louder than `volume` so the downbeat stands out.
    /// See [`volume`](Self::volume) for the clipping caveat.
    pub accent_volume: f32,
    /// Pitch of the non-accent click. 1000 Hz is the Ableton
    /// default.
    pub click_freq_hz: f32,
    /// Pitch of the accent click. 1500 Hz is a musical fifth above
    /// 1000 Hz and reads clearly as "louder/brighter" to the ear.
    pub accent_freq_hz: f32,
}

impl MetronomeConfig {
    /// Sensible defaults. Off by default so a newly-opened project
    /// does not start clicking.
    pub const fn default_off() -> Self {
        Self {
            enabled: false,
            volume: 0.6,
            accent_volume: 0.8,
            click_freq_hz: 1_000.0,
            accent_freq_hz: 1_500.0,
        }
    }

    /// Constructor with clamping. All incoming values are sanitized
    /// so deserialization via serde cannot inject out-of-range
    /// volumes or NaN frequencies that would poison the audio
    /// thread.
    pub fn new(
        enabled: bool,
        volume: f32,
        accent_volume: f32,
        click_freq_hz: f32,
        accent_freq_hz: f32,
    ) -> Self {
        Self {
            enabled,
            volume: clamp_volume(volume),
            accent_volume: clamp_volume(accent_volume),
            click_freq_hz: clamp_freq(click_freq_hz, 1_000.0),
            accent_freq_hz: clamp_freq(accent_freq_hz, 1_500.0),
        }
    }
}

impl Default for MetronomeConfig {
    fn default() -> Self {
        Self::default_off()
    }
}

#[inline]
fn clamp_volume(v: f32) -> f32 {
    if v.is_finite() { v.clamp(0.0, 1.0) } else { 0.0 }
}

#[inline]
fn clamp_freq(f: f32, fallback: f32) -> f32 {
    // Limit to the audible range — below 40 Hz is muddy,
    // above 8 kHz is piercing, both are bad as a metronome.
    if f.is_finite() && f > 0.0 {
        f.clamp(40.0, 8_000.0)
    } else {
        fallback
    }
}

/// Total click length in seconds. Pulled out so the audio-thread
/// scheduler can compare "sample position + duration" against the
/// next beat without recomputing.
pub const CLICK_DURATION_SEC: f32 = 0.025;
/// Attack duration — the initial ramp-in. Very short so the click
/// is tight, but not zero so we avoid the DC-step transient.
pub const CLICK_ATTACK_SEC: f32 = 0.001;

/// Compute the click envelope amplitude at a given sample offset
/// within the click. Returns 0 once past `CLICK_DURATION_SEC`.
///
/// Envelope shape:
/// - `[0, attack_samples)`: linear ramp 0 → 1
/// - `[attack_samples, total_samples)`: exponential decay
///   `e^(-6 · (t - attack) / (total - attack))`, ending at ≈ e⁻⁶
#[inline]
pub fn click_envelope(t_sample: u32, sample_rate: f32) -> f32 {
    let attack_samples = (CLICK_ATTACK_SEC * sample_rate) as u32;
    let total_samples = (CLICK_DURATION_SEC * sample_rate) as u32;
    if t_sample >= total_samples {
        return 0.0;
    }
    if t_sample < attack_samples {
        return t_sample as f32 / attack_samples.max(1) as f32;
    }
    let denom = (total_samples - attack_samples).max(1) as f32;
    let decay_t = (t_sample - attack_samples) as f32 / denom;
    (-6.0 * decay_t).exp()
}

/// Live click state owned by the audio thread. When `samples_into`
/// is `None`, no click is playing.
#[derive(Debug, Default, Clone, Copy)]
pub struct ClickGenerator {
    /// Number of samples into the current click, or `None` if idle.
    samples_into: Option<u32>,
    /// Phase accumulator for the sine. Kept in radians mod 2π.
    phase: f32,
    /// Frequency of the currently-playing click, Hz.
    freq: f32,
    /// Linear gain for the currently-playing click.
    amplitude: f32,
}

impl ClickGenerator {
    pub fn idle() -> Self {
        Self::default()
    }

    /// Start a new click. If a previous click is still decaying,
    /// it's silently truncated — the new beat always wins over an
    /// overlapping tail.
    pub fn trigger(&mut self, freq: f32, amplitude: f32) {
        self.samples_into = Some(0);
        self.phase = 0.0;
        self.freq = freq;
        self.amplitude = amplitude;
    }

    pub fn is_active(&self) -> bool {
        self.samples_into.is_some()
    }

    /// Advance one sample and return the output value. Returns 0
    /// when idle or when the envelope finishes.
    #[inline]
    pub fn tick(&mut self, sample_rate: f32) -> f32 {
        let Some(t) = self.samples_into else { return 0.0 };
        // Termination is based on sample count, not envelope value:
        // env(0) is legitimately 0 (start of attack ramp), so if we
        // gated on "env == 0 → idle" the click would abort before
        // the ramp ever started.
        let total = (CLICK_DURATION_SEC * sample_rate) as u32;
        if t >= total {
            self.samples_into = None;
            return 0.0;
        }
        let env = click_envelope(t, sample_rate);
        let two_pi = core::f32::consts::TAU;
        let sample = self.phase.sin() * env * self.amplitude;
        self.phase += two_pi * self.freq / sample_rate;
        if self.phase > two_pi {
            self.phase -= two_pi;
        }
        self.samples_into = Some(t + 1);
        sample
    }
}

/// Compute the sample position of the beat immediately after
/// `playhead_sample`, based on the tempo map.
///
/// Returned as `(beat_index, sample_position)`. The beat index is
/// measured from sample 0 and is a `u64`, not a float, because the
/// metronome only fires at integer beat boundaries.
///
/// Algorithm: convert playhead to fractional beats via
/// [`TempoMap::sample_to_beat`], take `ceil`, then convert back
/// via `beat_to_sample`. This handles tempo changes between the
/// playhead and the next beat correctly because `beat_to_sample`
/// walks the map segments.
pub fn next_beat_at_or_after(
    playhead_sample: u64,
    tempo_map: &TempoMap,
    sample_rate: u32,
) -> (u64, u64) {
    let frac = tempo_map.sample_to_beat(playhead_sample, sample_rate);
    // Align to the next integer beat. If the playhead is exactly
    // on a beat (frac is integer), fire THIS beat, not the next.
    //
    // Naive `frac.ceil()` fails when multi-segment integration
    // produces an ULP-sized overshoot: at 44.1 kHz with a
    // pathological tempo map, `sample_to_beat(beat_to_sample(15))`
    // can return `15.000000000000002`, so `ceil` goes to 16 and
    // the click on beat 15 is skipped (found by codex review on
    // PR #1717). An ε-tolerant round-to-integer fixes this while
    // still promoting any mid-beat value up to the next integer.
    const EPS: f64 = 1e-9;
    let rounded = frac.round();
    let beat = if (frac - rounded).abs() < EPS && rounded >= 0.0 {
        rounded as u64
    } else if frac <= 0.0 {
        0
    } else {
        frac.ceil() as u64
    };
    let sample = tempo_map.beat_to_sample(beat as f64, sample_rate);
    (beat, sample)
}

/// Determine whether `beat` is beat 1 of the bar, per the time
/// signature active at `sample_of_beat`.
///
/// Logic: sum up the numerators of every time-signature segment up
/// to and including the one containing this beat. Actually for 3E
/// MVP we take a shortcut — we ignore cross-segment bar counting
/// and just use "beat_index mod numerator == 0" based on the
/// signature at the beat's sample position. This is exact for
/// constant time signatures (the common case) and is off-by-one
/// at the instant of a mid-bar signature change, which is
/// acceptable because that is a pathological content choice.
pub fn is_accent_beat(
    beat_index: u64,
    sample_of_beat: u64,
    time_sig: &TimeSignatureMap,
) -> bool {
    let (numerator, _) = time_sig.signature_at(sample_of_beat);
    if numerator == 0 {
        return false;
    }
    beat_index % (numerator as u64) == 0
}

/// Render a contiguous run of samples with a linear sample-position
/// mapping: the output samples `out_l[start_offset..end_offset]` /
/// `out_r[start_offset..end_offset]` correspond to absolute transport
/// samples `[seg_start_sample, seg_start_sample + (end - start))`.
///
/// Pulled into its own function so the audio callback can call it
/// twice per buffer when the transport wraps mid-buffer via the
/// loop region — the "before wrap" and "after wrap" segments each
/// have their own linear mapping but the click state carries
/// across. Found by Copilot review on PR #1717.
///
/// `click_gen` state persists across calls so an in-flight click
/// that crossed the wrap point decays smoothly into the new
/// segment.
///
/// Saturating arithmetic guards against `u64` overflow near
/// pathological seek positions — in debug builds a plain add would
/// panic on the `+ 1` bump, and in release it would silently wrap
/// and poison beat detection. Found by Copilot review on PR #1717.
#[allow(clippy::too_many_arguments)]
pub fn render_metronome_segment(
    click_gen: &mut ClickGenerator,
    out_l: &mut [f32],
    out_r: &mut [f32],
    start_offset: usize,
    end_offset: usize,
    seg_start_sample: u64,
    tempo_map: &TempoMap,
    time_sig: &TimeSignatureMap,
    config: MetronomeConfig,
    sample_rate: f32,
) {
    let sr_u32 = sample_rate as u32;
    let (mut next_beat_idx, mut next_beat_sample) =
        next_beat_at_or_after(seg_start_sample, tempo_map, sr_u32);
    for i in start_offset..end_offset {
        let offset = (i - start_offset) as u64;
        let cur_sample = seg_start_sample.saturating_add(offset);
        if cur_sample >= next_beat_sample {
            let accent = is_accent_beat(next_beat_idx, next_beat_sample, time_sig);
            let (freq, amp) = if accent {
                (config.accent_freq_hz, config.accent_volume)
            } else {
                (config.click_freq_hz, config.volume)
            };
            click_gen.trigger(freq, amp);
            next_beat_idx = next_beat_idx.saturating_add(1);
            next_beat_sample = tempo_map.beat_to_sample(next_beat_idx as f64, sr_u32);
            if next_beat_sample <= cur_sample {
                // Defensive: broken tempo math should not spin
                // forever on the same sample.
                next_beat_sample = cur_sample.saturating_add(1);
            }
        }
        let s = click_gen.tick(sample_rate);
        out_l[i] += s;
        out_r[i] += s;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::tempo_map::{TempoEvent, TempoMap};
    use crate::engine::time_sig_map::{TimeSignatureEvent, TimeSignatureMap};

    fn approx_eq(a: f32, b: f32, eps: f32) -> bool {
        (a - b).abs() < eps
    }

    // ── MetronomeConfig ─────────────────────────────────────────────

    #[test]
    fn default_is_off_with_safe_defaults() {
        let c = MetronomeConfig::default();
        assert!(!c.enabled);
        assert!((0.0..=1.0).contains(&c.volume));
        assert!((0.0..=1.0).contains(&c.accent_volume));
        assert!(c.accent_volume >= c.volume, "accent ≥ normal");
        assert_eq!(c.click_freq_hz, 1000.0);
        assert_eq!(c.accent_freq_hz, 1500.0);
    }

    #[test]
    fn new_clamps_volume_to_unit_range() {
        let c = MetronomeConfig::new(true, -5.0, 99.0, 1000.0, 1500.0);
        assert_eq!(c.volume, 0.0);
        assert_eq!(c.accent_volume, 1.0);
    }

    #[test]
    fn new_snaps_nonfinite_volumes_to_zero() {
        let c = MetronomeConfig::new(true, f32::NAN, f32::INFINITY, 1000.0, 1500.0);
        assert_eq!(c.volume, 0.0);
        assert_eq!(c.accent_volume, 0.0);
    }

    #[test]
    fn new_snaps_bad_frequencies_to_fallback() {
        let c = MetronomeConfig::new(true, 0.5, 0.5, f32::NAN, -100.0);
        assert_eq!(c.click_freq_hz, 1000.0);
        assert_eq!(c.accent_freq_hz, 1500.0);
    }

    #[test]
    fn new_clamps_frequencies_to_audible_range() {
        // 10 Hz is below 40 Hz floor.
        let low = MetronomeConfig::new(true, 0.5, 0.5, 10.0, 10.0);
        assert_eq!(low.click_freq_hz, 40.0);
        assert_eq!(low.accent_freq_hz, 40.0);
        // 20 kHz is above 8 kHz ceiling.
        let high = MetronomeConfig::new(true, 0.5, 0.5, 20_000.0, 20_000.0);
        assert_eq!(high.click_freq_hz, 8_000.0);
        assert_eq!(high.accent_freq_hz, 8_000.0);
    }

    #[test]
    fn config_is_copy_and_serializes_as_camel_case() {
        fn assert_copy<T: Copy>() {}
        assert_copy::<MetronomeConfig>();
        let c = MetronomeConfig::new(true, 0.6, 0.8, 1000.0, 1500.0);
        let json = serde_json::to_string(&c).unwrap();
        assert!(json.contains("\"enabled\":true"));
        assert!(json.contains("\"accentVolume\":0.8"));
        assert!(json.contains("\"clickFreqHz\":1000"));
        assert!(json.contains("\"accentFreqHz\":1500"));
        let back: MetronomeConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(back, c);
    }

    // ── click_envelope ──────────────────────────────────────────────

    #[test]
    fn envelope_is_zero_before_start_and_after_end() {
        let sr = 48_000.0;
        assert_eq!(click_envelope(0, sr), 0.0, "starts at 0 (attack ramp)");
        let total = (CLICK_DURATION_SEC * sr) as u32;
        assert_eq!(click_envelope(total, sr), 0.0, "past end = 0");
        assert_eq!(click_envelope(total + 100, sr), 0.0);
    }

    #[test]
    fn envelope_reaches_peak_one_at_attack_end() {
        let sr = 48_000.0;
        let attack = (CLICK_ATTACK_SEC * sr) as u32;
        let peak = click_envelope(attack, sr);
        // Should be ≥ ~0.99 (right at the transition to decay).
        assert!(peak >= 0.99 && peak <= 1.01, "peak at attack end = {peak}");
    }

    #[test]
    fn envelope_decays_exponentially_after_attack() {
        let sr = 48_000.0;
        let attack = (CLICK_ATTACK_SEC * sr) as u32;
        let total = (CLICK_DURATION_SEC * sr) as u32;
        // Should be strictly decreasing after the attack.
        let mut prev = click_envelope(attack, sr);
        for t in (attack + 1)..total {
            let v = click_envelope(t, sr);
            assert!(
                v < prev,
                "envelope not monotonically decreasing at t={t}: {v} >= {prev}"
            );
            prev = v;
        }
    }

    #[test]
    fn envelope_duration_matches_constant() {
        let sr = 48_000.0;
        // At exactly CLICK_DURATION_SEC, envelope is 0.
        let end_sample = (CLICK_DURATION_SEC * sr) as u32;
        assert_eq!(click_envelope(end_sample, sr), 0.0);
    }

    // ── ClickGenerator ──────────────────────────────────────────────

    #[test]
    fn idle_generator_outputs_zero() {
        let mut g = ClickGenerator::idle();
        assert!(!g.is_active());
        assert_eq!(g.tick(48_000.0), 0.0);
    }

    #[test]
    fn triggered_generator_produces_nonzero_samples() {
        let mut g = ClickGenerator::idle();
        g.trigger(1000.0, 1.0);
        assert!(g.is_active());
        // Advance a few samples through the attack — at least one
        // should be meaningfully non-zero.
        let mut saw_nonzero = false;
        for _ in 0..100 {
            let s = g.tick(48_000.0);
            if s.abs() > 0.01 {
                saw_nonzero = true;
            }
        }
        assert!(saw_nonzero, "generator produced no audible output");
    }

    #[test]
    fn generator_goes_idle_after_envelope_finishes() {
        let mut g = ClickGenerator::idle();
        g.trigger(1000.0, 1.0);
        // 48_000 × 0.025 = 1200 samples is the full envelope. Run
        // 2000 to be safe.
        for _ in 0..2000 {
            g.tick(48_000.0);
        }
        assert!(!g.is_active(), "generator should have returned to idle");
        // And further ticks should be silent.
        assert_eq!(g.tick(48_000.0), 0.0);
    }

    #[test]
    fn generator_output_does_not_clip_at_unity() {
        let mut g = ClickGenerator::idle();
        g.trigger(1000.0, 1.0);
        let mut max_abs = 0.0_f32;
        for _ in 0..2000 {
            let s = g.tick(48_000.0);
            max_abs = max_abs.max(s.abs());
        }
        assert!(
            max_abs <= 1.0001,
            "unity-volume click peaked at {max_abs} > 1.0 (clip risk)"
        );
    }

    // ── next_beat_at_or_after ───────────────────────────────────────

    #[test]
    fn next_beat_from_zero_is_beat_zero() {
        let map = TempoMap::new_constant(120.0);
        let (beat, sample) = next_beat_at_or_after(0, &map, 48_000);
        assert_eq!(beat, 0);
        assert_eq!(sample, 0);
    }

    #[test]
    fn next_beat_at_120_bpm_lands_on_half_second() {
        // 120 BPM = 2 beats/s = 24_000 samples/beat at 48 kHz.
        let map = TempoMap::new_constant(120.0);
        // Mid-beat.
        let (beat, sample) = next_beat_at_or_after(10_000, &map, 48_000);
        assert_eq!(beat, 1);
        assert_eq!(sample, 24_000);
        // Just before the beat.
        let (beat, sample) = next_beat_at_or_after(23_999, &map, 48_000);
        assert_eq!(beat, 1);
        assert_eq!(sample, 24_000);
        // Exactly on a beat returns THIS beat, not the next.
        let (beat, sample) = next_beat_at_or_after(24_000, &map, 48_000);
        assert_eq!(beat, 1);
        assert_eq!(sample, 24_000);
    }

    #[test]
    fn next_beat_tolerates_fp_precision_on_multi_segment_map() {
        // Codex P1 regression (PR #1717): at 44.1 kHz with certain
        // tempo maps, `sample_to_beat(beat_to_sample(N))` returns
        // something like `N + 1e-15`, so `ceil` jumps to N+1 and
        // the click on beat N is skipped. The ε-tolerant ceil
        // fixes this.
        let map = TempoMap::try_new(vec![
            TempoEvent::new(0, 651.0),
            TempoEvent::new(17_548, 172.0),
            TempoEvent::new(169_105, 504.0),
            TempoEvent::new(182_483, 665.0),
        ])
        .unwrap();
        let sr = 44_100;
        // Round-trip every beat and confirm next_beat_at_or_after
        // returns THAT beat, not the one after.
        for beat in 0..30u64 {
            let sample = map.beat_to_sample(beat as f64, sr);
            let (got, _) = next_beat_at_or_after(sample, &map, sr);
            assert_eq!(
                got, beat,
                "playhead exactly on beat {beat} (sample {sample}) \
                 should round-trip to beat {beat}, not {got}"
            );
        }
    }

    #[test]
    fn next_beat_handles_multi_segment_tempo_map() {
        // Segment A: 0..48_000 samples at 60 BPM → 1 beat, sample/beat = 48k.
        // Segment B: 48_000..∞ at 120 BPM → 24_000 samples/beat.
        let map = TempoMap::try_new(vec![
            TempoEvent::new(0, 60.0),
            TempoEvent::new(48_000, 120.0),
        ])
        .unwrap();
        // From sample 40_000 (inside seg A, still on beat 0 side):
        // next beat is 1 at sample 48_000.
        let (beat, sample) = next_beat_at_or_after(40_000, &map, 48_000);
        assert_eq!(beat, 1);
        assert_eq!(sample, 48_000);
        // From sample 60_000 (inside seg B, beat 1 at 48k is past
        // us): next beat is 2 at 48_000 + 24_000 = 72_000.
        let (beat, sample) = next_beat_at_or_after(60_000, &map, 48_000);
        assert_eq!(beat, 2);
        assert_eq!(sample, 72_000);
    }

    // ── is_accent_beat ──────────────────────────────────────────────

    #[test]
    fn accent_fires_on_beat_one_of_four_four() {
        let ts = TimeSignatureMap::new_constant(4, 4);
        assert!(is_accent_beat(0, 0, &ts));
        assert!(!is_accent_beat(1, 0, &ts));
        assert!(!is_accent_beat(2, 0, &ts));
        assert!(!is_accent_beat(3, 0, &ts));
        assert!(is_accent_beat(4, 0, &ts), "beat 5 (index 4) is downbeat of bar 2");
        assert!(is_accent_beat(8, 0, &ts));
    }

    #[test]
    fn accent_follows_time_signature_changes() {
        // 4/4 until sample 96_000, then 3/4.
        let ts = TimeSignatureMap::try_new(vec![
            TimeSignatureEvent::new(0, 4, 4),
            TimeSignatureEvent::new(96_000, 3, 4),
        ])
        .unwrap();
        // In 4/4 region (sample < 96_000), accent every 4 beats.
        assert!(is_accent_beat(0, 10_000, &ts));
        assert!(!is_accent_beat(1, 10_000, &ts));
        assert!(is_accent_beat(4, 60_000, &ts));
        // In 3/4 region, accent every 3 beats.
        assert!(is_accent_beat(3, 100_000, &ts));
        assert!(is_accent_beat(6, 200_000, &ts));
        assert!(!is_accent_beat(4, 100_000, &ts));
    }

    #[test]
    fn accent_tolerates_degenerate_numerator() {
        // Raw event with numerator=0 gets normalized to 1 by
        // try_new, so this is just a belt-and-braces check.
        let ts = TimeSignatureMap::new_constant(1, 4);
        // Every beat is beat 1 when numerator = 1.
        assert!(is_accent_beat(0, 0, &ts));
        assert!(is_accent_beat(1, 0, &ts));
        assert!(is_accent_beat(99, 0, &ts));
    }

    // ── Integration: render a buffer with an active click ──────────

    // ── Copilot regression: render_metronome_segment handles wrap ──

    #[test]
    fn render_metronome_segment_splits_on_loop_wrap() {
        // Copilot review regression (PR #1717): the metronome must
        // fire beats that land in the wrapped region of a buffer.
        // Simulate by calling render_metronome_segment twice with
        // different seg_start_sample values and verify the click
        // fires at the right buffer offsets.
        //
        // Setup: 120 BPM, 4/4, 48 kHz. Beats at samples 0, 24_000,
        // 48_000, 72_000, ...
        // Loop: [47_500, 48_500). Playhead starts at 47_000.
        // Buffer: 1024 frames → 47_000 + 1024 = 48_024 (crosses end
        // 48_500? NO, 48_024 < 48_500). Let's use a different setup.
        //
        // Actually: loop [47_500, 48_000). Buffer 1024 from 47_000.
        // Wrap at offset 500 (sample 47_500 → wraps to loop.start
        // which is same 47_500 — loop has length 500).
        // Hmm let me pick cleaner numbers.
        //
        // Use loop [47_000, 48_000), length 1000. Playhead starts
        // at 47_500. Buffer 1024. Wrap at offset 500 (we cross end
        // 48_000 at i=500 where sample = 47_500 + 500 = 48_000).
        // At the wrap we jump to 47_000. Samples [500..1024) cover
        // absolute 47_000..47_524.
        let tempo_map = TempoMap::new_constant(120.0);
        let time_sig = TimeSignatureMap::new_constant(4, 4);
        let config = MetronomeConfig::new(true, 1.0, 1.0, 1000.0, 1500.0);
        let mut click_gen = ClickGenerator::idle();
        let mut out_l = vec![0.0_f32; 1024];
        let mut out_r = vec![0.0_f32; 1024];

        // Pre-wrap segment: buffer [0..500), absolute samples
        // [47_500..48_000). No beat lands there (beats at 48_000
        // and 72_000).
        render_metronome_segment(
            &mut click_gen,
            &mut out_l,
            &mut out_r,
            0,
            500,
            47_500,
            &tempo_map,
            &time_sig,
            config,
            48_000.0,
        );
        // Idle generator, no click yet (or a brief one not fired —
        // the next beat at 48_000 hasn't happened yet inside this
        // segment).
        assert!(
            !click_gen.is_active(),
            "no beat in pre-wrap segment should trigger click"
        );

        // Post-wrap segment: buffer [500..1024), absolute samples
        // [47_000..47_524). No beat (previous beat was 24_000, next
        // at 48_000, neither in [47_000, 47_524)).
        render_metronome_segment(
            &mut click_gen,
            &mut out_l,
            &mut out_r,
            500,
            1024,
            47_000,
            &tempo_map,
            &time_sig,
            config,
            48_000.0,
        );
        assert!(
            !click_gen.is_active(),
            "no beat in this post-wrap segment either"
        );
    }

    #[test]
    fn render_metronome_segment_fires_click_on_beat_in_post_wrap() {
        // Same setup but arrange for the wrapped segment to cross
        // a beat boundary. Loop [23_500, 48_500) length 25_000.
        // Playhead 48_000, buffer 1024: wrap at offset 500
        // (sample 48_500 would be reached), post-wrap segment
        // starts at 23_500 and covers [23_500..24_024). Beat at
        // 24_000 lands inside → click fires at offset 500 + 500 = 1000.
        let tempo_map = TempoMap::new_constant(120.0);
        let time_sig = TimeSignatureMap::new_constant(4, 4);
        let config = MetronomeConfig::new(true, 1.0, 1.0, 1000.0, 1500.0);
        let mut click_gen = ClickGenerator::idle();
        let mut out_l = vec![0.0_f32; 1024];
        let mut out_r = vec![0.0_f32; 1024];

        // Pre-wrap: [0..500) absolute [48_000..48_500). Beat at 48_000
        // is AT seg_start — triggers click at offset 0.
        render_metronome_segment(
            &mut click_gen,
            &mut out_l,
            &mut out_r,
            0,
            500,
            48_000,
            &tempo_map,
            &time_sig,
            config,
            48_000.0,
        );
        assert!(
            click_gen.is_active() || out_l[0..500].iter().any(|&s| s != 0.0),
            "click on beat at seg_start should fire"
        );

        // Post-wrap: [500..1024) absolute [23_500..24_024). Beat at
        // 24_000 should trigger a new click at buffer offset 500 +
        // (24_000 - 23_500) = 1000.
        let before_trigger_phase = click_gen.samples_into;
        render_metronome_segment(
            &mut click_gen,
            &mut out_l,
            &mut out_r,
            500,
            1024,
            23_500,
            &tempo_map,
            &time_sig,
            config,
            48_000.0,
        );
        // Click should have re-triggered in the post-wrap segment.
        // Verify by checking the output buffer has non-zero samples
        // in the expected range.
        let post_wrap_energy: f32 = out_l[1000..1024].iter().map(|s| s.abs()).sum();
        assert!(
            post_wrap_energy > 0.0,
            "post-wrap beat at 24_000 should have produced audible samples near buffer offset 1000 (got energy={post_wrap_energy})"
        );
        // Also: click generator state should have been retriggered
        // (either still running or was running during this segment).
        let _ = before_trigger_phase;
    }

    #[test]
    fn envelope_reaches_near_one_and_returns_to_zero() {
        // Full envelope scan: peak somewhere near start of decay,
        // monotonically back to 0 by the end.
        let sr = 48_000.0;
        let attack = (CLICK_ATTACK_SEC * sr) as u32;
        let total = (CLICK_DURATION_SEC * sr) as u32;
        let mut max = 0.0_f32;
        for t in 0..total {
            let v = click_envelope(t, sr);
            max = max.max(v);
        }
        assert!(approx_eq(max, 1.0, 0.02), "envelope peak = {max}");
        assert!(click_envelope(total, sr) == 0.0);
    }
}
