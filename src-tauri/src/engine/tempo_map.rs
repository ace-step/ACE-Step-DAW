//! Tempo map — sorted list of `(sample_position, bpm)` events,
//! with piecewise-constant integration between events.
//!
//! # Why piecewise constant?
//!
//! Logic Pro and Pro Tools both use piecewise-constant tempo maps:
//! BPM is whatever the most-recent event says, until the next event
//! overrides it. This is the least-surprising model for users who
//! think in "tempo = 120 from bar 1, tempo = 140 from bar 17".
//!
//! Ableton adds curve interpolation (ramp between events). We can
//! layer that on later as `TempoSegment::Linear { .. }` without
//! breaking the constant-tempo API, so the simpler primitive ships
//! first.
//!
//! # Beat / sample conversion
//!
//! Within a single constant-BPM segment:
//! - 1 minute = `sample_rate × 60` samples
//! - 1 minute = `bpm` beats
//! - 1 beat  = `sample_rate × 60 / bpm` samples
//!
//! So `beat_to_sample` walks the map and accumulates sample offsets
//! segment by segment, and `sample_to_beat` does the inverse walk
//! and returns a fractional beat count.
//!
//! # Thread safety
//!
//! `TempoMap` is a plain owned type — `Send + Sync` for free. The
//! audio/main thread hand-off is done by wrapping the map in an
//! `ArcSwap<TempoMap>` at the call site (see `transport.rs`), so
//! this module only needs to provide the pure math.

use serde::{Deserialize, Serialize};

use super::transport::{DEFAULT_BPM, MAX_BPM, MIN_BPM};

/// A single tempo change event. `at_sample` is the absolute sample
/// position at which the new BPM takes effect.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TempoEvent {
    pub at_sample: u64,
    pub bpm: f32,
}

impl TempoEvent {
    /// Clamp BPM to the transport-wide safe range before constructing,
    /// matching [`super::transport::Transport::set_tempo`] semantics
    /// so there is one and only one place that defines "valid BPM".
    pub fn new(at_sample: u64, bpm: f32) -> Self {
        let safe = if bpm.is_finite() {
            bpm.clamp(MIN_BPM, MAX_BPM)
        } else {
            DEFAULT_BPM
        };
        Self { at_sample: at_sample, bpm: safe }
    }
}

/// Errors from constructing a [`TempoMap`] with invalid input.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TempoMapError {
    /// The event list was empty. Every map needs at least an anchor
    /// at sample 0 so `bpm_at` / `beat_to_sample` are total.
    Empty,
    /// Events must be sorted by `at_sample` (strictly increasing).
    /// Duplicates are rejected because they make the map ambiguous —
    /// which BPM applies "at" the duplicated sample position?
    NotSortedOrDuplicate,
    /// The first event is not at sample 0. Without an anchor the
    /// map cannot answer `bpm_at(0)`.
    MissingAnchor,
    /// The event count exceeds [`MAX_TEMPO_EVENTS`]. Bounding the
    /// map size keeps the audio-thread lookup (`bpm_at`) worst-case
    /// scan bounded.
    TooManyEvents(usize),
}

/// Upper bound on the number of events in a single tempo map. Caps
/// the worst-case scan cost of [`TempoMap::bpm_at`] /
/// [`TempoMap::sample_to_beat`] / [`TempoMap::beat_to_sample`]. 1024
/// entries is two tempo events per bar for a 512-bar piece — more
/// than any realistic song needs, and well within what an audio
/// thread can afford to scan on a hot path.
pub const MAX_TEMPO_EVENTS: usize = 1024;

/// A tempo map: sorted list of `(sample_position, bpm)` events, with
/// piecewise-constant integration between events.
///
/// Invariants (enforced by the constructors):
/// 1. Non-empty — always at least one event.
/// 2. Events sorted strictly by `at_sample`.
/// 3. `events[0].at_sample == 0` — the map is anchored at the origin.
///
/// The zero-arg path through [`TempoMap::default`] / [`TempoMap::new_constant`]
/// is the cheap, allocation-light way to get a valid single-tempo map
/// for Phase 3A compatibility.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TempoMap {
    events: Vec<TempoEvent>,
}

impl TempoMap {
    /// A constant-BPM map with a single anchor event at sample 0.
    pub fn new_constant(bpm: f32) -> Self {
        Self {
            events: vec![TempoEvent::new(0, bpm)],
        }
    }

