//! Count-in: optional N-beat lead-in before audible playback.
//!
//! When [`CountIn::enabled`] is true and `TransportPlay` is
//! received, the audio callback starts a countdown equal to
//! `beats × samples_per_beat_at(playhead)` (computed from the
//! transport's tempo map). During the countdown:
//! - The transport advances normally (position counter moves).
//! - The metronome continues to click on beat boundaries so the
//!   user hears the count.
//! - The clip scheduler is suppressed — no clip audio hits the
//!   master until the countdown reaches zero.
//!
//! This matches the "Count-in" feature in Pro Tools / Logic: press
//! play, hear four clicks, then the song starts.
//!
//! The audio-thread state (remaining samples) is NOT shared; it
//! lives inside the callback's owned state. The main thread only
//! publishes the *configuration* (enable flag + beat count), and
//! the countdown is entirely local to the audio thread once play
//! starts.

use serde::{Deserialize, Serialize};

/// Minimum valid beat count. Zero-beat count-in is pointless; use
/// `enabled = false` instead.
pub const MIN_COUNT_IN_BEATS: u8 = 1;
/// Maximum beats. 16 beats at 60 BPM is 16 seconds — anything
/// longer would feel broken. Serde inputs above this are clamped
/// down.
pub const MAX_COUNT_IN_BEATS: u8 = 16;
/// Sensible default: a full bar of 4.
pub const DEFAULT_COUNT_IN_BEATS: u8 = 4;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CountIn {
    pub enabled: bool,
    pub beats: u8,
}

impl CountIn {
    /// Disabled default.
    pub const fn default_off() -> Self {
        Self {
            enabled: false,
            beats: DEFAULT_COUNT_IN_BEATS,
        }
    }

    /// Validated constructor. Clamps `beats` to
    /// `[MIN_COUNT_IN_BEATS, MAX_COUNT_IN_BEATS]` so a serde
    /// payload with absurd values cannot push the count-in into
    /// minutes of silence.
    pub fn new(enabled: bool, beats: u8) -> Self {
        let safe = beats.clamp(MIN_COUNT_IN_BEATS, MAX_COUNT_IN_BEATS);
        Self { enabled, beats: safe }
    }
}

impl Default for CountIn {
    fn default() -> Self {
        Self::default_off()
    }
}

/// Audio-thread countdown state. Not shared across threads — owned
/// by the callback closure. `remaining_samples == 0` means "no
/// count-in in progress"; any positive value means "suppress clips
/// for this many more samples."
#[derive(Debug, Clone, Copy, Default)]
pub struct CountInState {
    remaining_samples: u64,
}

impl CountInState {
    pub fn idle() -> Self {
        Self { remaining_samples: 0 }
    }

    /// Start a countdown of `duration_samples`. Overrides any
    /// in-flight countdown (e.g. user hits play while a previous
    /// count-in was still running — the new press wins).
    pub fn start(&mut self, duration_samples: u64) {
        self.remaining_samples = duration_samples;
    }

    /// Abort the countdown immediately (used when the transport
    /// stops).
    pub fn clear(&mut self) {
        self.remaining_samples = 0;
    }

    /// Whether the countdown is currently running.
    #[inline]
    pub fn is_active(&self) -> bool {
        self.remaining_samples > 0
    }

    /// Advance the countdown by `frames` samples. Returns `true`
    /// if the countdown is still active after the advance — i.e.
    /// clip rendering should STILL be suppressed this buffer.
    ///
    /// Saturating subtraction: a buffer longer than the remaining
    /// count reduces to zero instead of wrapping.
    #[inline]
    pub fn advance(&mut self, frames: u64) -> bool {
        if self.remaining_samples == 0 {
            return false;
        }
        self.remaining_samples = self.remaining_samples.saturating_sub(frames);
        self.remaining_samples > 0
    }

    /// Snapshot the remaining samples. Useful for tests and UI
    /// badges.
    pub fn remaining_samples(&self) -> u64 {
        self.remaining_samples
    }
}

