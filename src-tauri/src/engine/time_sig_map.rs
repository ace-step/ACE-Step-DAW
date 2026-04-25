//! Time signature map — sorted list of
//! `(sample_position, numerator, denominator)` events.
//!
//! # Scope
//!
//! Time signatures feed UI grid rendering (bar lines, beat snap,
//! measure counting) and 3E's metronome (which accents beat 1 of
//! each bar differently from the other beats). The audio engine
//! itself does not need the time signature to produce output — BPM
//! alone determines beat length — so this type is purely a
//! look-up.
//!
//! # Piecewise constant
//!
//! Same model as [`super::tempo_map::TempoMap`]: between two events
//! the signature is whatever the most-recent event said. A change
//! mid-bar is unusual in practice but perfectly legal; the map
//! takes no position on whether the bar count should "reset" at
//! the change (that is a UI concern).

use serde::{Deserialize, Serialize};

/// A time-signature change event. `at_sample` is the absolute sample
/// position at which the new signature takes effect.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeSignatureEvent {
    pub at_sample: u64,
    pub numerator: u8,
    pub denominator: u8,
}

impl TimeSignatureEvent {
    /// Construct with clamping. Invalid inputs snap to the sane
    /// default of `4/4` rather than surfacing an error — this makes
    /// the call site tolerant of UI bugs (a slider briefly at 0
    /// shouldn't poison the engine).
    ///
    /// - `numerator`: clamped to `1..=32`
    /// - `denominator`: must be a power of two in `1..=32`, otherwise
    ///   snapped to `4`
    pub fn new(at_sample: u64, numerator: u8, denominator: u8) -> Self {
        let num = numerator.clamp(MIN_NUMERATOR, MAX_NUMERATOR);
        let den = if is_valid_denominator(denominator) {
            denominator
        } else {
            DEFAULT_DENOMINATOR
        };
        Self {
            at_sample,
            numerator: num,
            denominator: den,
        }
    }
}

pub const MIN_NUMERATOR: u8 = 1;
pub const MAX_NUMERATOR: u8 = 32;
/// Valid denominators are powers of two up to 32, matching the
/// convention used by every major DAW (1, 2, 4, 8, 16, 32).
pub const DEFAULT_NUMERATOR: u8 = 4;
pub const DEFAULT_DENOMINATOR: u8 = 4;

fn is_valid_denominator(den: u8) -> bool {
    matches!(den, 1 | 2 | 4 | 8 | 16 | 32)
}

/// Errors from constructing a [`TimeSignatureMap`] with invalid
/// input.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TimeSignatureMapError {
    Empty,
    NotSortedOrDuplicate,
    MissingAnchor,
    /// The event count exceeds [`MAX_TIME_SIGNATURE_EVENTS`]. Bounds
    /// the worst-case scan on `signature_at`.
    TooManyEvents(usize),
}

/// Upper bound on the number of events in a single time-signature
/// map. 256 is an order-of-magnitude bigger than any realistic song
/// needs (one signature change per bar for a 256-bar piece), and
/// keeps `signature_at`'s worst-case scan small.
pub const MAX_TIME_SIGNATURE_EVENTS: usize = 256;

/// A time-signature map with the same invariants as
/// [`super::tempo_map::TempoMap`]:
/// 1. Non-empty.
/// 2. Strictly sorted by `at_sample`.
/// 3. Anchored at sample 0.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TimeSignatureMap {
    events: Vec<TimeSignatureEvent>,
}

impl TimeSignatureMap {
    /// Constant-signature map anchored at sample 0.
    pub fn new_constant(numerator: u8, denominator: u8) -> Self {
        Self {
            events: vec![TimeSignatureEvent::new(0, numerator, denominator)],
        }
    }

    /// Validated constructor.
    ///
    /// **Numerator/denominator normalization**: every incoming event
    /// is re-run through [`TimeSignatureEvent::new`], so a raw
    /// deserialized payload with `numerator: 0` / a non-power-of-two
    /// denominator is silently snapped to `4/4` instead of reaching
    /// the audio thread with advertised-invariant-violating values.
    /// This matters because the serde boundary otherwise bypasses
    /// the `TimeSignatureEvent::new` constructor (found by codex
    /// review on PR #1711).
    pub fn try_new(events: Vec<TimeSignatureEvent>) -> Result<Self, TimeSignatureMapError> {
        if events.is_empty() {
            return Err(TimeSignatureMapError::Empty);
        }
        if events.len() > MAX_TIME_SIGNATURE_EVENTS {
            return Err(TimeSignatureMapError::TooManyEvents(events.len()));
        }
        if events[0].at_sample != 0 {
            return Err(TimeSignatureMapError::MissingAnchor);
        }
        for pair in events.windows(2) {
            if pair[0].at_sample >= pair[1].at_sample {
                return Err(TimeSignatureMapError::NotSortedOrDuplicate);
            }
        }
        let normalized = events
            .into_iter()
            .map(|e| TimeSignatureEvent::new(e.at_sample, e.numerator, e.denominator))
            .collect();
        Ok(Self { events: normalized })
    }

    pub fn events(&self) -> &[TimeSignatureEvent] {
        &self.events
    }

    /// Return the `(numerator, denominator)` in effect at `sample`.
    pub fn signature_at(&self, sample: u64) -> (u8, u8) {
        for ev in self.events.iter().rev() {
            if ev.at_sample <= sample {
                return (ev.numerator, ev.denominator);
            }
        }
        // Unreachable given the anchor invariant.
        let e = self.events[0];
        (e.numerator, e.denominator)
    }
}