    /// Validated constructor. Returns an error if the invariants
    /// above are violated. Used by the Tauri command handler to
    /// surface "bad tempo map" to the UI instead of letting a
    /// malformed map reach the audio thread.
    ///
    /// **BPM normalization**: every incoming event is re-run through
    /// [`TempoEvent::new`], so a deserialized payload with
    /// `bpm = 0.0` / NaN / ±∞ / out-of-range values is silently
    /// clamped instead of poisoning the map. This matters because
    /// the serde boundary otherwise bypasses the `TempoEvent::new`
    /// constructor: a raw JSON `{"atSample": 0, "bpm": 0}` would
    /// deserialize straight through, and `beat_to_sample` would
    /// then divide by zero and overflow the `f64 -> u64` cast
    /// (found by codex review on PR #1711).
    pub fn try_new(events: Vec<TempoEvent>) -> Result<Self, TempoMapError> {
        if events.is_empty() {
            return Err(TempoMapError::Empty);
        }
        if events.len() > MAX_TEMPO_EVENTS {
            return Err(TempoMapError::TooManyEvents(events.len()));
        }
        if events[0].at_sample != 0 {
            return Err(TempoMapError::MissingAnchor);
        }
        // Strictly increasing: previous.at_sample < current.at_sample.
        for pair in events.windows(2) {
            if pair[0].at_sample >= pair[1].at_sample {
                return Err(TempoMapError::NotSortedOrDuplicate);
            }
        }
        // Normalize BPM on every event to close the serde-bypass
        // hole described in the docstring.
        let normalized = events
            .into_iter()
            .map(|e| TempoEvent::new(e.at_sample, e.bpm))
            .collect();
        Ok(Self { events: normalized })
    }

    /// Borrow the raw events. Intended for read-only inspection on
    /// the UI side; the audio thread does not call this.
    pub fn events(&self) -> &[TempoEvent] {
        &self.events
    }

    /// BPM in effect at `sample`. Returns the BPM of the most-recent
    /// event at or before `sample`; constant-time-ish for small maps
    /// via a linear scan from the end (most recent first), which is
    /// the common access pattern during playback.
    pub fn bpm_at(&self, sample: u64) -> f32 {
        // Invariant 3 guarantees events[0].at_sample == 0 so this
        // never falls off the front.
        for ev in self.events.iter().rev() {
            if ev.at_sample <= sample {
                return ev.bpm;
            }
        }
        // Unreachable given the anchor invariant, but be defensive.
        self.events[0].bpm
    }

    /// Convert a sample position to a fractional beat count from
    /// sample 0. Walks the map segment by segment and accumulates
    /// beats using `beats = samples × bpm / (60 × sample_rate)`.
    ///
    /// `sample_rate` is passed explicitly (not stored on the map)
    /// because the same map is valid across sample-rate changes —
    /// the UI speaks in samples but the conversion depends on the
    /// current engine SR.
    pub fn sample_to_beat(&self, sample: u64, sample_rate: u32) -> f64 {
        if sample_rate == 0 {
            // Degenerate input; produce 0 rather than NaN.
            return 0.0;
        }
        if sample == 0 {
            return 0.0;
        }
        let sr = sample_rate as f64;
        let mut beats: f64 = 0.0;
        for i in 0..self.events.len() {
            let seg_start = self.events[i].at_sample;
            if seg_start >= sample {
                break;
            }
            let seg_end = self
                .events
                .get(i + 1)
                .map(|e| e.at_sample.min(sample))
                .unwrap_or(sample);
            let seg_samples = seg_end - seg_start;
            let bpm = self.events[i].bpm as f64;
            // beats = seconds × bpm/60 = (seg_samples / sr) × bpm / 60
            beats += seg_samples as f64 * bpm / (60.0 * sr);
            if seg_end == sample {
                break;
            }
        }
        beats
    }