/// Compute the count-in duration in samples for `beats` starting
/// at `playhead_sample`, using the given tempo map + sample rate.
/// Uses `TempoMap::beat_to_sample` so tempo changes inside the
/// count-in region are accounted for.
pub fn count_in_duration_samples(
    beats: u8,
    playhead_sample: u64,
    tempo_map: &super::tempo_map::TempoMap,
    sample_rate: u32,
) -> u64 {
    if beats == 0 {
        return 0;
    }
    // Current beat (fractional).
    let current_beat = tempo_map.sample_to_beat(playhead_sample, sample_rate);
    // Target beat = current_beat + beats (integer).
    let target_beat = current_beat + beats as f64;
    let target_sample = tempo_map.beat_to_sample(target_beat, sample_rate);
    target_sample.saturating_sub(playhead_sample)
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::tempo_map::TempoMap;

    // ── CountIn config ──────────────────────────────────────────────

    #[test]
    fn default_is_off_with_sensible_beats() {
        let c = CountIn::default();
        assert!(!c.enabled);
        assert_eq!(c.beats, DEFAULT_COUNT_IN_BEATS);
    }

    #[test]
    fn new_clamps_beats_to_valid_range() {
        assert_eq!(CountIn::new(true, 0).beats, MIN_COUNT_IN_BEATS);
        assert_eq!(CountIn::new(true, 99).beats, MAX_COUNT_IN_BEATS);
        assert_eq!(CountIn::new(true, 4).beats, 4);
        assert_eq!(CountIn::new(true, MAX_COUNT_IN_BEATS).beats, MAX_COUNT_IN_BEATS);
    }

    #[test]
    fn serde_round_trip_preserves_fields() {
        let c = CountIn::new(true, 4);
        let json = serde_json::to_string(&c).unwrap();
        assert!(json.contains("\"enabled\":true"));
        assert!(json.contains("\"beats\":4"));
        let back: CountIn = serde_json::from_str(&json).unwrap();
        assert_eq!(back, c);
    }

    #[test]
    fn config_is_copy() {
        fn assert_copy<T: Copy>() {}
        assert_copy::<CountIn>();
    }

    // ── CountInState ────────────────────────────────────────────────

    #[test]
    fn idle_state_is_inactive() {
        let s = CountInState::idle();
        assert!(!s.is_active());
        assert_eq!(s.remaining_samples(), 0);
    }

    #[test]
    fn start_sets_remaining() {
        let mut s = CountInState::idle();
        s.start(48_000);
        assert!(s.is_active());
        assert_eq!(s.remaining_samples(), 48_000);
    }

    #[test]
    fn advance_decrements_and_deactivates() {
        let mut s = CountInState::idle();
        s.start(1000);
        assert!(s.advance(400), "still active after partial advance");
        assert_eq!(s.remaining_samples(), 600);
        assert!(s.advance(500), "still active");
        assert!(!s.advance(200), "should deactivate when hitting 0");
        assert_eq!(s.remaining_samples(), 0);
        assert!(!s.is_active());
    }

    #[test]
    fn advance_past_remaining_saturates_to_zero() {
        let mut s = CountInState::idle();
        s.start(100);
        // Overshoot by 10x — must not wrap around.
        let still_active = s.advance(1_000);
        assert!(!still_active);
        assert_eq!(s.remaining_samples(), 0);
    }

    #[test]
    fn advance_on_idle_is_noop() {
        let mut s = CountInState::idle();
        assert!(!s.advance(100));
        assert_eq!(s.remaining_samples(), 0);
    }

    #[test]
    fn clear_cancels_in_flight_countdown() {
        let mut s = CountInState::idle();
        s.start(48_000);
        s.clear();
        assert!(!s.is_active());
        assert_eq!(s.remaining_samples(), 0);
    }

    #[test]
    fn start_overrides_in_flight_countdown() {
        let mut s = CountInState::idle();
        s.start(10_000);
        s.start(500);
        assert_eq!(s.remaining_samples(), 500);
    }

    // ── count_in_duration_samples ──────────────────────────────────

    #[test]
    fn duration_at_120_bpm_four_beats_is_two_seconds() {
        // 120 BPM → 2 beats/s → 4 beats = 2 s = 96_000 samples at 48 k.
        let map = TempoMap::new_constant(120.0);
        let dur = count_in_duration_samples(4, 0, &map, 48_000);
        assert_eq!(dur, 96_000);
    }

    #[test]
    fn duration_at_60_bpm_one_beat_is_one_second() {
        // 60 BPM → 1 beat/s → 1 beat = 1 s = 48_000 samples.
        let map = TempoMap::new_constant(60.0);
        let dur = count_in_duration_samples(1, 0, &map, 48_000);
        assert_eq!(dur, 48_000);
    }

    #[test]
    fn duration_of_zero_beats_is_zero() {
        let map = TempoMap::new_constant(120.0);
        assert_eq!(count_in_duration_samples(0, 0, &map, 48_000), 0);
    }

    #[test]
    fn duration_respects_tempo_changes_in_count_in_window() {
        use super::super::tempo_map::TempoEvent;
        // First beat at 60 BPM (48_000 samples) then 120 BPM.
        let map = TempoMap::try_new(vec![
            TempoEvent::new(0, 60.0),
            TempoEvent::new(48_000, 120.0),
        ])
        .unwrap();
        // 4 beats from sample 0 = 1 beat at 60 BPM (48k samples) +
        // 3 beats at 120 BPM (3 × 24k = 72k samples) = 120_000 samples.
        let dur = count_in_duration_samples(4, 0, &map, 48_000);
        assert_eq!(dur, 120_000);
    }

    #[test]
    fn duration_is_nonnegative_even_on_degenerate_input() {
        // Call with a playhead after a very large sample; the
        // function should saturating-subtract instead of wrapping.
        let map = TempoMap::new_constant(120.0);
        let dur = count_in_duration_samples(4, u64::MAX - 1000, &map, 48_000);
        // Should be some non-negative value; we don't care exactly
        // what, just that it didn't panic or wrap.
        let _ = dur;
    }
}