impl Default for TimeSignatureMap {
    /// Default: 4/4 anchored at sample 0.
    fn default() -> Self {
        Self::new_constant(DEFAULT_NUMERATOR, DEFAULT_DENOMINATOR)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_is_four_four() {
        let m = TimeSignatureMap::default();
        assert_eq!(m.signature_at(0), (4, 4));
    }

    #[test]
    fn new_constant_stores_single_anchor_event() {
        let m = TimeSignatureMap::new_constant(3, 4);
        assert_eq!(m.events().len(), 1);
        assert_eq!(m.events()[0].at_sample, 0);
        assert_eq!(m.events()[0].numerator, 3);
        assert_eq!(m.events()[0].denominator, 4);
    }

    #[test]
    fn new_constant_clamps_invalid_numerator() {
        let zero = TimeSignatureMap::new_constant(0, 4);
        assert_eq!(zero.events()[0].numerator, MIN_NUMERATOR);
        let too_high = TimeSignatureMap::new_constant(99, 4);
        assert_eq!(too_high.events()[0].numerator, MAX_NUMERATOR);
    }

    #[test]
    fn new_constant_snaps_invalid_denominator_to_four() {
        let m = TimeSignatureMap::new_constant(4, 7); // 7 is not power of two
        assert_eq!(m.events()[0].denominator, 4);
    }

    #[test]
    fn new_constant_accepts_all_power_of_two_denominators() {
        for den in [1, 2, 4, 8, 16, 32] {
            let m = TimeSignatureMap::new_constant(4, den);
            assert_eq!(m.events()[0].denominator, den);
        }
    }

    #[test]
    fn try_new_rejects_empty() {
        assert_eq!(
            TimeSignatureMap::try_new(vec![]),
            Err(TimeSignatureMapError::Empty)
        );
    }

    #[test]
    fn try_new_rejects_missing_anchor() {
        let events = vec![TimeSignatureEvent::new(48_000, 3, 4)];
        assert_eq!(
            TimeSignatureMap::try_new(events),
            Err(TimeSignatureMapError::MissingAnchor)
        );
    }

    #[test]
    fn try_new_rejects_duplicates() {
        let events = vec![
            TimeSignatureEvent::new(0, 4, 4),
            TimeSignatureEvent::new(48_000, 3, 4),
            TimeSignatureEvent::new(48_000, 5, 4),
        ];
        assert_eq!(
            TimeSignatureMap::try_new(events),
            Err(TimeSignatureMapError::NotSortedOrDuplicate)
        );
    }

    #[test]
    fn signature_at_returns_current_segment() {
        let map = TimeSignatureMap::try_new(vec![
            TimeSignatureEvent::new(0, 4, 4),
            TimeSignatureEvent::new(48_000, 3, 4),
            TimeSignatureEvent::new(96_000, 7, 8),
        ])
        .unwrap();
        assert_eq!(map.signature_at(0), (4, 4));
        assert_eq!(map.signature_at(47_999), (4, 4));
        assert_eq!(map.signature_at(48_000), (3, 4), "boundary inclusive");
        assert_eq!(map.signature_at(96_000), (7, 8));
        assert_eq!(map.signature_at(u64::MAX), (7, 8));
    }

    #[test]
    fn wire_format_is_camel_case() {
        let ev = TimeSignatureEvent::new(48_000, 3, 4);
        let json = serde_json::to_string(&ev).unwrap();
        assert!(
            json.contains("\"atSample\":48000"),
            "wire format should be camelCase; got {json}"
        );
        assert!(json.contains("\"numerator\":3"));
        assert!(json.contains("\"denominator\":4"));
        let back: TimeSignatureEvent = serde_json::from_str(&json).unwrap();
        assert_eq!(back, ev);
    }

    // ── Codex P2 regression: serde-bypass numerator/denominator ──────

    #[test]
    fn try_new_normalizes_bypass_values() {
        // A crafted JSON payload could construct TimeSignatureEvent
        // with numerator=0 or a non-power-of-two denominator,
        // bypassing TimeSignatureEvent::new's clamp. try_new must
        // still normalize via the constructor.
        let raw = vec![
            TimeSignatureEvent { at_sample: 0, numerator: 0, denominator: 5 },
            TimeSignatureEvent { at_sample: 48_000, numerator: 99, denominator: 4 },
        ];
        let map = TimeSignatureMap::try_new(raw).expect("must accept and normalize");
        // 0 numerator → clamped to MIN_NUMERATOR (1).
        assert_eq!(map.events()[0].numerator, MIN_NUMERATOR);
        // 5 is not a valid denominator → snapped to 4.
        assert_eq!(map.events()[0].denominator, 4);
        // 99 clamped to MAX_NUMERATOR.
        assert_eq!(map.events()[1].numerator, MAX_NUMERATOR);
    }

    #[test]
    fn try_new_rejects_too_many_events() {
        let too_many: Vec<TimeSignatureEvent> = (0..MAX_TIME_SIGNATURE_EVENTS + 1)
            .map(|i| TimeSignatureEvent::new((i as u64) * 48_000, 4, 4))
            .collect();
        match TimeSignatureMap::try_new(too_many) {
            Err(TimeSignatureMapError::TooManyEvents(n)) => {
                assert_eq!(n, MAX_TIME_SIGNATURE_EVENTS + 1);
            }
            other => panic!("expected TooManyEvents, got {other:?}"),
        }
    }

    #[test]
    fn serde_round_trip_preserves_events() {
        let map = TimeSignatureMap::try_new(vec![
            TimeSignatureEvent::new(0, 4, 4),
            TimeSignatureEvent::new(48_000, 7, 8),
        ])
        .unwrap();
        let json = serde_json::to_string(&map).unwrap();
        let back: TimeSignatureMap = serde_json::from_str(&json).unwrap();
        assert_eq!(back, map);
    }
}