    /// Convert a fractional beat count to a sample position. Walks
    /// the map segment by segment, subtracting the beat-cost of
    /// each full segment, then converting the remainder in the
    /// last segment.
    ///
    /// Returns an `u64` (truncating the fractional sample). At 48 kHz
    /// this loses at most ~20 μs, which is below the audibility
    /// threshold for timing errors and below the buffer-size
    /// quantization that Phase 3A already imposes.
    pub fn beat_to_sample(&self, beat: f64, sample_rate: u32) -> u64 {
        if sample_rate == 0 || beat <= 0.0 || !beat.is_finite() {
            return 0;
        }
        let sr = sample_rate as f64;
        let mut remaining_beats = beat;
        for i in 0..self.events.len() {
            // Defense in depth: clamp BPM to the valid range even if
            // the map somehow got past `try_new` with an invalid
            // value. Without this, bpm == 0 would produce
            // samples_per_beat = +∞, and `(remaining_beats * +∞) as u64`
            // is `u64::MAX` — which then overflows when added to
            // `seg_start`. Found by codex review on PR #1711.
            let raw = self.events[i].bpm as f64;
            let bpm = if raw.is_finite() && raw > 0.0 {
                raw.clamp(MIN_BPM as f64, MAX_BPM as f64)
            } else {
                DEFAULT_BPM as f64
            };
            let samples_per_beat = 60.0 * sr / bpm;

            let seg_start = self.events[i].at_sample;
            let next = self.events.get(i + 1).map(|e| e.at_sample);

            match next {
                Some(seg_end) => {
                    let seg_samples = (seg_end - seg_start) as f64;
                    let seg_beats = seg_samples / samples_per_beat;
                    if remaining_beats <= seg_beats {
                        // Remainder lands inside this segment.
                        // Use saturating_add so that a pathologically
                        // large `beat` input (e.g. the caller asks for
                        // beat 1e18) can't wrap the u64 — found by
                        // Copilot review on PR #1711.
                        let offset = clamp_f64_to_u64(remaining_beats * samples_per_beat);
                        return seg_start.saturating_add(offset);
                    }
                    remaining_beats -= seg_beats;
                }
                None => {
                    // Last (open-ended) segment extends to +∞.
                    let offset = clamp_f64_to_u64(remaining_beats * samples_per_beat);
                    return seg_start.saturating_add(offset);
                }
            }
        }
        // Unreachable given the anchor invariant.
        0
    }
}

/// Clamp a possibly-pathological `f64` to a valid `u64` sample
/// offset. Rules:
/// - NaN → 0 (garbage input should not silently become huge).
/// - Negative / zero → 0.
/// - +∞ or ≥ `u64::MAX - 1` → `u64::MAX - 1` (saturate one below
///   the max so a subsequent `saturating_add` on a non-zero anchor
///   stays below `u64::MAX` — useful for downstream code that uses
///   `u64::MAX` as a sentinel).
/// - Anything else → `x as u64` (Rust saturates float-to-int casts
///   since 1.45, so this is also safe on its own; we keep the
///   explicit guard for readability and `- 1` headroom).
#[inline]
fn clamp_f64_to_u64(x: f64) -> u64 {
    if x.is_nan() || x <= 0.0 {
        0
    } else if x >= (u64::MAX - 1) as f64 {
        u64::MAX - 1
    } else {
        x as u64
    }
}

impl Default for TempoMap {
    /// Default: a constant 120 BPM map — matches
    /// [`super::transport::DEFAULT_BPM`].
    fn default() -> Self {
        Self::new_constant(DEFAULT_BPM)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn approx_eq(a: f64, b: f64, eps: f64) -> bool {
        (a - b).abs() < eps
    }

    #[test]
    fn default_is_constant_default_bpm() {
        let m = TempoMap::default();
        assert_eq!(m.events().len(), 1);
        assert_eq!(m.events()[0].at_sample, 0);
        assert_eq!(m.events()[0].bpm, DEFAULT_BPM);
    }

    #[test]
    fn new_constant_holds_one_event_at_origin() {
        let m = TempoMap::new_constant(140.0);
        assert_eq!(m.events(), &[TempoEvent::new(0, 140.0)]);
    }

    #[test]
    fn new_constant_clamps_bpm_into_range() {
        let too_low = TempoMap::new_constant(5.0);
        let too_high = TempoMap::new_constant(10_000.0);
        assert_eq!(too_low.events()[0].bpm, MIN_BPM);
        assert_eq!(too_high.events()[0].bpm, MAX_BPM);
    }

    #[test]
    fn new_constant_snaps_non_finite_to_default() {
        let nan_map = TempoMap::new_constant(f32::NAN);
        assert_eq!(nan_map.events()[0].bpm, DEFAULT_BPM);
    }

    #[test]
    fn try_new_rejects_empty() {
        assert_eq!(TempoMap::try_new(vec![]), Err(TempoMapError::Empty));
    }

    #[test]
    fn try_new_rejects_missing_anchor() {
        let events = vec![TempoEvent::new(1000, 120.0), TempoEvent::new(2000, 140.0)];
        assert_eq!(
            TempoMap::try_new(events),
            Err(TempoMapError::MissingAnchor)
        );
    }

    #[test]
    fn try_new_rejects_duplicate_positions() {
        let events = vec![
            TempoEvent::new(0, 120.0),
            TempoEvent::new(48_000, 130.0),
            TempoEvent::new(48_000, 140.0),
        ];
        assert_eq!(
            TempoMap::try_new(events),
            Err(TempoMapError::NotSortedOrDuplicate)
        );
    }

    #[test]
    fn try_new_rejects_out_of_order() {
        let events = vec![
            TempoEvent::new(0, 120.0),
            TempoEvent::new(96_000, 140.0),
            TempoEvent::new(48_000, 100.0),
        ];
        assert_eq!(
            TempoMap::try_new(events),
            Err(TempoMapError::NotSortedOrDuplicate)
        );
    }

    #[test]
    fn try_new_accepts_valid_map() {
        let events = vec![
            TempoEvent::new(0, 120.0),
            TempoEvent::new(48_000, 140.0),
            TempoEvent::new(192_000, 100.0),
        ];
        let map = TempoMap::try_new(events.clone()).unwrap();
        assert_eq!(map.events(), &events[..]);
    }

    #[test]
    fn bpm_at_returns_current_segment_bpm() {
        let map = TempoMap::try_new(vec![
            TempoEvent::new(0, 120.0),
            TempoEvent::new(48_000, 140.0),
            TempoEvent::new(96_000, 100.0),
        ])
        .unwrap();
        assert_eq!(map.bpm_at(0), 120.0);
        assert_eq!(map.bpm_at(47_999), 120.0);
        assert_eq!(map.bpm_at(48_000), 140.0, "event boundary is inclusive");
        assert_eq!(map.bpm_at(48_001), 140.0);
        assert_eq!(map.bpm_at(96_000), 100.0);
        assert_eq!(map.bpm_at(u64::MAX), 100.0, "past-the-end returns last segment");
    }

    // ── Constant-tempo sanity ────────────────────────────────────────

    #[test]
    fn constant_tempo_sample_to_beat_120_bpm_one_minute() {
        let map = TempoMap::new_constant(120.0);
        // 1 minute at 48 kHz = 2_880_000 samples
        // At 120 BPM, 1 minute = 120 beats.
        let beats = map.sample_to_beat(2_880_000, 48_000);
        assert!(
            approx_eq(beats, 120.0, 1e-6),
            "expected 120 beats, got {beats}"
        );
    }

    #[test]
    fn constant_tempo_beat_to_sample_roundtrip() {
        let map = TempoMap::new_constant(120.0);
        let sr = 48_000;
        for beats in [0.0, 1.0, 4.0, 16.0, 100.5] {
            let s = map.beat_to_sample(beats, sr);
            let b = map.sample_to_beat(s, sr);
            // beat_to_sample truncates to u64, so the round-trip may
            // lose up to 1 sample worth of beat (≈ 4e-5 beats at
            // 120 BPM / 48 kHz).
            assert!(
                approx_eq(b, beats, 1e-4),
                "round trip {beats} → {s} → {b}",
            );
        }
    }

    // ── Multi-tempo integration ──────────────────────────────────────

    #[test]
    fn multi_tempo_sample_to_beat_accumulates_per_segment() {
        // Segment A: 0..48_000 samples (1 second) at 60 BPM → 1 beat.
        // Segment B: 48_000..96_000 samples (1 second) at 120 BPM → 2 beats.
        // Total at 96_000 samples = 3 beats.
        let map = TempoMap::try_new(vec![
            TempoEvent::new(0, 60.0),
            TempoEvent::new(48_000, 120.0),
        ])
        .unwrap();
        assert!(
            approx_eq(map.sample_to_beat(48_000, 48_000), 1.0, 1e-9),
            "1 s at 60 BPM = 1 beat"
        );
        assert!(
            approx_eq(map.sample_to_beat(96_000, 48_000), 3.0, 1e-9),
            "1 s at 60 + 1 s at 120 = 3 beats"
        );
        // Mid-segment-B: 72_000 samples = 1 s + 0.5 s at 120 BPM
        // = 1 + 1 = 2 beats.
        assert!(
            approx_eq(map.sample_to_beat(72_000, 48_000), 2.0, 1e-9),
            "mid-B = 2 beats"
        );
    }

    #[test]
    fn multi_tempo_beat_to_sample_inverts_sample_to_beat() {
        let map = TempoMap::try_new(vec![
            TempoEvent::new(0, 60.0),
            TempoEvent::new(48_000, 120.0),
            TempoEvent::new(144_000, 90.0),
        ])
        .unwrap();
        let sr = 48_000;
        for beats in [0.0, 0.5, 1.0, 2.0, 3.0, 5.25, 10.0, 100.0] {
            let s = map.beat_to_sample(beats, sr);
            let b = map.sample_to_beat(s, sr);
            assert!(
                approx_eq(b, beats, 1e-4),
                "round trip {beats} beats → {s} samples → {b} beats",
            );
        }
    }

    #[test]
    fn beat_to_sample_lands_on_boundary_events() {
        // With a tempo change at sample 48_000 after 1 beat of 60 BPM,
        // beat_to_sample(1.0) should return exactly 48_000.
        let map = TempoMap::try_new(vec![
            TempoEvent::new(0, 60.0),
            TempoEvent::new(48_000, 120.0),
        ])
        .unwrap();
        // 60 BPM → 48_000 samples per beat at 48 kHz.
        let s = map.beat_to_sample(1.0, 48_000);
        assert_eq!(s, 48_000, "boundary beat should land exactly");
    }

    // ── Degenerate / edge-case inputs ────────────────────────────────

    #[test]
    fn sample_to_beat_zero_sample_is_zero() {
        let map = TempoMap::new_constant(140.0);
        assert_eq!(map.sample_to_beat(0, 48_000), 0.0);
    }

    #[test]
    fn beat_to_sample_zero_beat_is_zero() {
        let map = TempoMap::new_constant(140.0);
        assert_eq!(map.beat_to_sample(0.0, 48_000), 0);
    }

    #[test]
    fn beat_to_sample_negative_beat_clamps_to_zero() {
        let map = TempoMap::new_constant(140.0);
        assert_eq!(map.beat_to_sample(-5.0, 48_000), 0);
    }

    #[test]
    fn beat_to_sample_non_finite_beat_returns_zero() {
        let map = TempoMap::new_constant(140.0);
        assert_eq!(map.beat_to_sample(f64::NAN, 48_000), 0);
        assert_eq!(map.beat_to_sample(f64::INFINITY, 48_000), 0);
    }

    #[test]
    fn conversions_with_zero_sample_rate_are_safe() {
        // Pathological input shouldn't panic or NaN.
        let map = TempoMap::new_constant(120.0);
        assert_eq!(map.sample_to_beat(48_000, 0), 0.0);
        assert_eq!(map.beat_to_sample(4.0, 0), 0);
    }

    // ── Serde wire format ────────────────────────────────────────────

    #[test]
    fn tempo_event_serializes_as_camel_case() {
        let ev = TempoEvent::new(48_000, 140.0);
        let json = serde_json::to_string(&ev).unwrap();
        assert!(
            json.contains("\"atSample\":48000"),
            "wire format should be camelCase; got {json}"
        );
        assert!(json.contains("\"bpm\":140"));
        // Round-trip.
        let back: TempoEvent = serde_json::from_str(&json).unwrap();
        assert_eq!(back, ev);
    }

    // ── Codex P1 regression: serde-bypass BPM injection ──────────────

    #[test]
    fn try_new_normalizes_zero_bpm_via_tempo_event_new() {
        // Regression for codex finding on PR #1711: a crafted JSON
        // payload with bpm=0 would previously slip past try_new's
        // validation and poison beat_to_sample (div by zero →
        // `inf as u64` → overflow).
        //
        // We simulate the serde-bypass path by hand-constructing
        // TempoEvent values with fields set directly (bypassing
        // TempoEvent::new's clamp).
        let raw = vec![
            TempoEvent { at_sample: 0, bpm: 0.0 },
            TempoEvent { at_sample: 48_000, bpm: f32::NAN },
            TempoEvent { at_sample: 96_000, bpm: f32::INFINITY },
        ];
        let map = TempoMap::try_new(raw).expect("try_new must accept and normalize");
        assert_eq!(map.events()[0].bpm, MIN_BPM, "0 bpm snapped to MIN_BPM");
        assert_eq!(map.events()[1].bpm, DEFAULT_BPM, "NaN snapped to default");
        assert_eq!(map.events()[2].bpm, DEFAULT_BPM, "inf snapped to default");

        // And the conversion math no longer overflows.
        let s = map.beat_to_sample(100.0, 48_000);
        assert!(s > 0, "should return a real sample, not 0 or overflow");
        assert!(s < u64::MAX / 2, "should not be overflow sentinel");
    }

    #[test]
    fn beat_to_sample_defense_in_depth_clamps_stored_bad_bpm() {
        // Even if an event somehow got past try_new with bad BPM,
        // beat_to_sample itself must clamp to the valid range so
        // divide-by-zero / overflow cannot escape.
        //
        // We have to build the map bypassing try_new entirely to
        // hit this path, so do so via direct struct construction.
        let map = TempoMap {
            events: vec![TempoEvent { at_sample: 0, bpm: 0.0 }],
        };
        let s = map.beat_to_sample(4.0, 48_000);
        assert!(
            s > 0 && s < u64::MAX / 2,
            "beat_to_sample should clamp bad BPM and return a sane value, got {s}"
        );
    }

    #[test]
    fn try_new_rejects_too_many_events() {
        let too_many: Vec<TempoEvent> = (0..MAX_TEMPO_EVENTS + 1)
            .map(|i| TempoEvent::new((i as u64) * 48_000, 120.0))
            .collect();
        match TempoMap::try_new(too_many) {
            Err(TempoMapError::TooManyEvents(n)) => {
                assert_eq!(n, MAX_TEMPO_EVENTS + 1);
            }
            other => panic!("expected TooManyEvents, got {other:?}"),
        }
    }

    #[test]
    fn beat_to_sample_saturates_on_pathological_input() {
        // Copilot review regression (PR #1711): before the fix, an
        // astronomically large beat value would compute a float
        // offset that casts to `u64::MAX`, then adds to `seg_start`
        // and wraps. With `clamp_f64_to_u64` + `saturating_add`,
        // the conversion returns `u64::MAX - 1` instead of wrapping.
        let map = TempoMap::new_constant(120.0);
        // 10^18 beats at 120 BPM → ~5e17 s → ~2.4e22 samples —
        // well beyond u64::MAX (1.8e19).
        let s = map.beat_to_sample(1e18, 48_000);
        assert!(s < u64::MAX, "result must not be u64::MAX sentinel");
        assert!(s > 0, "clamped result should still be positive");
    }

    #[test]
    fn clamp_f64_to_u64_handles_edges() {
        assert_eq!(clamp_f64_to_u64(0.0), 0);
        assert_eq!(clamp_f64_to_u64(-5.0), 0);
        assert_eq!(clamp_f64_to_u64(f64::NAN), 0);
        assert_eq!(clamp_f64_to_u64(f64::INFINITY), u64::MAX - 1);
        assert_eq!(clamp_f64_to_u64(1e25), u64::MAX - 1);
        assert_eq!(clamp_f64_to_u64(100.7), 100);
    }

    #[test]
    fn try_new_accepts_max_events_exactly() {
        let max: Vec<TempoEvent> = (0..MAX_TEMPO_EVENTS)
            .map(|i| TempoEvent::new((i as u64) * 48_000, 120.0))
            .collect();
        assert!(TempoMap::try_new(max).is_ok());
    }

    #[test]
    fn tempo_map_serde_round_trip_preserves_events() {
        let map = TempoMap::try_new(vec![
            TempoEvent::new(0, 120.0),
            TempoEvent::new(48_000, 140.0),
        ])
        .unwrap();
        let json = serde_json::to_string(&map).unwrap();
        let back: TempoMap = serde_json::from_str(&json).unwrap();
        assert_eq!(back, map);
    }
}
